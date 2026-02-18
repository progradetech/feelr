package cmd

import (
	"fmt"
	"os"

	"github.com/andrewprograde/feelr/cli/internal/chain"
	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/spf13/cobra"
)

var chainValidateCmd = &cobra.Command{
	Use:   "validate <file>",
	Short: "Validate a chain definition file",
	Long: `Validate a chain definition file and report any errors.

Checks structure, required fields, step IDs, param types, forward references,
and retry configuration.

Examples:
  feelr chain validate my-chain.yaml
  feelr chain validate ./chains/notify.json`,
	Args: cobra.ExactArgs(1),
	RunE: runChainValidate,
}

func runChainValidate(cmd *cobra.Command, args []string) error {
	filePath := args[0]

	ch, err := chain.LoadChain(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "INVALID: %s\n", err)
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("validation failed: %s", err),
		}
	}

	fmt.Fprintf(os.Stdout, "VALID: %s (%d steps, %d params)\n", ch.Name, len(ch.Steps), len(ch.Params))
	return nil
}
