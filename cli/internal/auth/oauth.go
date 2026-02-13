package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/pkg/browser"
)

// oauthCallbackResult holds the result of an OAuth callback.
type oauthCallbackResult struct {
	Code  string
	Error string
}

// PerformOAuthFlow executes the full OAuth2 authorization code flow for a provider.
// It fetches the OAuth config from the gateway, opens a browser for user authorization,
// captures the callback on a localhost server, and sends the code to the gateway
// for server-side token exchange.
func PerformOAuthFlow(gwClient *client.GatewayClient, provider *ProviderConfig, noBrowser bool) error {
	// 1. Fetch OAuth config from gateway.
	oauthCfg, err := gwClient.GetOAuthConfig(provider.Connector)
	if err != nil {
		return fmt.Errorf("fetching OAuth config for %s: %w", provider.Name, err)
	}

	// 2. Generate random state for CSRF protection.
	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		return fmt.Errorf("generating state: %w", err)
	}
	state := hex.EncodeToString(stateBytes)

	// 3. Start localhost callback server on a random available port.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		// Fallback to manual code paste if listener fails.
		fmt.Fprintf(os.Stderr, "Could not start local callback server: %s\n", err)
		return manualCodeFlow(gwClient, provider, oauthCfg, state)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	redirectURI := fmt.Sprintf("http://127.0.0.1:%d/callback", port)

	// 4. Build authorize URL.
	authURL, err := buildAuthorizeURL(oauthCfg, redirectURI, state)
	if err != nil {
		listener.Close()
		return fmt.Errorf("building authorize URL: %w", err)
	}

	// 5. Print auth URL to stderr.
	fmt.Fprintf(os.Stderr, "Opening browser to authorize %s...\n", provider.Name)
	fmt.Fprintf(os.Stderr, "If browser doesn't open, visit:\n  %s\n\n", authURL)

	// 6. Try to open browser (ignore error for headless environments).
	if !noBrowser {
		_ = browser.OpenURL(authURL)
	}

	// 7. Wait for callback with timeout.
	resultCh := make(chan oauthCallbackResult, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()

		// Validate state parameter.
		if q.Get("state") != state {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, "<html><body><h2>Authentication failed</h2><p>Invalid state parameter. Please try again.</p></body></html>")
			resultCh <- oauthCallbackResult{Error: "state mismatch"}
			return
		}

		// Check for error from provider.
		if errMsg := q.Get("error"); errMsg != "" {
			desc := q.Get("error_description")
			if desc == "" {
				desc = errMsg
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "<html><body><h2>Authentication failed</h2><p>%s</p></body></html>", desc)
			resultCh <- oauthCallbackResult{Error: desc}
			return
		}

		code := q.Get("code")
		if code == "" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, "<html><body><h2>Authentication failed</h2><p>No authorization code received.</p></body></html>")
			resultCh <- oauthCallbackResult{Error: "no authorization code received"}
			return
		}

		// Success -- serve confirmation page.
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, `<html><body><h2>Authentication successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>`)
		resultCh <- oauthCallbackResult{Code: code}
	})

	server := &http.Server{Handler: mux}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			resultCh <- oauthCallbackResult{Error: fmt.Sprintf("callback server error: %s", err)}
		}
	}()

	// 8. Wait for result or timeout.
	var result oauthCallbackResult
	select {
	case result = <-resultCh:
	case <-time.After(5 * time.Minute):
		result = oauthCallbackResult{Error: "authorization timed out after 5 minutes"}
	}

	// 9. Gracefully shutdown the callback server.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)

	if result.Error != "" {
		return &client.CLIError{
			ExitCode: 2,
			Message:  fmt.Sprintf("%s authentication failed: %s", provider.Name, result.Error),
		}
	}

	// 10. Send authorization code to gateway for token exchange.
	exchangeResp, err := gwClient.PostOAuthExchange(provider.Connector, result.Code, redirectURI)
	if err != nil {
		return fmt.Errorf("exchanging authorization code: %w", err)
	}

	team := exchangeResp.Team
	if team == "" {
		team = exchangeResp.Connector
	}
	fmt.Fprintf(os.Stderr, "%s connected successfully! Team: %s\n", provider.Name, team)
	return nil
}

// manualCodeFlow handles the fallback flow for headless/SSH environments
// where a localhost callback server cannot be used.
func manualCodeFlow(gwClient *client.GatewayClient, provider *ProviderConfig, oauthCfg *client.OAuthConfigResponse, state string) error {
	// Use out-of-band redirect (urn:ietf:wg:oauth:2.0:oob style).
	// For Slack, we still need a redirect URI. Use the authorize URL with
	// a special redirect that shows the code to the user.
	redirectURI := "urn:ietf:wg:oauth:2.0:oob"

	authURL, err := buildAuthorizeURL(oauthCfg, redirectURI, state)
	if err != nil {
		return fmt.Errorf("building authorize URL: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Visit this URL to authorize %s:\n  %s\n\n", provider.Name, authURL)
	fmt.Fprint(os.Stderr, "Paste the authorization code here: ")

	var code string
	if _, err := fmt.Scanln(&code); err != nil {
		return fmt.Errorf("reading authorization code: %w", err)
	}

	if code == "" {
		return &client.CLIError{
			ExitCode: 2,
			Message:  "no authorization code provided",
		}
	}

	exchangeResp, err := gwClient.PostOAuthExchange(provider.Connector, code, redirectURI)
	if err != nil {
		return fmt.Errorf("exchanging authorization code: %w", err)
	}

	team := exchangeResp.Team
	if team == "" {
		team = exchangeResp.Connector
	}
	fmt.Fprintf(os.Stderr, "%s connected successfully! Team: %s\n", provider.Name, team)
	return nil
}

// buildAuthorizeURL constructs the OAuth2 authorize URL with required parameters.
func buildAuthorizeURL(cfg *client.OAuthConfigResponse, redirectURI, state string) (string, error) {
	u, err := url.Parse(cfg.AuthorizeURL)
	if err != nil {
		return "", fmt.Errorf("invalid authorize URL %q: %w", cfg.AuthorizeURL, err)
	}

	q := u.Query()
	q.Set("client_id", cfg.ClientID)
	q.Set("scope", cfg.Scopes)
	q.Set("redirect_uri", redirectURI)
	q.Set("state", state)
	q.Set("response_type", "code")
	u.RawQuery = q.Encode()

	return u.String(), nil
}

// OAuthConfigFromJSON parses an OAuth config response from JSON bytes.
func OAuthConfigFromJSON(data json.RawMessage) (*client.OAuthConfigResponse, error) {
	var cfg client.OAuthConfigResponse
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing OAuth config: %w", err)
	}
	return &cfg, nil
}
