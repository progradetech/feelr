// Package output provides pluggable output formatters for CLI responses.
// All data is written to stdout (w), all errors to stderr (errW).
package output

import (
	"encoding/json"
	"io"

	"github.com/andrewprograde/feelr/cli/internal/gateway"
)

// Formatter is the interface for rendering gateway responses to the terminal.
type Formatter interface {
	// FormatData renders a successful response. Data is the raw JSON from the
	// gateway data field; meta is optional response metadata.
	FormatData(data json.RawMessage, meta *gateway.ResponseMeta) error

	// FormatError renders an error message.
	FormatError(err error) error
}

// NewFormatter creates a formatter based on the format name.
// Supported formats: "json" (default), "minimal", "table".
func NewFormatter(format string, verbose bool, color bool, w io.Writer, errW io.Writer) Formatter {
	switch format {
	case "minimal":
		return &MinimalFormatter{w: w, errW: errW}
	case "table":
		return &TableFormatter{color: color, w: w, errW: errW}
	default:
		return &JSONFormatter{verbose: verbose, w: w, errW: errW}
	}
}
