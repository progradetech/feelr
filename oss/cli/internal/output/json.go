package output

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/andrewprograde/feelr/cli/internal/gateway"
)

// JSONFormatter renders responses as pretty-printed JSON.
// When verbose=false (default), it prints only the unwrapped data field.
// When verbose=true, it prints the full { ok, data, meta } envelope.
type JSONFormatter struct {
	verbose bool
	w       io.Writer
	errW    io.Writer
}

func (f *JSONFormatter) FormatData(data json.RawMessage, meta *gateway.ResponseMeta) error {
	if f.verbose {
		// Build the full envelope for verbose output.
		envelope := struct {
			OK   bool                  `json:"ok"`
			Data json.RawMessage       `json:"data"`
			Meta *gateway.ResponseMeta `json:"meta,omitempty"`
		}{
			OK:   true,
			Data: data,
			Meta: meta,
		}
		return f.prettyPrint(envelope)
	}

	// Default: unwrap and pretty-print just the data field.
	// Parse and re-marshal to get pretty formatting.
	var parsed interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		// If we can't parse it, print raw.
		_, writeErr := fmt.Fprintln(f.w, string(data))
		return writeErr
	}
	return f.prettyPrint(parsed)
}

func (f *JSONFormatter) FormatError(err error) error {
	errObj := struct {
		Error string `json:"error"`
	}{
		Error: err.Error(),
	}
	out, marshalErr := json.MarshalIndent(errObj, "", "  ")
	if marshalErr != nil {
		_, writeErr := fmt.Fprintf(f.errW, "{\"error\": %q}\n", err.Error())
		return writeErr
	}
	_, writeErr := fmt.Fprintln(f.errW, string(out))
	return writeErr
}

func (f *JSONFormatter) prettyPrint(v interface{}) error {
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("formatting JSON: %w", err)
	}
	_, writeErr := fmt.Fprintln(f.w, string(out))
	return writeErr
}
