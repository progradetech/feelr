package cmd

import (
	"fmt"
	"os"

	"github.com/andrewprograde/feelr/cli/internal/auth"
	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/andrewprograde/feelr/cli/internal/config"
	"github.com/spf13/cobra"
)

var authCmd = &cobra.Command{
	Use:   "auth <provider>",
	Short: "Authenticate with a connector",
	Long: `Connect a service by authenticating via OAuth or token.

Supported providers: slack, discord, stripe

OAuth providers (slack) open a browser for authorization.
Token providers (discord, stripe) accept tokens via --token flag,
environment variable, or interactive prompt.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

var authSlackCmd = &cobra.Command{
	Use:   "slack",
	Short: "Authenticate with Slack via OAuth",
	Long: `Connect your Slack workspace using OAuth2 authorization.

Opens a browser for Slack authorization. The authorization code is sent to
the Feelr gateway for server-side token exchange.

For headless/SSH environments, use --no-browser to manually copy the URL
and paste the authorization code.`,
	Args: cobra.NoArgs,
	RunE: runAuthSlack,
}

var authDiscordCmd = &cobra.Command{
	Use:   "discord",
	Short: "Authenticate with Discord using a bot token",
	Long: `Connect your Discord bot by providing its token.

Token resolution order:
  1. --token flag
  2. FEELR_DISCORD_TOKEN environment variable
  3. Interactive prompt`,
	Args: cobra.NoArgs,
	RunE: runAuthDiscord,
}

var authStripeCmd = &cobra.Command{
	Use:   "stripe",
	Short: "Authenticate with Stripe using an API key",
	Long: `Connect Stripe by providing your API key (sk_live_* or sk_test_*).

Token resolution order:
  1. --token flag
  2. FEELR_STRIPE_TOKEN environment variable
  3. Interactive prompt`,
	Args: cobra.NoArgs,
	RunE: runAuthStripe,
}

func init() {
	// Slack flags.
	authSlackCmd.Flags().Bool("no-browser", false, "Skip browser auto-open; use manual code paste")

	// Discord flags.
	authDiscordCmd.Flags().String("token", "", "Discord bot token value")

	// Stripe flags.
	authStripeCmd.Flags().String("token", "", "Stripe API key value")

	// Register subcommands.
	authCmd.AddCommand(authSlackCmd)
	authCmd.AddCommand(authDiscordCmd)
	authCmd.AddCommand(authStripeCmd)
}

// loadAdminClient creates a GatewayClient authenticated with the admin token.
// Admin token resolution:
//  1. FEELR_ADMIN_TOKEN environment variable
//  2. Config file admin_token field
//  3. Error with instructions
func loadAdminClient(cmd *cobra.Command) (*client.GatewayClient, error) {
	profileFlag, _ := cmd.Flags().GetString("profile")
	gatewayFlag, _ := cmd.Flags().GetString("gateway")

	cfg, err := config.Load(profileFlag)
	if err != nil {
		return nil, &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("loading config: %s", err),
		}
	}

	gatewayURL := cfg.Gateway
	if gatewayFlag != "" {
		gatewayURL = gatewayFlag
	}

	// Resolve admin token.
	adminToken := os.Getenv("FEELR_ADMIN_TOKEN")
	if adminToken == "" {
		adminToken = config.LoadAdminToken(profileFlag)
	}
	if adminToken == "" {
		return nil, &client.CLIError{
			ExitCode: 2,
			Message:  "Admin token required. Set FEELR_ADMIN_TOKEN or add admin_token to config.",
		}
	}

	return client.NewAdminClient(gatewayURL, adminToken), nil
}

func runAuthSlack(cmd *cobra.Command, args []string) error {
	adminClient, err := loadAdminClient(cmd)
	if err != nil {
		return err
	}

	provider, _ := auth.GetProvider("slack")
	noBrowser, _ := cmd.Flags().GetBool("no-browser")

	if flowErr := auth.PerformOAuthFlow(adminClient, provider, noBrowser); flowErr != nil {
		return flowErr
	}
	return nil
}

func runAuthDiscord(cmd *cobra.Command, args []string) error {
	adminClient, err := loadAdminClient(cmd)
	if err != nil {
		return err
	}

	provider, _ := auth.GetProvider("discord")
	tokenFlag, _ := cmd.Flags().GetString("token")

	return auth.PromptToken(adminClient, provider, tokenFlag)
}

func runAuthStripe(cmd *cobra.Command, args []string) error {
	adminClient, err := loadAdminClient(cmd)
	if err != nil {
		return err
	}

	provider, _ := auth.GetProvider("stripe")
	tokenFlag, _ := cmd.Flags().GetString("token")

	return auth.PromptToken(adminClient, provider, tokenFlag)
}
