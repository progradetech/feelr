package auth

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"golang.org/x/term"
)

// PromptToken handles direct token input for non-OAuth providers (Discord, Stripe).
// Token resolution order:
//  1. tokenFlag value (if provided via --token)
//  2. Environment variable (FEELR_DISCORD_TOKEN, FEELR_STRIPE_TOKEN)
//  3. Interactive prompt to stderr (if terminal detected)
//  4. Error with clear instructions (non-interactive, no token found)
//
// After obtaining the token, it stores the credential via the gateway admin API.
func PromptToken(gwClient *client.GatewayClient, provider *ProviderConfig, tokenFlag string) error {
	token := resolveToken(provider, tokenFlag)

	if token == "" {
		// No token from flag or env -- try interactive prompt.
		if !term.IsTerminal(int(os.Stdin.Fd())) {
			return &client.CLIError{
				ExitCode: 2,
				Message: fmt.Sprintf(
					"No %s token provided. Use one of:\n"+
						"  feelr auth %s --token <value>\n"+
						"  export %s=<value>\n"+
						"  Run interactively to be prompted",
					provider.Name, provider.Connector, provider.TokenEnvVar,
				),
			}
		}

		// Interactive prompt.
		fmt.Fprintf(os.Stderr, "%s: ", provider.TokenPrompt)
		scanner := bufio.NewScanner(os.Stdin)
		if scanner.Scan() {
			token = strings.TrimSpace(scanner.Text())
		}
		if token == "" {
			return &client.CLIError{
				ExitCode: 2,
				Message:  "no token provided",
			}
		}
	}

	// Store credential via gateway admin API.
	body := map[string]interface{}{
		"access_token": token,
	}
	if err := gwClient.PostAdminCredential(provider.Connector, body); err != nil {
		return fmt.Errorf("storing %s credential: %w", provider.Name, err)
	}

	fmt.Fprintf(os.Stderr, "%s connected successfully!\n", provider.Name)
	return nil
}

// resolveToken checks the --token flag and environment variable for a token value.
func resolveToken(provider *ProviderConfig, tokenFlag string) string {
	// 1. Flag value takes highest precedence.
	if tokenFlag != "" {
		return tokenFlag
	}

	// 2. Environment variable.
	if provider.TokenEnvVar != "" {
		if envVal := os.Getenv(provider.TokenEnvVar); envVal != "" {
			return envVal
		}
	}

	return ""
}
