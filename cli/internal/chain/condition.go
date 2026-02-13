package chain

import (
	"strconv"
	"strings"
)

// EvalCondition evaluates a boolean condition expression against the given context.
// Template expressions (${{ }}) are resolved before evaluation.
// An empty expression returns true (unconditional step).
//
// Supported operators: ==, !=, >, <, >=, <=, contains, exists
// Boolean combinators: && (AND), || (OR)
// Precedence: || is lowest, && is higher, comparisons are highest.
func EvalCondition(expr string, ctx *ResolveContext) (bool, error) {
	// Resolve templates first.
	resolved := ResolveTemplate(expr, ctx)
	resolved = strings.TrimSpace(resolved)

	// Empty expression is unconditional (true).
	if resolved == "" {
		return true, nil
	}

	return evalOr(resolved)
}

// evalOr splits on " || " and returns true if any group is true.
func evalOr(expr string) (bool, error) {
	groups := strings.Split(expr, " || ")
	for _, group := range groups {
		result, err := evalAnd(strings.TrimSpace(group))
		if err != nil {
			return false, err
		}
		if result {
			return true, nil
		}
	}
	return false, nil
}

// evalAnd splits on " && " and returns true only if all terms are true.
func evalAnd(expr string) (bool, error) {
	terms := strings.Split(expr, " && ")
	for _, term := range terms {
		result, err := evalTerm(strings.TrimSpace(term))
		if err != nil {
			return false, err
		}
		if !result {
			return false, nil
		}
	}
	return true, nil
}

// evalTerm evaluates a single comparison term.
// Supports: left op right, exists value, or simple truthy.
func evalTerm(term string) (bool, error) {
	if term == "" {
		return true, nil
	}

	// Check for "exists" prefix.
	if strings.HasPrefix(term, "exists ") {
		val := strings.TrimSpace(term[7:])
		return val != "", nil
	}
	// Bare "exists" with no value.
	if term == "exists" {
		return false, nil
	}

	// Try two-character operators first (must check before single-char).
	for _, op := range []string{"==", "!=", ">=", "<="} {
		if idx := strings.Index(term, " "+op+" "); idx >= 0 {
			left := strings.TrimSpace(term[:idx])
			right := strings.TrimSpace(term[idx+len(op)+2:])
			return evalComparison(left, op, right), nil
		}
	}

	// Single-character operators (> and <) -- must not match >= or <=.
	for _, op := range []string{">", "<"} {
		if idx := strings.Index(term, " "+op+" "); idx >= 0 {
			// Verify this isn't part of >= or <=.
			afterOp := idx + 1 + len(op)
			if afterOp < len(term) && term[afterOp] == '=' {
				continue
			}
			left := strings.TrimSpace(term[:idx])
			right := strings.TrimSpace(term[idx+len(op)+2:])
			return evalComparison(left, op, right), nil
		}
	}

	// Check for "contains" operator.
	if idx := strings.Index(term, " contains "); idx >= 0 {
		left := strings.TrimSpace(term[:idx])
		right := strings.TrimSpace(term[idx+10:])
		return strings.Contains(left, right), nil
	}

	// Simple truthy: non-empty, not "0", not "false".
	return isTruthy(term), nil
}

// evalComparison evaluates left op right for the given operator.
func evalComparison(left, op, right string) bool {
	switch op {
	case "==":
		return left == right
	case "!=":
		return left != right
	case ">", "<", ">=", "<=":
		return evalNumericOrString(left, op, right)
	default:
		return false
	}
}

// evalNumericOrString tries numeric comparison first; falls back to string comparison.
func evalNumericOrString(left, op, right string) bool {
	lf, lErr := strconv.ParseFloat(left, 64)
	rf, rErr := strconv.ParseFloat(right, 64)

	if lErr == nil && rErr == nil {
		// Both are numeric.
		switch op {
		case ">":
			return lf > rf
		case "<":
			return lf < rf
		case ">=":
			return lf >= rf
		case "<=":
			return lf <= rf
		}
	}

	// Fallback to string comparison.
	switch op {
	case ">":
		return left > right
	case "<":
		return left < right
	case ">=":
		return left >= right
	case "<=":
		return left <= right
	}
	return false
}

// isTruthy returns true if the value is non-empty, not "0", and not "false".
func isTruthy(val string) bool {
	if val == "" || val == "0" || val == "false" {
		return false
	}
	return true
}
