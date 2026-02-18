package output

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/andrewprograde/feelr/cli/internal/gateway"
)

// MinimalFormatter renders responses in a compact format optimized for
// agent token consumption.
//
// Arrays: pipe-delimited rows (e.g., "42|open|Fix login bug|alice")
// Objects: key=value pairs on one line (e.g., "number=42 state=open title=\"Fix login bug\"")
type MinimalFormatter struct {
	w    io.Writer
	errW io.Writer
}

func (f *MinimalFormatter) FormatData(data json.RawMessage, _ *gateway.ResponseMeta) error {
	// Determine if data is an array or object.
	trimmed := strings.TrimSpace(string(data))
	if len(trimmed) == 0 {
		return nil
	}

	if trimmed[0] == '[' {
		return f.formatArray(data)
	}
	return f.formatObject(data)
}

func (f *MinimalFormatter) FormatError(err error) error {
	_, writeErr := fmt.Fprintf(f.errW, "error: %s\n", err.Error())
	return writeErr
}

// formatArray renders each element as a pipe-delimited row.
func (f *MinimalFormatter) formatArray(data json.RawMessage) error {
	var items []map[string]interface{}
	if err := json.Unmarshal(data, &items); err != nil {
		// Fallback: try as array of primitives.
		var primitives []interface{}
		if err2 := json.Unmarshal(data, &primitives); err2 != nil {
			_, writeErr := fmt.Fprintln(f.w, string(data))
			return writeErr
		}
		for _, p := range primitives {
			fmt.Fprintln(f.w, formatValue(p))
		}
		return nil
	}

	if len(items) == 0 {
		return nil
	}

	// Use key order from the first item for consistent columns.
	keys := sortedKeys(items[0])

	for _, item := range items {
		values := make([]string, len(keys))
		for i, k := range keys {
			values[i] = formatValue(item[k])
		}
		fmt.Fprintln(f.w, strings.Join(values, "|"))
	}
	return nil
}

// formatObject renders as key=value pairs on a single line.
func (f *MinimalFormatter) formatObject(data json.RawMessage) error {
	var obj map[string]interface{}
	if err := json.Unmarshal(data, &obj); err != nil {
		_, writeErr := fmt.Fprintln(f.w, string(data))
		return writeErr
	}

	keys := sortedKeys(obj)
	pairs := make([]string, len(keys))
	for i, k := range keys {
		v := formatValue(obj[k])
		if strings.Contains(v, " ") {
			pairs[i] = fmt.Sprintf("%s=%q", k, v)
		} else {
			pairs[i] = fmt.Sprintf("%s=%s", k, v)
		}
	}
	_, writeErr := fmt.Fprintln(f.w, strings.Join(pairs, " "))
	return writeErr
}

// formatValue converts a JSON value to its string representation.
func formatValue(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		// Render integers without decimal point.
		if val == float64(int64(val)) {
			return fmt.Sprintf("%d", int64(val))
		}
		return fmt.Sprintf("%g", val)
	case bool:
		if val {
			return "true"
		}
		return "false"
	default:
		b, _ := json.Marshal(val)
		return string(b)
	}
}

// sortedKeys returns the keys of a map in sorted order.
func sortedKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
