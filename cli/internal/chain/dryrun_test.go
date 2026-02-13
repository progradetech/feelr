package chain

import (
	"strings"
	"testing"
)

// --- Valid chain dry-run ---

func TestDryRun_ValidChain(t *testing.T) {
	ch := &Chain{
		Name:        "test-dry-run",
		Description: "Test chain for dry-run",
		Params: []Param{
			{Name: "repo", Type: "string", Required: true},
			{Name: "channel", Type: "string", Required: false, Default: "general"},
		},
		Steps: []Step{
			{
				ID:   "fetch",
				Uses: "github/issues.list",
				With: map[string]string{
					"repo": "${{ params.repo }}",
				},
			},
			{
				ID:   "notify",
				Uses: "slack/messages.send",
				With: map[string]string{
					"channel": "${{ params.channel }}",
					"text":    "Found issue #${{ steps.fetch.number }}",
				},
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	result := DryRun(ch, map[string]string{"repo": "owner/repo"})

	if !result.Valid {
		t.Fatalf("expected valid dry-run, got errors: %v", result.Errors)
	}
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(result.Steps))
	}

	// Check first step.
	s1 := result.Steps[0]
	if s1.ID != "fetch" {
		t.Errorf("expected step ID 'fetch', got %q", s1.ID)
	}
	if s1.Connector != "github" || s1.Action != "issues.list" {
		t.Errorf("expected github/issues.list, got %s/%s", s1.Connector, s1.Action)
	}
	if s1.ResolvedParams["repo"] != "owner/repo" {
		t.Errorf("expected repo=owner/repo, got %q", s1.ResolvedParams["repo"])
	}
	if s1.WouldSkip {
		t.Error("step 1 should not skip")
	}

	// Check second step: template should resolve with mock data.
	s2 := result.Steps[1]
	if s2.ID != "notify" {
		t.Errorf("expected step ID 'notify', got %q", s2.ID)
	}
	if s2.ResolvedParams["channel"] != "general" {
		t.Errorf("expected channel=general (default), got %q", s2.ResolvedParams["channel"])
	}
	// Mock github output has number=42.
	if s2.ResolvedParams["text"] != "Found issue #42" {
		t.Errorf("expected 'Found issue #42', got %q", s2.ResolvedParams["text"])
	}
}

// --- Missing required param ---

func TestDryRun_MissingRequiredParam(t *testing.T) {
	ch := &Chain{
		Name: "missing-param",
		Params: []Param{
			{Name: "repo", Type: "string", Required: true},
		},
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	result := DryRun(ch, map[string]string{})

	if result.Valid {
		t.Error("expected invalid result for missing required param")
	}
	if len(result.Errors) == 0 {
		t.Error("expected at least one error")
	}
	found := false
	for _, e := range result.Errors {
		if strings.Contains(e, "missing required param") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'missing required param' error, got: %v", result.Errors)
	}
}

// --- Conditional step ---

func TestDryRun_ConditionalStep(t *testing.T) {
	ch := &Chain{
		Name: "conditional",
		Steps: []Step{
			{ID: "step1", Uses: "github/issues.list"},
			{
				ID:   "step2",
				Uses: "slack/messages.send",
				If:   "${{ steps.step1.number }} > 100",
			},
			{
				ID:   "step3",
				Uses: "discord/messages.send",
				If:   "${{ steps.step1.number }} > 0",
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	result := DryRun(ch, map[string]string{})

	if !result.Valid {
		t.Fatalf("expected valid, got errors: %v", result.Errors)
	}
	if len(result.Steps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(result.Steps))
	}

	// step2 condition: 42 > 100 -> false -> would skip.
	if !result.Steps[1].WouldSkip {
		t.Error("expected step2 to be skipped (42 > 100 is false)")
	}
	if result.Steps[1].Condition != "${{ steps.step1.number }} > 100" {
		t.Errorf("expected condition preserved, got %q", result.Steps[1].Condition)
	}

	// step3 condition: 42 > 0 -> true -> would not skip.
	if result.Steps[2].WouldSkip {
		t.Error("expected step3 to run (42 > 0 is true)")
	}
}

// --- Invalid chain ---

func TestDryRun_InvalidChain(t *testing.T) {
	ch := &Chain{
		Name:  "", // Name is required.
		Steps: []Step{},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	result := DryRun(ch, map[string]string{})

	if result.Valid {
		t.Error("expected invalid result for empty-name chain")
	}
	if len(result.Errors) == 0 {
		t.Error("expected validation errors")
	}
}

// --- Mock output for all connectors ---

func TestMockStepOutput_AllConnectors(t *testing.T) {
	connectors := []struct {
		name     string
		expected []string
	}{
		{"github", []string{"number", "title", "state", "html_url"}},
		{"slack", []string{"ok", "channel", "ts"}},
		{"stripe", []string{"amount", "currency", "status"}},
		{"discord", []string{"id", "content", "channel_id"}},
		{"unknown", []string{"id", "status", "data"}},
	}

	for _, tc := range connectors {
		t.Run(tc.name, func(t *testing.T) {
			output := MockStepOutput(tc.name)
			for _, key := range tc.expected {
				if _, ok := output[key]; !ok {
					t.Errorf("mock output for %q missing key %q", tc.name, key)
				}
			}
		})
	}
}

// --- FormatDryRun output ---

func TestFormatDryRun_ContainsExpectedSections(t *testing.T) {
	ch := &Chain{
		Name: "format-test",
		Params: []Param{
			{Name: "repo", Type: "string", Required: true},
		},
		Steps: []Step{
			{
				ID:   "step1",
				Uses: "github/issues.list",
				With: map[string]string{"repo": "${{ params.repo }}"},
			},
		},
		Retry: RetryPolicy{MaxAttempts: 3, DelaySeconds: 5},
	}

	result := DryRun(ch, map[string]string{"repo": "test/repo"})
	output := FormatDryRun(ch, result)

	checks := []string{
		"Dry Run: format-test (1 steps)",
		"===",
		"Parameters:",
		"repo",
		"Execution Plan:",
		"Step 1 [step1]:",
		"github/issues.list",
		"Retry Policy: 3 attempts, 5s delay",
		"VALID",
	}

	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("expected output to contain %q, got:\n%s", check, output)
		}
	}
}

// --- Dry-run with skipped step resolves empty for subsequent steps ---

func TestDryRun_SkippedStepResolvesEmpty(t *testing.T) {
	ch := &Chain{
		Name: "skip-resolve",
		Steps: []Step{
			{
				ID:   "step1",
				Uses: "github/issues.list",
				If:   "false",
			},
			{
				ID:   "step2",
				Uses: "slack/messages.send",
				With: map[string]string{
					"text": "Ref: ${{ steps.step1.number }}",
				},
			},
		},
		Retry: RetryPolicy{MaxAttempts: 1},
	}

	result := DryRun(ch, map[string]string{})

	if !result.Valid {
		t.Fatalf("expected valid, got errors: %v", result.Errors)
	}

	// step1 is skipped, so steps.step1.number resolves to "".
	if result.Steps[1].ResolvedParams["text"] != "Ref: " {
		t.Errorf("expected 'Ref: ' (empty ref from skipped step), got %q", result.Steps[1].ResolvedParams["text"])
	}
}
