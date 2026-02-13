package chain

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// templatePattern matches ${{ expression }} with optional whitespace inside braces.
var templatePattern = regexp.MustCompile(`\$\{\{\s*(.+?)\s*\}\}`)

// ResolveContext holds the runtime data available for template resolution.
// Params: user-provided runtime parameters (map[string]string).
// Steps: outputs from previously executed steps (map[string]interface{} keyed by step ID).
type ResolveContext struct {
	Params map[string]string
	Steps  map[string]interface{}
}

// ResolveTemplate resolves all ${{ expression }} templates in the given string
// against the provided context. Missing data resolves to empty string.
func ResolveTemplate(template string, ctx *ResolveContext) string {
	if ctx == nil {
		return templatePattern.ReplaceAllString(template, "")
	}

	return templatePattern.ReplaceAllStringFunc(template, func(match string) string {
		// Extract the inner expression (trim ${{ and }}, plus whitespace).
		sub := templatePattern.FindStringSubmatch(match)
		if len(sub) < 2 {
			return ""
		}
		expr := strings.TrimSpace(sub[1])
		return resolveExpression(expr, ctx)
	})
}

// ResolveStepWith resolves all template expressions in a step's With map,
// returning a new map with all values resolved.
func ResolveStepWith(with map[string]string, ctx *ResolveContext) map[string]string {
	if with == nil {
		return nil
	}
	resolved := make(map[string]string, len(with))
	for k, v := range with {
		resolved[k] = ResolveTemplate(v, ctx)
	}
	return resolved
}

// resolveExpression handles a single expression which may contain a null coalescing operator.
func resolveExpression(expr string, ctx *ResolveContext) string {
	// Check for null coalescing: split on " ?? "
	if idx := strings.Index(expr, " ?? "); idx >= 0 {
		path := strings.TrimSpace(expr[:idx])
		fallback := strings.TrimSpace(expr[idx+4:])
		// Strip surrounding quotes from fallback (single or double).
		fallback = stripQuotes(fallback)

		val := resolvePath(path, ctx)
		if val == "" {
			return fallback
		}
		return val
	}

	return resolvePath(expr, ctx)
}

// stripQuotes removes surrounding single or double quotes from a string.
func stripQuotes(s string) string {
	if len(s) >= 2 {
		if (s[0] == '\'' && s[len(s)-1] == '\'') || (s[0] == '"' && s[len(s)-1] == '"') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// resolvePath resolves a dot-notation path against the context.
// Paths start with a namespace: "params" or "steps".
func resolvePath(path string, ctx *ResolveContext) string {
	segments := parsePath(path)
	if len(segments) < 2 {
		return ""
	}

	namespace := segments[0]
	rest := segments[1:]

	switch namespace {
	case "params":
		return resolveParams(rest, ctx)
	case "steps":
		return resolveSteps(rest, ctx)
	default:
		return ""
	}
}

// resolveParams looks up a param value. Only single-segment keys are supported.
func resolveParams(segments []string, ctx *ResolveContext) string {
	if ctx.Params == nil || len(segments) == 0 {
		return ""
	}
	key := segments[0]
	val, ok := ctx.Params[key]
	if !ok {
		return ""
	}
	return val
}

// resolveSteps navigates step output data using remaining path segments.
func resolveSteps(segments []string, ctx *ResolveContext) string {
	if ctx.Steps == nil || len(segments) == 0 {
		return ""
	}

	// First segment is the step ID.
	stepID := segments[0]
	data, ok := ctx.Steps[stepID]
	if !ok {
		return ""
	}

	// Navigate remaining segments into the step data.
	if len(segments) == 1 {
		return stringify(data)
	}

	val := walkPath(data, segments[1:])
	if val == nil {
		return ""
	}
	return stringify(val)
}

// walkPath navigates a nested data structure using path segments.
// Supports map key access and array index access via [N] notation.
func walkPath(data interface{}, segments []string) interface{} {
	current := data
	for _, seg := range segments {
		if current == nil {
			return nil
		}

		// Check for array index: segment starts with [
		if strings.HasPrefix(seg, "[") && strings.HasSuffix(seg, "]") {
			idxStr := seg[1 : len(seg)-1]
			idx, err := strconv.Atoi(idxStr)
			if err != nil {
				return nil
			}
			arr, ok := current.([]interface{})
			if !ok || idx < 0 || idx >= len(arr) {
				return nil
			}
			current = arr[idx]
			continue
		}

		// Map key access.
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil
		}
		val, exists := m[seg]
		if !exists {
			return nil
		}
		current = val
	}
	return current
}

// parsePath splits a dotted path like "steps.create.data[0].title" into
// ["steps", "create", "data", "[0]", "title"], handling bracket notation.
func parsePath(path string) []string {
	var segments []string
	var current strings.Builder

	for i := 0; i < len(path); i++ {
		ch := path[i]
		switch ch {
		case '.':
			if current.Len() > 0 {
				segments = append(segments, current.String())
				current.Reset()
			}
		case '[':
			// Flush anything before the bracket as its own segment.
			if current.Len() > 0 {
				segments = append(segments, current.String())
				current.Reset()
			}
			// Collect everything through the closing bracket as a segment.
			current.WriteByte('[')
			for i++; i < len(path); i++ {
				current.WriteByte(path[i])
				if path[i] == ']' {
					break
				}
			}
			segments = append(segments, current.String())
			current.Reset()
		default:
			current.WriteByte(ch)
		}
	}
	if current.Len() > 0 {
		segments = append(segments, current.String())
	}
	return segments
}

// stringify converts a value to its string representation.
func stringify(val interface{}) string {
	if val == nil {
		return ""
	}
	switch v := val.(type) {
	case string:
		return v
	case float64:
		// Format integers without decimal point.
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", val)
	}
}
