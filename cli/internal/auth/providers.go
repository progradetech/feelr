// Package auth provides authentication flows for connecting external services
// via the Feelr CLI. Supports OAuth2 browser flows (Slack) and direct token
// input (Discord, Stripe).
package auth

import "fmt"

// AuthType identifies how a provider authenticates.
type AuthType string

const (
	// AuthTypeOAuth2 uses browser-based OAuth2 authorization code flow.
	AuthTypeOAuth2 AuthType = "oauth2"
	// AuthTypeToken uses direct API token / bot token input.
	AuthTypeToken AuthType = "token"
)

// ProviderConfig describes how to authenticate with a specific provider.
type ProviderConfig struct {
	// Name is the human-readable provider name (e.g. "Slack").
	Name string
	// Connector is the lowercase identifier used in gateway routes (e.g. "slack").
	Connector string
	// AuthType determines the authentication flow.
	AuthType AuthType
	// TokenPrompt is the user-facing prompt when requesting a direct token.
	// Only used when AuthType is AuthTypeToken.
	TokenPrompt string
	// TokenEnvVar is the environment variable name for the token.
	// Only used when AuthType is AuthTypeToken.
	TokenEnvVar string
}

// providers is the registry of known provider configurations.
var providers = map[string]*ProviderConfig{
	"slack": {
		Name:      "Slack",
		Connector: "slack",
		AuthType:  AuthTypeOAuth2,
	},
	"discord": {
		Name:        "Discord",
		Connector:   "discord",
		AuthType:    AuthTypeToken,
		TokenPrompt: "Enter your Discord bot token (from Developer Portal > Bot > Token)",
		TokenEnvVar: "FEELR_DISCORD_TOKEN",
	},
	"stripe": {
		Name:        "Stripe",
		Connector:   "stripe",
		AuthType:    AuthTypeToken,
		TokenPrompt: "Enter your Stripe API key (sk_live_* or sk_test_* from Stripe Dashboard)",
		TokenEnvVar: "FEELR_STRIPE_TOKEN",
	},
}

// KnownProviders returns the list of supported provider names.
func KnownProviders() []string {
	return []string{"slack", "discord", "stripe"}
}

// GetProvider returns the configuration for a named provider.
// Returns an error if the provider is unknown.
func GetProvider(name string) (*ProviderConfig, error) {
	p, ok := providers[name]
	if !ok {
		return nil, fmt.Errorf("unknown provider %q. Supported providers: slack, discord, stripe", name)
	}
	return p, nil
}
