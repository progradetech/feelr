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

// OAuthConfigResponse holds the OAuth configuration returned by the gateway.
type OAuthConfigResponse struct {
	ClientID     string `json:"client_id"`
	AuthorizeURL string `json:"authorize_url"`
	Scopes       string `json:"scopes"`
}

// OAuthExchangeResponse holds the result of an OAuth token exchange via the gateway.
type OAuthExchangeResponse struct {
	Connector string `json:"connector"`
	Status    string `json:"status"`
	Team      string `json:"team"`
}

// OnAuthExpiredFunc is a callback invoked when a request fails due to
// expired authentication. It receives the provider name extracted from the
// error context and returns whether to retry the request.
type OnAuthExpiredFunc func(provider string) (retry bool, err error)

// GatewayClient communicates with the Feelr gateway over HTTP.
type GatewayClient struct {
	httpClient     *http.Client
	baseURL        string
	apiKey         string
	adminToken     string
	OnAuthExpired  OnAuthExpiredFunc
}

// NewGatewayClient creates a new client with a 30-second timeout.
// Uses X-Feelr-Key header authentication for regular API calls.
func NewGatewayClient(baseURL, apiKey string) *GatewayClient {
	return &GatewayClient{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
	}
}

// NewAdminClient creates a client that authenticates with a Bearer admin token
// for gateway admin endpoints (/admin/*).
func NewAdminClient(baseURL, adminToken string) *GatewayClient {
	return &GatewayClient{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		baseURL:    strings.TrimRight(baseURL, "/"),
		adminToken: adminToken,
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
	// Set GetBody so the request body can be re-read on retry.
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(body)), nil
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

// GetOAuthConfig fetches the OAuth configuration for a provider from the gateway.
// Requires admin authentication.
func (c *GatewayClient) GetOAuthConfig(provider string) (*OAuthConfigResponse, error) {
	url := fmt.Sprintf("%s/admin/oauth/config/%s", c.baseURL, provider)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	c.setHeaders(req)

	resp, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	var cfg OAuthConfigResponse
	if err := json.Unmarshal(resp.Data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing OAuth config: %w", err)
	}
	return &cfg, nil
}

// PostOAuthExchange sends an authorization code to the gateway for server-side
// token exchange. Requires admin authentication.
func (c *GatewayClient) PostOAuthExchange(provider, code, redirectURI string) (*OAuthExchangeResponse, error) {
	url := fmt.Sprintf("%s/admin/oauth/exchange/%s", c.baseURL, provider)

	body, err := json.Marshal(map[string]string{
		"code":         code,
		"redirect_uri": redirectURI,
	})
	if err != nil {
		return nil, fmt.Errorf("marshaling exchange body: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	var result OAuthExchangeResponse
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return nil, fmt.Errorf("parsing exchange response: %w", err)
	}
	return &result, nil
}

// PostAdminCredential stores a credential for a connector via the gateway admin API.
// Used for non-OAuth providers (Discord bot tokens, Stripe API keys).
// Requires admin authentication.
func (c *GatewayClient) PostAdminCredential(connector string, body map[string]interface{}) error {
	url := fmt.Sprintf("%s/admin/credentials/%s", c.baseURL, connector)

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshaling credential body: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return fmt.Errorf("building request: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set("Content-Type", "application/json")

	_, err = c.doRequest(req)
	return err
}

// setHeaders applies authentication and identification headers.
// Uses Bearer admin token for admin clients, X-Feelr-Key for regular API clients.
func (c *GatewayClient) setHeaders(req *http.Request) {
	if c.adminToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.adminToken)
	} else if c.apiKey != "" {
		req.Header.Set("X-Feelr-Key", c.apiKey)
	}
	req.Header.Set("User-Agent", "feelr-cli")
}

// doRequest executes the request and parses the gateway response envelope.
// If a token expiry error is detected and OnAuthExpired is set, it invokes
// the callback and optionally retries the request once.
func (c *GatewayClient) doRequest(req *http.Request) (*gateway.GatewayResponse, error) {
	return c.doRequestInner(req, false)
}

// doRequestInner is the implementation of doRequest with retry tracking.
func (c *GatewayClient) doRequestInner(req *http.Request, isRetry bool) (*gateway.GatewayResponse, error) {
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

			// Check for token expiry and attempt re-auth if configured.
			if !isRetry && c.OnAuthExpired != nil && isTokenExpired(errResp.Error) {
				provider := extractProvider(req, errResp.Error)
				retry, reAuthErr := c.OnAuthExpired(provider)
				if reAuthErr != nil {
					return nil, reAuthErr
				}
				if retry {
					// Rebuild the request body for retry (original body was consumed).
					retryReq, cloneErr := cloneRequest(req)
					if cloneErr != nil {
						return nil, fmt.Errorf("preparing retry request: %w", cloneErr)
					}
					c.setHeaders(retryReq)
					return c.doRequestInner(retryReq, true)
				}
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

// isTokenExpired checks if a gateway error indicates an expired token.
func isTokenExpired(err *gateway.ErrorDetail) bool {
	if err.Code == "TOKEN_EXPIRED" || err.Code == "REFRESH_FAILED" {
		return true
	}
	if err.Hint == "auth" && strings.Contains(strings.ToLower(err.Message), "expired") {
		return true
	}
	return false
}

// extractProvider attempts to determine the provider name from the request or error.
func extractProvider(req *http.Request, errDetail *gateway.ErrorDetail) string {
	// Try to extract from the request URL path: /v1/{connector}/{action}
	parts := strings.Split(strings.TrimPrefix(req.URL.Path, "/"), "/")
	if len(parts) >= 2 && parts[0] == "v1" {
		return parts[1]
	}
	// Fallback to the error detail if available.
	if errDetail.Detail != "" {
		return errDetail.Detail
	}
	return "unknown"
}

// cloneRequest creates a copy of an HTTP request, re-reading the body.
func cloneRequest(req *http.Request) (*http.Request, error) {
	newReq, err := http.NewRequest(req.Method, req.URL.String(), nil)
	if err != nil {
		return nil, err
	}
	newReq.Header = req.Header.Clone()

	// If the original request had a body that was captured via GetBody, use it.
	if req.GetBody != nil {
		body, err := req.GetBody()
		if err != nil {
			return nil, err
		}
		newReq.Body = body
	}
	return newReq, nil
}
