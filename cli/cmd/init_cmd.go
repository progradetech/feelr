package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/andrewprograde/feelr/cli/internal/config"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize Feelr configuration",
	Long: `Set up your Feelr configuration with gateway URL and API key.

For CI/automation, set FEELR_API_KEY and FEELR_GATEWAY environment variables instead.`,
	Args: cobra.NoArgs,
	RunE: runInit,
}

func runInit(cmd *cobra.Command, args []string) error {
	// Terminal detection: init requires an interactive terminal.
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return &client.CLIError{
			ExitCode: 4,
			Message: `feelr init requires an interactive terminal.

For CI/automation, set environment variables:
  export FEELR_GATEWAY=https://api.feelr.dev
  export FEELR_API_KEY=fk_...

Or create ~/.feelr/config.toml manually.`,
		}
	}

	reader := bufio.NewReader(os.Stdin)

	// Check for existing config.
	if config.Exists() {
		fmt.Fprintf(os.Stderr, "Config already exists at %s\n", config.ConfigPath())
		fmt.Fprint(os.Stderr, "Overwrite? [y/N]: ")
		line, _ := reader.ReadString('\n')
		line = strings.TrimSpace(line)
		if !strings.EqualFold(line, "y") && !strings.EqualFold(line, "yes") {
			return nil
		}
	}

	// Prompt for profile name.
	fmt.Fprint(os.Stderr, "Profile name [default]: ")
	profile, _ := reader.ReadString('\n')
	profile = strings.TrimSpace(profile)
	if profile == "" {
		profile = "default"
	}

	// Prompt for gateway URL.
	fmt.Fprint(os.Stderr, "Gateway URL [https://api.feelr.dev]: ")
	gateway, _ := reader.ReadString('\n')
	gateway = strings.TrimSpace(gateway)
	if gateway == "" {
		gateway = "https://api.feelr.dev"
	}

	// Prompt for API key.
	fmt.Fprint(os.Stderr, "API key: ")
	apiKey, _ := reader.ReadString('\n')
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "Warning: no API key provided. Set FEELR_API_KEY or re-run feelr init later.")
	}

	// Write config.
	cfg := &config.Config{
		Profile: profile,
		Gateway: gateway,
		APIKey:  apiKey,
	}
	if err := config.Write(cfg); err != nil {
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("writing config: %s", err),
		}
	}

	fmt.Fprintf(os.Stderr, "Configuration saved to %s\n", config.ConfigPath())

	// Verify connection if API key was provided.
	if apiKey != "" {
		gwClient := client.NewGatewayClient(gateway, apiKey)
		_, err := gwClient.GetStatus(false)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: could not verify gateway connection: %s\n", err)
			fmt.Fprintln(os.Stderr, "Config was saved. You can verify later with: feelr status")
		} else {
			fmt.Fprintln(os.Stderr, "Connected to gateway (healthy)")
		}
	}

	return nil
}
