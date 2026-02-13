package output

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"text/tabwriter"

	"github.com/andrewprograde/feelr/cli/internal/gateway"
)

// TableFormatter renders responses as aligned tables using text/tabwriter.
// When color=true, headers are rendered with ANSI bold.
type TableFormatter struct {
	color bool
	w     io.Writer
	errW  io.Writer
}

func (f *TableFormatter) FormatData(data json.RawMessage, _ *gateway.ResponseMeta) error {
	trimmed := strings.TrimSpace(string(data))
	if len(trimmed) == 0 {
		return nil
	}

	if trimmed[0] == '[' {
		return f.formatArray(data)
	}
	return f.formatObject(data)
}

func (f *TableFormatter) FormatError(err error) error {
	_, writeErr := fmt.Fprintf(f.errW, "error: %s\n", err.Error())
	return writeErr
}

// formatArray renders an array of objects as a table with headers from the
// keys of the first item.
func (f *TableFormatter) formatArray(data json.RawMessage) error {
	var items []map[string]interface{}
	if err := json.Unmarshal(data, &items); err != nil {
		_, writeErr := fmt.Fprintln(f.w, string(data))
		return writeErr
	}

	if len(items) == 0 {
		fmt.Fprintln(f.w, "(empty)")
		return nil
	}

	keys := sortedTableKeys(items[0])

	tw := tabwriter.NewWriter(f.w, 0, 4, 2, ' ', 0)

	// Header row.
	headers := make([]string, len(keys))
	for i, k := range keys {
		headers[i] = strings.ToUpper(k)
	}
	if f.color {
		fmt.Fprintln(tw, "\033[1m"+strings.Join(headers, "\t")+"\033[0m")
	} else {
		fmt.Fprintln(tw, strings.Join(headers, "\t"))
	}

	// Data rows.
	for _, item := range items {
		values := make([]string, len(keys))
		for i, k := range keys {
			values[i] = tableFormatValue(item[k])
		}
		fmt.Fprintln(tw, strings.Join(values, "\t"))
	}

	return tw.Flush()
}

// formatObject renders a single object as a two-column KEY/VALUE table.
func (f *TableFormatter) formatObject(data json.RawMessage) error {
	var obj map[string]interface{}
	if err := json.Unmarshal(data, &obj); err != nil {
		_, writeErr := fmt.Fprintln(f.w, string(data))
		return writeErr
	}

	keys := sortedTableKeys(obj)

	tw := tabwriter.NewWriter(f.w, 0, 4, 2, ' ', 0)

	// Header.
	if f.color {
		fmt.Fprintln(tw, "\033[1mKEY\tVALUE\033[0m")
	} else {
		fmt.Fprintln(tw, "KEY\tVALUE")
	}

	// Rows.
	for _, k := range keys {
		fmt.Fprintf(tw, "%s\t%s\n", k, tableFormatValue(obj[k]))
	}

	return tw.Flush()
}

// tableFormatValue converts a value to a string suitable for table display.
func tableFormatValue(v interface{}) string {
	if v == nil {
		return "-"
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
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

// sortedTableKeys returns the keys of a map in sorted order.
func sortedTableKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
