// Package client provides an HTTP client for communicating with the Feelr gateway.
package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/andrewprograde/feelr/cli/internal/gateway"
)

// CLIError represents a CLI error with a specific exit code.
// This mirrors the CLIError in main.go but is usable from internal packages.
type CLIError struct {
	ExitCode int
	Message  string
}

func (e *CLIError) Error() string {
	return e.Message
}

// GatewayClient communicates with the Feelr gateway over HTTP.
type GatewayClient struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
}

// NewGatewayClient creates a new client with a 30-second timeout.
func NewGatewayClient(baseURL, apiKey string) *GatewayClient {
	return &GatewayClient{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
	}
}

// Run executes a connector action via POST /v1/{connector}/{action}.
// Params are sent as a JSON body. Cursor is appended as a query parameter
// if non-empty (pagination is handled at the URL level by the gateway).
func (c *GatewayClient) Run(connector, action string, params map[string]string, cursor string) (*gateway.GatewayResponse, error) {
	url := fmt.Sprintf("%s/v1/%s/%s", c.baseURL, connector, action)
	if cursor != "" {
		url += "?cursor=" + cursor
	}

	body, err := json.Marshal(params)
	if err != nil {
		return nil, fmt.Errorf("marshaling params: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	return c.doRequest(req)
}

// GetTools fetches connector/action discovery information.
// Path can be "", "/github", or "/github/issues.list".
func (c *GatewayClient) GetTools(path string) (*gateway.GatewayResponse, error) {
	url := fmt.Sprintf("%s/v1/tools%s", c.baseURL, path)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	c.setHeaders(req)

	return c.doRequest(req)
}

// GetStatus fetches gateway health status.
// If deep is true, appends ?deep=true for a deep health check.
func (c *GatewayClient) GetStatus(deep bool) (*gateway.GatewayResponse, error) {
	url := fmt.Sprintf("%s/status", c.baseURL)
	if deep {
		url += "?deep=true"
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	c.setHeaders(req)

	return c.doRequest(req)
}

// BuildRequest constructs an HTTP request without executing it.
// Used by --dry-run to preview the request that would be sent.
func (c *GatewayClient) BuildRequest(method, path string, body []byte) (*http.Request, error) {
	url := fmt.Sprintf("%s%s", c.baseURL, path)

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	c.setHeaders(req)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return req, nil
}

// setHeaders applies standard authentication and identification headers.
func (c *GatewayClient) setHeaders(req *http.Request) {
	req.Header.Set("X-Feelr-Key", c.apiKey)
	req.Header.Set("User-Agent", "feelr-cli")
}

// doRequest executes the request and parses the gateway response envelope.
func (c *GatewayClient) doRequest(req *http.Request) (*gateway.GatewayResponse, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gateway request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}

	// Try parsing as a success response first.
	var envelope gateway.GatewayResponse
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return nil, fmt.Errorf("parsing gateway response: %w", err)
	}

	// If ok=false, parse as error response and return a CLIError.
	if !envelope.OK {
		var errResp gateway.GatewayErrorResponse
		if err := json.Unmarshal(respBody, &errResp); err != nil {
			return nil, fmt.Errorf("parsing error response: %w", err)
		}
		if errResp.Error != nil {
			exitCode := 1
			if errResp.Error.Hint == "auth" {
				exitCode = 2
			} else if strings.Contains(errResp.Error.Code, "NOT_FOUND") {
				exitCode = 3
			}
			return nil, &CLIError{
				ExitCode: exitCode,
				Message:  errResp.Error.Message,
			}
		}
		return nil, &CLIError{
			ExitCode: 1,
			Message:  "unknown gateway error",
		}
	}

	return &envelope, nil
}
