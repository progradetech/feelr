package chain

import (
	"fmt"
	"strings"
	"time"
)

// ActionRunner is the function signature for executing a single connector action.
// The executor calls this for each step. CLI provides a runner that calls the gateway;
// gateway provides a runner that calls action.handler() directly.
type ActionRunner func(connector, action string, params map[string]string) (map[string]interface{}, error)

// StepResult holds the output of a single step execution.
type StepResult struct {
	StepID   string
	Output   map[string]interface{}
	Skipped  bool
	Error    error
	Duration time.Duration
}

// ChainResult holds the complete chain execution result.
type ChainResult struct {
	Steps   []StepResult
	Success bool
}

// ExecuteOpts configures chain execution.
type ExecuteOpts struct {
	Chain   *Chain
	Params  map[string]string
	Runner  ActionRunner
	OnStep  func(stepID string, status string)
	Verbose bool
}

// Execute runs all steps in the chain sequentially, passing output from each step
// to subsequent steps via ResolveContext. It evaluates conditions, applies retry
// policy, and halts on step failure after retries are exhausted.
func Execute(opts ExecuteOpts) (*ChainResult, error) {
	chain := opts.Chain
	if chain == nil {
		return nil, fmt.Errorf("chain is nil")
	}
	if opts.Runner == nil {
		return nil, fmt.Errorf("runner is nil")
	}

	// Validate required params and apply defaults.
	params, err := validateChainParams(chain.Params, opts.Params)
	if err != nil {
		return nil, err
	}

	// Initialize resolve context.
	ctx := &ResolveContext{
		Params: params,
		Steps:  make(map[string]interface{}),
	}

	// Determine retry settings. Default to 1 attempt (no retry) if unset.
	maxAttempts := chain.Retry.MaxAttempts
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	delaySeconds := chain.Retry.DelaySeconds

	result := &ChainResult{
		Steps:   make([]StepResult, 0, len(chain.Steps)),
		Success: true,
	}

	for _, step := range chain.Steps {
		stepResult := executeStep(step, ctx, opts.Runner, maxAttempts, delaySeconds)

		// Store output in context for subsequent steps (nil for skipped/failed).
		if stepResult.Skipped || stepResult.Error != nil {
			ctx.Steps[step.ID] = nil
		} else {
			ctx.Steps[step.ID] = stepResult.Output
		}

		result.Steps = append(result.Steps, stepResult)

		// Notify callback if set.
		if opts.OnStep != nil {
			status := "complete"
			if stepResult.Skipped {
				status = "skipped"
			}
			if stepResult.Error != nil {
				status = "failed"
			}
			opts.OnStep(step.ID, status)
		}

		// Halt chain on step failure.
		if stepResult.Error != nil {
			result.Success = false
			return result, nil
		}
	}

	return result, nil
}

// validateChainParams validates required params are present and applies defaults for optional params.
func validateChainParams(defs []Param, provided map[string]string) (map[string]string, error) {
	resolved := make(map[string]string)

	// Copy all provided params.
	for k, v := range provided {
		resolved[k] = v
	}

	// Check required params and apply defaults.
	for _, p := range defs {
		if _, ok := resolved[p.Name]; ok {
			continue
		}
		if p.Required {
			return nil, fmt.Errorf("missing required param: %s", p.Name)
		}
		if p.Default != "" {
			resolved[p.Name] = p.Default
		}
	}

	return resolved, nil
}

// executeStep runs a single step with condition check and retry logic.
func executeStep(step Step, ctx *ResolveContext, runner ActionRunner, maxAttempts, delaySeconds int) StepResult {
	start := time.Now()

	// Evaluate condition if present.
	if step.If != "" {
		condResult, err := EvalCondition(step.If, ctx)
		if err != nil {
			return StepResult{
				StepID:   step.ID,
				Error:    fmt.Errorf("condition evaluation failed: %w", err),
				Duration: time.Since(start),
			}
		}
		if !condResult {
			return StepResult{
				StepID:   step.ID,
				Skipped:  true,
				Duration: time.Since(start),
			}
		}
	}

	// Resolve step With params using current context.
	resolvedWith := ResolveStepWith(step.With, ctx)

	// Parse connector/action from Uses field.
	connector, action, err := parseUses(step.Uses)
	if err != nil {
		return StepResult{
			StepID:   step.ID,
			Error:    err,
			Duration: time.Since(start),
		}
	}

	// Execute with retry.
	var output map[string]interface{}
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		output, lastErr = runner(connector, action, resolvedWith)
		if lastErr == nil {
			break
		}
		// If more attempts remain, wait before retrying.
		if attempt < maxAttempts && delaySeconds > 0 {
			time.Sleep(time.Duration(delaySeconds) * time.Second)
		}
	}

	if lastErr != nil {
		return StepResult{
			StepID:   step.ID,
			Error:    fmt.Errorf("step %q failed after %d attempt(s): %w", step.ID, maxAttempts, lastErr),
			Duration: time.Since(start),
		}
	}

	return StepResult{
		StepID:   step.ID,
		Output:   output,
		Duration: time.Since(start),
	}
}

// parseUses splits a Uses string like "github/issues.list" into connector and action.
func parseUses(uses string) (connector, action string, err error) {
	idx := strings.Index(uses, "/")
	if idx < 0 {
		return "", "", fmt.Errorf("invalid uses format %q: expected connector/action", uses)
	}
	connector = uses[:idx]
	action = uses[idx+1:]
	if connector == "" || action == "" {
		return "", "", fmt.Errorf("invalid uses format %q: empty connector or action", uses)
	}
	return connector, action, nil
}
