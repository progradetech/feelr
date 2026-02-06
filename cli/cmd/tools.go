package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/andrewprograde/feelr/cli/internal/config"
	"github.com/andrewprograde/feelr/cli/internal/output"
	"github.com/spf13/cobra"
)

var toolsCmd = &cobra.Command{
	Use:   "tools [connector[.action]]",
	Short: "Discover connectors and actions",
	Long: `Progressive discovery of available connectors and actions.

  feelr tools                    List all connectors
  feelr tools github             List actions for a connector
  feelr tools github.issues.list Show parameter schema for an action`,
	Args: cobra.MaximumNArgs(1),
	RunE: runTools,
}

func init() {
	// Local flag for JSON Schema output on action detail.
	toolsCmd.Flags().Bool("schema", false, "Output raw JSON Schema for an action")
}

// parseToolsArg splits a tools argument into connector and action parts.
// If arg contains a dot, connector is everything before the first dot,
// action is everything after. "github.issues.list" -> ("github", "issues.list").
// If no dot, it's a connector-only query: "github" -> ("github", "").
func parseToolsArg(arg string) (connector, action string) {
	idx := strings.Index(arg, ".")
	if idx < 0 {
		return arg, ""
	}
	return arg[:idx], arg[idx+1:]
}

func runTools(cmd *cobra.Command, args []string) error {
	// Read global flags.
	profileFlag, _ := cmd.Flags().GetString("profile")
	formatFlag, _ := cmd.Flags().GetString("format")
	verboseFlag, _ := cmd.Flags().GetBool("verbose")
	colorFlag, _ := cmd.Flags().GetBool("color")
	gatewayFlag, _ := cmd.Flags().GetString("gateway")
	schemaFlag, _ := cmd.Flags().GetBool("schema")

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

	// Determine discovery level based on args.
	if len(args) == 0 {
		return toolsListConnectors(gwClient, formatFlag, verboseFlag, colorFlag)
	}

	connector, action := parseToolsArg(args[0])
	if action == "" {
		return toolsListActions(gwClient, connector, formatFlag, verboseFlag, colorFlag)
	}
	return toolsActionDetail(gwClient, connector, action, schemaFlag, formatFlag, verboseFlag, colorFlag)
}

// toolsListConnectors handles Level 0: `feelr tools` -- list all connectors.
func toolsListConnectors(gwClient *client.GatewayClient, format string, verbose, color bool) error {
	resp, err := gwClient.GetTools("")
	if err != nil {
		formatter := output.NewFormatter(format, verbose, color, os.Stdout, os.Stderr)
		formatter.FormatError(err)
		return err
	}

	formatter := output.NewFormatter(format, verbose, color, os.Stdout, os.Stderr)
	return formatter.FormatData(resp.Data, resp.Meta)
}

// toolsListActions handles Level 1: `feelr tools github` -- list actions for a connector.
func toolsListActions(gwClient *client.GatewayClient, connector, format string, verbose, color bool) error {
	path := "/" + connector
	resp, err := gwClient.GetTools(path)
	if err != nil {
		// Map 404 errors to exit code 3 (not found).
		if cliErr, ok := err.(*client.CLIError); ok && cliErr.ExitCode == 1 {
			cliErr.ExitCode = 3
		}
		formatter := output.NewFormatter(format, verbose, color, os.Stdout, os.Stderr)
		formatter.FormatError(err)
		return err
	}

	formatter := output.NewFormatter(format, verbose, color, os.Stdout, os.Stderr)
	return formatter.FormatData(resp.Data, resp.Meta)
}

// toolsActionDetail handles Level 2: `feelr tools github.issues.list` -- show action schema.
func toolsActionDetail(gwClient *client.GatewayClient, connector, action string, schema bool, format string, verbose, color bool) error {
	path := "/" + connector + "/" + action
	resp, err := gwClient.GetTools(path)
	if err != nil {
		// Map 404 errors to exit code 3 (not found).
		if cliErr, ok := err.(*client.CLIError); ok && cliErr.ExitCode == 1 {
			cliErr.ExitCode = 3
		}
		formatter := output.NewFormatter(format, verbose, color, os.Stdout, os.Stderr)
		formatter.FormatError(err)
		return err
	}

	// If --schema flag is set, output raw JSON data (the action schema).
	if schema {
		var parsed interface{}
		if err := json.Unmarshal(resp.Data, &parsed); err != nil {
			fmt.Fprintln(os.Stdout, string(resp.Data))
			return nil
		}
		out, _ := json.MarshalIndent(parsed, "", "  ")
		fmt.Fprintln(os.Stdout, string(out))
		return nil
	}

	formatter := output.NewFormatter(format, verbose, color, os.Stdout, os.Stderr)
	return formatter.FormatData(resp.Data, resp.Meta)
}
