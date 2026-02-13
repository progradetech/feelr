package cmd

import (
	"fmt"
	"os"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/andrewprograde/feelr/cli/internal/config"
	"github.com/andrewprograde/feelr/cli/internal/output"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show gateway and connector health",
	Long:  "Check the health of the Feelr gateway and connected services.",
	Args:  cobra.NoArgs,
	RunE:  runStatus,
}

func init() {
	// Local flag for deep health checks.
	statusCmd.Flags().Bool("deep", false, "Run deep health checks on all connectors")
}

func runStatus(cmd *cobra.Command, args []string) error {
	// Read global flags.
	profileFlag, _ := cmd.Flags().GetString("profile")
	formatFlag, _ := cmd.Flags().GetString("format")
	verboseFlag, _ := cmd.Flags().GetBool("verbose")
	colorFlag, _ := cmd.Flags().GetBool("color")
	gatewayFlag, _ := cmd.Flags().GetString("gateway")
	deepFlag, _ := cmd.Flags().GetBool("deep")

	// Load config for gateway URL and API key.
	cfg, err := config.Load(profileFlag)
	if err != nil {
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("loading config: %s", err),
		}
	}

	// Override gateway URL if --gateway flag is set.
	gatewayURL := cfg.Gateway
	if gatewayFlag != "" {
		gatewayURL = gatewayFlag
	}

	// Check for API key before proceeding.
	if cfg.APIKey == "" {
		return &client.CLIError{
			ExitCode: 2,
			Message:  "API key not configured. Run \"feelr init\" or set FEELR_API_KEY environment variable.",
		}
	}

	// Create gateway client.
	gwClient := client.NewGatewayClient(gatewayURL, cfg.APIKey)

	// Fetch gateway health status.
	resp, err := gwClient.GetStatus(deepFlag)
	if err != nil {
		formatter := output.NewFormatter(formatFlag, verboseFlag, colorFlag, os.Stdout, os.Stderr)
		formatter.FormatError(err)
		return err
	}

	// Format and output the status response.
	formatter := output.NewFormatter(formatFlag, verboseFlag, colorFlag, os.Stdout, os.Stderr)
	return formatter.FormatData(resp.Data, resp.Meta)
}
