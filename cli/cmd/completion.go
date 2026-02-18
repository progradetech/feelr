package cmd

import (
	"os"

	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/spf13/cobra"
)

var completionCmd = &cobra.Command{
	Use:   "completion [bash|zsh|fish]",
	Short: "Generate shell completion scripts",
	Long: `Generate shell completion scripts for bash, zsh, or fish.

Bash:
  source <(feelr completion bash)

Zsh:
  feelr completion zsh > "${fpath[1]}/_feelr"

Fish:
  feelr completion fish | source`,
	Args:      cobra.ExactArgs(1),
	ValidArgs: []string{"bash", "zsh", "fish"},
	RunE:      runCompletion,
}

func runCompletion(cmd *cobra.Command, args []string) error {
	switch args[0] {
	case "bash":
		return rootCmd.GenBashCompletion(os.Stdout)
	case "zsh":
		return rootCmd.GenZshCompletion(os.Stdout)
	case "fish":
		return rootCmd.GenFishCompletion(os.Stdout, true)
	default:
		return &client.CLIError{
			ExitCode: 4,
			Message:  "unsupported shell: " + args[0] + ". Supported: bash, zsh, fish",
		}
	}
}
