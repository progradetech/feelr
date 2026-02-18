package chain

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

// validParamTypes is the set of allowed parameter type values.
var validParamTypes = map[string]bool{
	"string":  true,
	"number":  true,
	"boolean": true,
}

// LoadChain reads a chain definition file from disk and returns a validated Chain.
// File format is detected by extension: .yaml/.yml for YAML, .json for JSON.
func LoadChain(path string) (*Chain, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading chain file: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(path))
	var format string
	switch ext {
	case ".yaml", ".yml":
		format = "yaml"
	case ".json":
		format = "json"
	default:
		return nil, fmt.Errorf("unsupported file extension %q: use .yaml, .yml, or .json", ext)
	}

	return LoadChainFromBytes(data, format)
}

// LoadChainFromBytes parses chain definition bytes in the given format ("yaml" or "json")
// and returns a validated Chain.
func LoadChainFromBytes(data []byte, format string) (*Chain, error) {
	var chain Chain

	switch format {
	case "yaml":
		if err := yaml.Unmarshal(data, &chain); err != nil {
			return nil, fmt.Errorf("parsing YAML: %w", err)
		}
	case "json":
		if err := json.Unmarshal(data, &chain); err != nil {
			return nil, fmt.Errorf("parsing JSON: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported format %q: use \"yaml\" or \"json\"", format)
	}

	applyDefaults(&chain)

	if err := ValidateChain(&chain); err != nil {
		return nil, err
	}

	return &chain, nil
}

// applyDefaults sets default values for zero-valued fields.
func applyDefaults(chain *Chain) {
	if chain.Retry.MaxAttempts == 0 {
		chain.Retry.MaxAttempts = 1
	}
}

// ValidateChain checks that a Chain definition meets all constraints.
// Returns a descriptive error identifying the offending field and step.
func ValidateChain(chain *Chain) error {
	// Name validation
	if chain.Name == "" {
		return fmt.Errorf("validation: chain name is required")
	}
	if len(chain.Name) > MaxChainName {
		return fmt.Errorf("validation: chain name exceeds %d characters", MaxChainName)
	}

	// Step count validation
	if len(chain.Steps) == 0 {
		return fmt.Errorf("validation: chain must have at least 1 step")
	}
	if len(chain.Steps) > MaxSteps {
		return fmt.Errorf("validation: chain has %d steps, maximum is %d", len(chain.Steps), MaxSteps)
	}

	// Step validation
	seenIDs := make(map[string]bool)
	for i, step := range chain.Steps {
		if step.ID == "" {
			return fmt.Errorf("validation: step[%d] id is required", i)
		}
		if seenIDs[step.ID] {
			return fmt.Errorf("validation: step[%d] duplicate id %q", i, step.ID)
		}
		seenIDs[step.ID] = true

		if step.Uses == "" {
			return fmt.Errorf("validation: step[%d] %q uses is required", i, step.ID)
		}
		parts := strings.SplitN(step.Uses, "/", 3)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return fmt.Errorf("validation: step[%d] %q uses %q must be in connector/action format", i, step.ID, step.Uses)
		}

		// Forward reference check in if expressions
		if step.If != "" {
			if err := checkForwardReferences(step.If, seenIDs, i, step.ID); err != nil {
				return err
			}
		}
	}

	// Param validation
	for i, param := range chain.Params {
		if param.Name == "" {
			return fmt.Errorf("validation: param[%d] name is required", i)
		}
		if !validParamTypes[param.Type] {
			return fmt.Errorf("validation: param[%d] %q type %q must be one of: string, number, boolean", i, param.Name, param.Type)
		}
	}

	// Retry validation
	if chain.Retry.MaxAttempts < 1 {
		return fmt.Errorf("validation: retry max_attempts must be >= 1, got %d", chain.Retry.MaxAttempts)
	}
	if chain.Retry.DelaySeconds < 0 {
		return fmt.Errorf("validation: retry delay_seconds must be >= 0, got %d", chain.Retry.DelaySeconds)
	}

	return nil
}

// checkForwardReferences inspects an if expression for steps.X references and
// ensures that X is defined before the current step (no forward references).
func checkForwardReferences(expr string, seenIDs map[string]bool, stepIndex int, stepID string) error {
	// Look for patterns like steps.some_id in the expression
	parts := strings.Fields(expr)
	for _, part := range parts {
		// Also handle cases where steps.X is embedded in operators like steps.X.status
		tokens := strings.Split(part, "==")
		for _, token := range tokens {
			token = strings.TrimSpace(token)
			token = strings.Trim(token, "'\"()")
			if strings.HasPrefix(token, "steps.") {
				refParts := strings.SplitN(token[len("steps."):], ".", 2)
				refID := refParts[0]
				if refID == "" {
					continue
				}
				if !seenIDs[refID] {
					return fmt.Errorf("validation: step[%d] %q if expression references undefined or forward step %q", stepIndex, stepID, refID)
				}
			}
		}
	}
	return nil
}
