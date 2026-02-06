package cmd

import (
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
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

func init() {
	// Global persistent flags available to all subcommands.
	rootCmd.PersistentFlags().StringP("profile", "p", "default", "Named config profile to use")
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
func Execute() error {
	rootCmd.Version = version
	return rootCmd.Execute()
}
