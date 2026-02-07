package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/andrewprograde/feelr/cli/internal/auth"
	"github.com/andrewprograde/feelr/cli/internal/chain"
	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/andrewprograde/feelr/cli/internal/config"
	"github.com/andrewprograde/feelr/cli/internal/output"
	"github.com/spf13/cobra"
)

var chainRunCmd = &cobra.Command{
	Use:   "run <name-or-file> [key=value...]",
	Short: "Execute a composable action chain",
	Long: `Execute a chain by name or file path.

The chain is resolved in order: file path, built-in chains directory,
current directory. Parameters are passed as key=value trailing arguments.

By default, only the final step's output is printed to stdout.
Use --verbose to show all step outputs to stderr as steps complete.

Examples:
  feelr chain run github-slack-issue-notify repo=owner/repo channel=general
  feelr chain run ./my-chain.yaml repo=owner/repo
  feelr chain run my-chain repo=owner/repo --verbose`,
	Args: cobra.MinimumNArgs(1),
	RunE: runChain,
}

func runChain(cmd *cobra.Command, args []string) error {
	chainNameOrFile := args[0]

	// Parse key=value parameters from remaining args.
	params := make(map[string]string)
	for _, arg := range args[1:] {
		key, value, ok := strings.Cut(arg, "=")
		if !ok {
			return &client.CLIError{
				ExitCode: 4,
				Message:  fmt.Sprintf("invalid parameter %q: expected key=value format", arg),
			}
		}
		params[key] = value
	}

	// Read global flags.
	profileFlag, _ := cmd.Flags().GetString("profile")
	formatFlag, _ := cmd.Flags().GetString("format")
	verboseFlag, _ := cmd.Flags().GetBool("verbose")
	colorFlag, _ := cmd.Flags().GetBool("color")
	gatewayFlag, _ := cmd.Flags().GetString("gateway")

	// Load config for gateway URL and API key.
	cfg, err := config.Load(profileFlag)
	if err != nil {
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("loading config: %s", err),
		}
	}

	gatewayURL := cfg.Gateway
	if gatewayFlag != "" {
		gatewayURL = gatewayFlag
	}

	if cfg.APIKey == "" {
		return &client.CLIError{
			ExitCode: 2,
			Message:  "API key not configured. Run \"feelr init\" or set FEELR_API_KEY environment variable.",
		}
	}

	// Create gateway client with re-auth hook.
	gwClient := client.NewGatewayClient(gatewayURL, cfg.APIKey)
	gwClient.OnAuthExpired = func(provider string) (bool, error) {
		if !auth.IsInteractive() {
			return false, auth.ReauthError(provider)
		}
		accepted, err := auth.PromptReauth(provider)
		if err != nil || !accepted {
			return false, auth.ReauthError(provider)
		}
		providerCfg, provErr := auth.GetProvider(provider)
		if provErr != nil {
			return false, auth.ReauthError(provider)
		}
		adminClient, adminErr := loadAdminClient(cmd)
		if adminErr != nil {
			return false, auth.ReauthError(provider)
		}
		switch providerCfg.AuthType {
		case auth.AuthTypeOAuth2:
			if flowErr := auth.PerformOAuthFlow(adminClient, providerCfg, false); flowErr != nil {
				return false, flowErr
			}
		case auth.AuthTypeToken:
			if tokenErr := auth.PromptToken(adminClient, providerCfg, ""); tokenErr != nil {
				return false, tokenErr
			}
		}
		return true, nil
	}

	// Resolve the chain definition.
	chainDef, err := chain.ResolveChain(chainNameOrFile)
	if err != nil {
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("resolving chain: %s", err),
		}
	}

	// Create an ActionRunner that wraps gwClient.Run.
	runner := func(connector, action string, stepParams map[string]string) (map[string]interface{}, error) {
		resp, runErr := gwClient.Run(connector, action, stepParams, "")
		if runErr != nil {
			return nil, runErr
		}

		// Unmarshal response data to map[string]interface{}.
		var result interface{}
		if unmarshalErr := json.Unmarshal(resp.Data, &result); unmarshalErr != nil {
			return nil, fmt.Errorf("parsing step response: %w", unmarshalErr)
		}

		switch v := result.(type) {
		case map[string]interface{}:
			return v, nil
		case []interface{}:
			// Wrap arrays in {"items": arr} for consistent map access.
			return map[string]interface{}{"items": v}, nil
		default:
			return map[string]interface{}{"value": result}, nil
		}
	}

	// Execute the chain.
	opts := chain.ExecuteOpts{
		Chain:   chainDef,
		Params:  params,
		Runner:  runner,
		Verbose: verboseFlag,
	}

	// Verbose callback: show step progress to stderr.
	if verboseFlag {
		opts.OnStep = func(stepID string, status string) {
			fmt.Fprintf(os.Stderr, "[chain] step %q: %s\n", stepID, status)
		}
	}

	result, err := chain.Execute(opts)
	if err != nil {
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("chain execution error: %s", err),
		}
	}

	// If chain failed (a step errored), report the failure.
	if !result.Success {
		for _, sr := range result.Steps {
			if sr.Error != nil {
				formatter := output.NewFormatter(formatFlag, verboseFlag, colorFlag, os.Stdout, os.Stderr)
				formatter.FormatError(sr.Error)
				return &client.CLIError{
					ExitCode: 1,
					Message:  sr.Error.Error(),
				}
			}
		}
		return &client.CLIError{
			ExitCode: 1,
			Message:  "chain execution failed",
		}
	}

	// Output the final step's data to stdout.
	var finalOutput map[string]interface{}
	for i := len(result.Steps) - 1; i >= 0; i-- {
		if !result.Steps[i].Skipped && result.Steps[i].Error == nil {
			finalOutput = result.Steps[i].Output
			break
		}
	}

	if finalOutput == nil {
		// All steps were skipped.
		fmt.Fprintln(os.Stderr, "chain completed but all steps were skipped")
		return nil
	}

	// Marshal to JSON RawMessage for the formatter.
	outputJSON, err := json.Marshal(finalOutput)
	if err != nil {
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("marshaling output: %s", err),
		}
	}

	formatter := output.NewFormatter(formatFlag, verboseFlag, colorFlag, os.Stdout, os.Stderr)
	return formatter.FormatData(json.RawMessage(outputJSON), nil)
}
