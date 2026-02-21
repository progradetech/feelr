package cmd

import (
	"errors"
	"os"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/andrewprograde/feelr/cli/internal/update"
	"github.com/spf13/cobra"
)

var version = "dev"

// SetVersion sets the CLI version (called from main with ldflags value).
func SetVersion(v string) {
	version = v
}

var rootCmd = &cobra.Command{
	Use:           "feelr",
	Short:         "Agent-friendly API simplification layer",
	Long:          "Feelr simplifies complex APIs into minimal, predictable CLI commands for AI agents.",
	Version:       version,
	SilenceUsage:  true,
	SilenceErrors: true,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		// Silent update check on every invocation. With a 24h cache, the
		// common case (cache hit) is a single file read (<1ms). Only on
		// stale cache does it make a GitHub API call (max 5s timeout).
		update.CheckForUpdate(version)
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

func init() {
	// Global persistent flags available to all subcommands.
	profileDefault := "default"
	if env := os.Getenv("FEELR_PROFILE"); env != "" {
		profileDefault = env
	}
	rootCmd.PersistentFlags().StringP("profile", "p", profileDefault, "Named config profile to use (env: FEELR_PROFILE)")
	rootCmd.PersistentFlags().StringP("format", "f", "json", "Output format: json, minimal, table")
	rootCmd.PersistentFlags().BoolP("verbose", "v", false, "Show full response envelope")
	rootCmd.PersistentFlags().Bool("dry-run", false, "Show HTTP request without executing")
	rootCmd.PersistentFlags().Bool("color", false, "Enable colored output")
	rootCmd.PersistentFlags().String("gateway", "", "Override gateway URL")

	// Register subcommands.
	rootCmd.AddCommand(runCmd)
	rootCmd.AddCommand(toolsCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(initCmd)
	rootCmd.AddCommand(completionCmd)
	rootCmd.AddCommand(authCmd)
	rootCmd.AddCommand(chainCmd)
}

// getProfile reads the --profile flag value from the command, returning
// "default" if the flag is missing or empty. Shared by completion functions
// and subcommands that need the profile before full flag parsing.
func getProfile(cmd *cobra.Command) string {
	p, _ := cmd.Flags().GetString("profile")
	if p == "" {
		return "default"
	}
	return p
}

// Execute runs the root command. Called from main.go.
// Cobra-generated errors (unknown commands, missing/extra args, unknown flags)
// are wrapped as CLIError with exit code 4 (usage error) so that main.go's
// exitCodeFromError returns a consistent code.
func Execute() error {
	rootCmd.Version = version
	err := rootCmd.Execute()
	if err != nil {
		// If it's already a CLIError, return as-is.
		var cliErr *client.CLIError
		if errors.As(err, &cliErr) {
			return err
		}
		// Wrap Cobra's native errors as usage errors (exit code 4).
		return &client.CLIError{
			ExitCode: 4,
			Message:  err.Error(),
		}
	}
	return nil
}
