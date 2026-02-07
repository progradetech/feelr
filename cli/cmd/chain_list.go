package cmd

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/andrewprograde/feelr/cli/internal/chain"
	"github.com/spf13/cobra"
)

var chainListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available chains (built-in + local)",
	Long: `List all available chains from built-in directories and the current directory.

Built-in chains are discovered from chains/ directories relative to the
executable or current working directory. Local chains are .yaml/.yml/.json
files in the current directory that contain valid chain definitions.`,
	Args: cobra.NoArgs,
	RunE: runChainList,
}

func runChainList(cmd *cobra.Command, args []string) error {
	w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	fmt.Fprintln(w, "NAME\tDESCRIPTION\tSTEPS\tSOURCE")
	fmt.Fprintln(w, "----\t-----------\t-----\t------")

	chains := chain.ListAvailableChains()
	for _, ci := range chains {
		fmt.Fprintf(w, "%s\t%s\t%d\t%s\n", ci.Name, ci.Description, ci.Steps, ci.Source)
	}

	if len(chains) == 0 {
		fmt.Fprintln(os.Stderr, "No chains found. Place chain YAML files in a chains/ directory or the current directory.")
	}

	w.Flush()
	return nil
}
