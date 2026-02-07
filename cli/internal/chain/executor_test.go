package chain

import (
	"fmt"
	"sync/atomic"
	"testing"
)

// --- Helper: simple mock runner ---

func mockRunner(responses map[string]map[string]interface{}) ActionRunner {
	return func(connector, action string, params map[string]string) (map[string]interface{}, error) {
		key := connector + "/" + action
		resp, ok := responses[key]
		if !ok {
			return nil, fmt.Errorf("unknown action: %s", key)
		}
		return resp, nil
	}
}

// --- Basic execution ---

func TestExecute_TwoStepChain(t *testing.T) {
	ch := &Chain{
		Name: "test-chain",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
			{ID: "step2", Uses: "slack/messages.send"},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := mockRunner(map[string]map[string]interface{}{
		"github/issues.list":  {"count": float64(5)},
		"slack/messages.send": {"ok": true},
	})

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 step results, got %d", len(result.Steps))
	}
	if result.Steps[0].StepID != "step1" {
		t.Errorf("expected step1, got %s", result.Steps[0].StepID)
	}
	if result.Steps[1].StepID != "step2" {
		t.Errorf("expected step2, got %s", result.Steps[1].StepID)
	}
}

// --- Data passing between steps ---

func TestExecute_DataPassingBetweenSteps(t *testing.T) {
	ch := &Chain{
		Name: "data-pass",
		Steps: []Step{
			{ID: "create", Uses: "github/issues.create"},
			{
				ID:   "notify",
				Uses: "slack/messages.send",
				With: map[string]string{
					"text": "Created issue #${{ steps.create.number }}",
				},
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	var capturedParams map[string]string

	runner := func(connector, action string, params map[string]string) (map[string]interface{}, error) {
		if connector == "github" {
			return map[string]interface{}{"number": float64(42), "title": "Test"}, nil
		}
		// Capture params sent to slack.
		capturedParams = params
		return map[string]interface{}{"ok": true}, nil
	}

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if capturedParams["text"] != "Created issue #42" {
		t.Errorf("expected resolved template, got %q", capturedParams["text"])
	}
}

// --- Conditional step skipped ---

func TestExecute_ConditionalStepSkipped(t *testing.T) {
	ch := &Chain{
		Name: "cond-skip",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
			{ID: "step2", Uses: "slack/messages.send", If: "0 > 1"},
			{ID: "step3", Uses: "discord/messages.send"},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := mockRunner(map[string]map[string]interface{}{
		"github/issues.list":    {"count": float64(3)},
		"slack/messages.send":   {"ok": true},
		"discord/messages.send": {"ok": true},
	})

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if len(result.Steps) != 3 {
		t.Fatalf("expected 3 step results, got %d", len(result.Steps))
	}
	if !result.Steps[1].Skipped {
		t.Error("expected step2 to be skipped")
	}
	// Step 3 should still run.
	if result.Steps[2].Skipped {
		t.Error("expected step3 to not be skipped")
	}
}

// --- Skipped step output is nil (resolves to empty) ---

func TestExecute_SkippedStepOutputNil(t *testing.T) {
	ch := &Chain{
		Name: "skip-nil",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list", If: "false"},
			{
				ID:   "step2",
				Uses: "slack/messages.send",
				With: map[string]string{
					"ref": "${{ steps.step1.value }}",
				},
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	var capturedParams map[string]string
	runner := func(connector, action string, params map[string]string) (map[string]interface{}, error) {
		capturedParams = params
		return map[string]interface{}{"ok": true}, nil
	}

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	// step1 is skipped, so steps.step1.value resolves to "".
	if capturedParams["ref"] != "" {
		t.Errorf("expected empty string for skipped step reference, got %q", capturedParams["ref"])
	}
}

// --- Required param missing ---

func TestExecute_RequiredParamMissing(t *testing.T) {
	ch := &Chain{
		Name: "param-required",
		Params: []Param{
			{Name: "repo", Type: "string", Required: true},
		},
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := mockRunner(map[string]map[string]interface{}{
		"github/issues.list": {"count": float64(0)},
	})

	_, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
		Params: map[string]string{},
	})
	if err == nil {
		t.Fatal("expected error for missing required param")
	}
	if err.Error() != "missing required param: repo" {
		t.Errorf("unexpected error message: %v", err)
	}
}

// --- Param defaults applied ---

func TestExecute_ParamDefaultApplied(t *testing.T) {
	ch := &Chain{
		Name: "param-default",
		Params: []Param{
			{Name: "branch", Type: "string", Required: false, Default: "main"},
		},
		Steps: []Step{
			{
				ID:   "step1",
				Uses: "github/issues.list",
				With: map[string]string{
					"branch": "${{ params.branch }}",
				},
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	var capturedParams map[string]string
	runner := func(connector, action string, params map[string]string) (map[string]interface{}, error) {
		capturedParams = params
		return map[string]interface{}{"ok": true}, nil
	}

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
		Params: map[string]string{}, // branch not provided, should use default.
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if capturedParams["branch"] != "main" {
		t.Errorf("expected default 'main', got %q", capturedParams["branch"])
	}
}

// --- Step failure halts chain ---

func TestExecute_StepFailureHalts(t *testing.T) {
	ch := &Chain{
		Name: "fail-halt",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
			{ID: "step2", Uses: "slack/messages.send"},
			{ID: "step3", Uses: "discord/messages.send"},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := func(connector, action string, params map[string]string) (map[string]interface{}, error) {
		if connector == "slack" {
			return nil, fmt.Errorf("slack API error")
		}
		return map[string]interface{}{"ok": true}, nil
	}

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success {
		t.Error("expected Success=false")
	}
	// Should have 2 step results (step1 success, step2 failure). Step3 not reached.
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 step results (halted at step2), got %d", len(result.Steps))
	}
	if result.Steps[0].Error != nil {
		t.Error("step1 should have no error")
	}
	if result.Steps[1].Error == nil {
		t.Error("step2 should have an error")
	}
}

// --- Retry: step fails once then succeeds ---

func TestExecute_RetrySucceeds(t *testing.T) {
	ch := &Chain{
		Name: "retry-success",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
		},
		Retry: RetryPolicy{MaxAttempts: 2, DelaySeconds: 0},
	}

	var attempts int32
	runner := func(connector, action string, params map[string]string) (map[string]interface{}, error) {
		n := atomic.AddInt32(&attempts, 1)
		if n == 1 {
			return nil, fmt.Errorf("transient error")
		}
		return map[string]interface{}{"count": float64(5)}, nil
	}

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true after retry")
	}
	if atomic.LoadInt32(&attempts) != 2 {
		t.Errorf("expected 2 attempts, got %d", atomic.LoadInt32(&attempts))
	}
}

// --- Retry exhausted: chain halts ---

func TestExecute_RetryExhausted(t *testing.T) {
	ch := &Chain{
		Name: "retry-exhausted",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
		},
		Retry: RetryPolicy{MaxAttempts: 2, DelaySeconds: 0},
	}

	var attempts int32
	runner := func(connector, action string, params map[string]string) (map[string]interface{}, error) {
		atomic.AddInt32(&attempts, 1)
		return nil, fmt.Errorf("persistent error")
	}

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success {
		t.Error("expected Success=false after retry exhaustion")
	}
	if atomic.LoadInt32(&attempts) != 2 {
		t.Errorf("expected 2 attempts, got %d", atomic.LoadInt32(&attempts))
	}
	if result.Steps[0].Error == nil {
		t.Error("expected error on step1 after retry exhaustion")
	}
}

// --- OnStep callback is invoked ---

func TestExecute_OnStepCallback(t *testing.T) {
	ch := &Chain{
		Name: "callback",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
			{ID: "step2", Uses: "slack/messages.send", If: "false"},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := mockRunner(map[string]map[string]interface{}{
		"github/issues.list":  {"count": float64(3)},
		"slack/messages.send": {"ok": true},
	})

	var callbacks []string
	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
		OnStep: func(stepID, status string) {
			callbacks = append(callbacks, stepID+":"+status)
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if len(callbacks) != 2 {
		t.Fatalf("expected 2 callbacks, got %d", len(callbacks))
	}
	if callbacks[0] != "step1:complete" {
		t.Errorf("expected step1:complete, got %s", callbacks[0])
	}
	if callbacks[1] != "step2:skipped" {
		t.Errorf("expected step2:skipped, got %s", callbacks[1])
	}
}

// --- Nil chain returns error ---

func TestExecute_NilChain(t *testing.T) {
	_, err := Execute(ExecuteOpts{
		Chain:  nil,
		Runner: func(c, a string, p map[string]string) (map[string]interface{}, error) { return nil, nil },
	})
	if err == nil {
		t.Fatal("expected error for nil chain")
	}
}

// --- Nil runner returns error ---

func TestExecute_NilRunner(t *testing.T) {
	_, err := Execute(ExecuteOpts{
		Chain: &Chain{Name: "test"},
	})
	if err == nil {
		t.Fatal("expected error for nil runner")
	}
}

// --- Invalid Uses format ---

func TestExecute_InvalidUsesFormat(t *testing.T) {
	ch := &Chain{
		Name: "bad-uses",
		Steps: []Step{
			{ID: "step1", Uses: "no-slash-here"},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := func(c, a string, p map[string]string) (map[string]interface{}, error) {
		return map[string]interface{}{}, nil
	}

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected top-level error: %v", err)
	}
	if result.Success {
		t.Error("expected Success=false for invalid Uses format")
	}
	if result.Steps[0].Error == nil {
		t.Error("expected error for invalid Uses format")
	}
}

// --- Conditional step with dynamic template ---

func TestExecute_ConditionalWithTemplate(t *testing.T) {
	ch := &Chain{
		Name: "cond-template",
		Steps: []Step{
			{ID: "check", Uses: "github/issues.list"},
			{
				ID:   "notify",
				Uses: "slack/messages.send",
				If:   "${{ steps.check.count }} > 0",
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := mockRunner(map[string]map[string]interface{}{
		"github/issues.list":  {"count": float64(5)},
		"slack/messages.send": {"ok": true},
	})

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if result.Steps[1].Skipped {
		t.Error("expected notify step to run (count > 0)")
	}
}

func TestExecute_ConditionalWithTemplateFalse(t *testing.T) {
	ch := &Chain{
		Name: "cond-template-false",
		Steps: []Step{
			{ID: "check", Uses: "github/issues.list"},
			{
				ID:   "notify",
				Uses: "slack/messages.send",
				If:   "${{ steps.check.count }} > 10",
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	runner := mockRunner(map[string]map[string]interface{}{
		"github/issues.list":  {"count": float64(5)},
		"slack/messages.send": {"ok": true},
	})

	result, err := Execute(ExecuteOpts{
		Chain:  ch,
		Runner: runner,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
	if !result.Steps[1].Skipped {
		t.Error("expected notify step to be skipped (count=5, not > 10)")
	}
}
