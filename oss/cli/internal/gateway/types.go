// Package gateway defines Go types mirroring the Feelr gateway response envelope.
package gateway

import "encoding/json"

// GatewayResponse is the standard envelope for successful responses.
type GatewayResponse struct {
	OK   bool            `json:"ok"`
	Data json.RawMessage `json:"data"`
	Meta *ResponseMeta   `json:"meta,omitempty"`
}

// GatewayErrorResponse is the standard envelope for error responses.
type GatewayErrorResponse struct {
	OK    bool         `json:"ok"`
	Error *ErrorDetail `json:"error"`
}

// ErrorDetail contains structured error information.
type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
	Hint    string `json:"hint"`
	Status  int    `json:"status"`
}

// ResponseMeta contains response metadata.
type ResponseMeta struct {
	RequestID  string `json:"request_id"`
	Connector  string `json:"connector"`
	Action     string `json:"action"`
	DurationMs int    `json:"duration_ms"`
	Cursor     string `json:"cursor,omitempty"`
	HasMore    *bool  `json:"has_more,omitempty"`
}
