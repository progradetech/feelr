package cmd

import (
	"encoding/json"
	"fmt"
	"net/http/httputil"
	"os"
	"strings"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/andrewprograde/feelr/cli/internal/config"
	"github.com/andrewprograde/feelr/cli/internal/output"
	"github.com/spf13/cobra"
)

// completeRunArgs provides dynamic shell completion for the run command.
// It completes connector names for the first argument and action names
// for the second argument by querying the gateway's tools endpoint.
func completeRunArgs(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	cfg, err := config.Load(getProfile(cmd))
	if err != nil || cfg.APIKey == "" {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	gwClient := client.NewGatewayClient(cfg.Gateway, cfg.APIKey)

	if len(args) == 0 {
		// Complete connector names.
		resp, err := gwClient.GetTools("")
		if err != nil {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}
		var connectors []struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(resp.Data, &connectors); err != nil {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}
		names := make([]string, len(connectors))
		for i, c := range connectors {
			names[i] = c.Name
		}
		return names, cobra.ShellCompDirectiveNoFileComp
	}

	if len(args) == 1 {
		// Complete action names for the given connector.
		resp, err := gwClient.GetTools("/" + args[0])
		if err != nil {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}
		var connector struct {
			Actions []struct {
				Name string `json:"name"`
			} `json:"actions"`
		}
		if err := json.Unmarshal(resp.Data, &connector); err != nil {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}
		names := make([]string, len(connector.Actions))
		for i, a := range connector.Actions {
			names[i] = a.Name
		}
		return names, cobra.ShellCompDirectiveNoFileComp
	}

	// No completion for key=value params.
	return nil, cobra.ShellCompDirectiveNoFileComp
}

var runCmd = &cobra.Command{
	Use:   "run <connector> <action> [key=value...]",
	Short: "Execute a connector action",
	Long: `Execute a connector action via the Feelr gateway.

Parameters are passed as key=value pairs after the action name.
System flags (--format, --verbose, --dry-run, --cursor) are separate from action params.

Examples:
  feelr run github issues.list repo=owner/repo
  feelr run github issues.list repo=owner/repo state=open --format table
  feelr run github issues.get repo=owner/repo number=42 --verbose
  feelr run github issues.list repo=owner/repo --cursor abc123
  feelr run github issues.list repo=owner/repo --dry-run`,
	Args:              cobra.MinimumNArgs(2),
	ValidArgsFunction: completeRunArgs,
	RunE:              runAction,
}

func init() {
	// Local flag for pagination cursor (only applies to run command).
	runCmd.Flags().String("cursor", "", "Pagination cursor for fetching next page")
}

func runAction(cmd *cobra.Command, args []string) error {
	connector := args[0]
	action := args[1]

	// Parse key=value parameters from remaining args.
	params := make(map[string]string)
	for _, arg := range args[2:] {
		key, value, ok := strings.Cut(arg, "=")
		if !ok {
			return &client.CLIError{
				ExitCode: 4,
				Message:  fmt.Sprintf("invalid parameter %q: expected key=value format (example: repo=owner/repo)", arg),
			}
		}
		params[key] = value
	}

	// Read global flags.
	profileFlag, _ := cmd.Flags().GetString("profile")
	formatFlag, _ := cmd.Flags().GetString("format")
	verboseFlag, _ := cmd.Flags().GetBool("verbose")
	dryRunFlag, _ := cmd.Flags().GetBool("dry-run")
	colorFlag, _ := cmd.Flags().GetBool("color")
	gatewayFlag, _ := cmd.Flags().GetString("gateway")
	cursorFlag, _ := cmd.Flags().GetString("cursor")

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

	// Handle --dry-run: show the request that would be sent.
	if dryRunFlag {
		body, marshalErr := json.Marshal(params)
		if marshalErr != nil {
			return &client.CLIError{
				ExitCode: 1,
				Message:  fmt.Sprintf("marshaling params: %s", marshalErr),
			}
		}

		path := fmt.Sprintf("/v1/%s/%s", connector, action)
		if cursorFlag != "" {
			path += "?cursor=" + cursorFlag
		}

		req, buildErr := gwClient.BuildRequest("POST", path, body)
		if buildErr != nil {
			return &client.CLIError{
				ExitCode: 1,
				Message:  fmt.Sprintf("building request: %s", buildErr),
			}
		}

		dump, dumpErr := httputil.DumpRequestOut(req, true)
		if dumpErr != nil {
			return &client.CLIError{
				ExitCode: 1,
				Message:  fmt.Sprintf("dumping request: %s", dumpErr),
			}
		}
		fmt.Fprintln(os.Stderr, string(dump))
		return nil
	}

	// Execute the action via the gateway.
	resp, err := gwClient.Run(connector, action, params, cursorFlag)
	if err != nil {
		// Create formatter for error output.
		formatter := output.NewFormatter(formatFlag, verboseFlag, colorFlag, os.Stdout, os.Stderr)
		formatter.FormatError(err)
		return err
	}

	// Format and output the successful response.
	formatter := output.NewFormatter(formatFlag, verboseFlag, colorFlag, os.Stdout, os.Stderr)
	return formatter.FormatData(resp.Data, resp.Meta)
}
