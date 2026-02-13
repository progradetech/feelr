package chain

import (
	"fmt"
	"strings"
)

// DryRunStep holds the simulated execution details for one step.
type DryRunStep struct {
	ID              string
	Connector       string
	Action          string
	ResolvedParams  map[string]string
	Condition       string
	ConditionResult bool
	WouldSkip       bool
}

// DryRunResult holds the complete dry-run analysis of a chain.
type DryRunResult struct {
	Valid  bool
	Errors []string
	Steps  []DryRunStep
}

// DryRun validates a chain definition, resolves templates against mock data,
// and produces an execution plan without calling any external services.
func DryRun(chain *Chain, params map[string]string) *DryRunResult {
	result := &DryRunResult{Valid: true}

	// 1. Validate the chain definition.
	if err := ValidateChain(chain); err != nil {
		result.Valid = false
		result.Errors = append(result.Errors, err.Error())
		return result
	}

	// 2. Validate and apply param defaults.
	resolved, err := validateChainParams(chain.Params, params)
	if err != nil {
		result.Valid = false
		result.Errors = append(result.Errors, err.Error())
		return result
	}

	// 3. Build mock resolve context.
	ctx := &ResolveContext{
		Params: resolved,
		Steps:  make(map[string]interface{}),
	}

	// 4. Walk each step, generate mock output, resolve templates, evaluate conditions.
	for _, step := range chain.Steps {
		connector, action, parseErr := parseUses(step.Uses)
		if parseErr != nil {
			result.Valid = false
			result.Errors = append(result.Errors, fmt.Sprintf("step %q: %s", step.ID, parseErr))
			return result
		}

		ds := DryRunStep{
			ID:        step.ID,
			Connector: connector,
			Action:    action,
		}

		// Evaluate condition if present.
		ds.Condition = step.If
		if step.If != "" {
			condResult, condErr := EvalCondition(step.If, ctx)
			if condErr != nil {
				ds.ConditionResult = false
				ds.WouldSkip = true
				result.Errors = append(result.Errors, fmt.Sprintf("step %q condition error: %s", step.ID, condErr))
			} else {
				ds.ConditionResult = condResult
				ds.WouldSkip = !condResult
			}
		} else {
			ds.ConditionResult = true
			ds.WouldSkip = false
		}

		// Resolve template params using current context (mock data from prior steps).
		ds.ResolvedParams = ResolveStepWith(step.With, ctx)

		// Store mock output in context for subsequent steps (unless skipped).
		if !ds.WouldSkip {
			ctx.Steps[step.ID] = MockStepOutput(connector)
		} else {
			ctx.Steps[step.ID] = nil
		}

		result.Steps = append(result.Steps, ds)
	}

	return result
}

// MockStepOutput generates plausible mock data for a given connector.
// This allows template resolution in dry-run mode to produce realistic output.
func MockStepOutput(connector string) map[string]interface{} {
	switch connector {
	case "github":
		return map[string]interface{}{
			"number":   float64(42),
			"title":    "Example issue title",
			"state":    "open",
			"html_url": "https://github.com/owner/repo/issues/42",
			"body":     "Example body text",
			"user":     map[string]interface{}{"login": "example-user"},
		}
	case "slack":
		return map[string]interface{}{
			"ok":      true,
			"channel": "C0123456789",
			"ts":      "1234567890.123456",
			"message": map[string]interface{}{"text": "Example message"},
		}
	case "stripe":
		return map[string]interface{}{
			"id":       "evt_mock123",
			"amount":   float64(2500),
			"currency": "usd",
			"status":   "succeeded",
			"customer": "cus_mock456",
		}
	case "discord":
		return map[string]interface{}{
			"id":         "123456789012345678",
			"content":    "Example discord message",
			"channel_id": "987654321098765432",
			"author":     map[string]interface{}{"username": "example-bot"},
		}
	default:
		return map[string]interface{}{
			"id":     "mock-id",
			"status": "ok",
			"data":   "mock-data",
		}
	}
}

// FormatDryRun writes a human-readable execution plan to a string builder.
// Output goes to stderr in CLI usage (data to stdout philosophy).
func FormatDryRun(chain *Chain, result *DryRunResult) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("Dry Run: %s (%d steps)\n", chain.Name, len(chain.Steps)))
	sb.WriteString("===\n")

	// Show parameters.
	if len(chain.Params) > 0 {
		sb.WriteString("\nParameters:\n")
		for _, p := range chain.Params {
			req := "optional"
			if p.Required {
				req = "required"
			}
			val := ""
			// Find resolved value from first step context or show default.
			if len(result.Steps) > 0 {
				for _, ds := range result.Steps {
					if v, ok := ds.ResolvedParams[p.Name]; ok {
						val = v
						break
					}
				}
			}
			if val == "" && p.Default != "" {
				val = p.Default
			}
			if val != "" {
				sb.WriteString(fmt.Sprintf("  %s (%s, %s) = %q\n", p.Name, p.Type, req, val))
			} else {
				sb.WriteString(fmt.Sprintf("  %s (%s, %s)\n", p.Name, p.Type, req))
			}
		}
	}

	// Show execution plan.
	sb.WriteString("\nExecution Plan:\n")
	for i, ds := range result.Steps {
		prefix := fmt.Sprintf("  Step %d [%s]:", i+1, ds.ID)
		sb.WriteString(fmt.Sprintf("%s %s/%s\n", prefix, ds.Connector, ds.Action))

		if ds.Condition != "" {
			skipLabel := "will run"
			if ds.WouldSkip {
				skipLabel = "WOULD SKIP"
			}
			sb.WriteString(fmt.Sprintf("    Condition: %s -> %s\n", ds.Condition, skipLabel))
		}

		if len(ds.ResolvedParams) > 0 {
			sb.WriteString("    Params:\n")
			for k, v := range ds.ResolvedParams {
				sb.WriteString(fmt.Sprintf("      %s = %q\n", k, v))
			}
		}
	}

	// Show retry policy.
	if chain.Retry.MaxAttempts > 1 {
		sb.WriteString(fmt.Sprintf("\nRetry Policy: %d attempts, %ds delay\n",
			chain.Retry.MaxAttempts, chain.Retry.DelaySeconds))
	}

	// Show errors if any (non-fatal warnings from condition eval, etc.).
	if len(result.Errors) > 0 {
		sb.WriteString("\nWarnings:\n")
		for _, e := range result.Errors {
			sb.WriteString(fmt.Sprintf("  - %s\n", e))
		}
	}

	if result.Valid {
		sb.WriteString("\nResult: VALID - chain would execute successfully\n")
	} else {
		sb.WriteString("\nResult: INVALID - chain has errors that prevent execution\n")
	}

	return sb.String()
}
