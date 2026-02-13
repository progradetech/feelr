package cmd

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/andrewprograde/feelr/cli/internal/chain"
	"github.com/andrewprograde/feelr/cli/internal/client"
	"github.com/spf13/cobra"
)

var chainShowCmd = &cobra.Command{
	Use:   "show <name>",
	Short: "Display a chain definition with step details",
	Long: `Resolve and display a chain definition.

Shows the chain name, description, parameters, and all steps with
their action references, conditions, and parameter mappings.

Examples:
  feelr chain show github-slack-issue-notify
  feelr chain show my-chain.yaml`,
	Args: cobra.ExactArgs(1),
	RunE: runChainShow,
}

func runChainShow(cmd *cobra.Command, args []string) error {
	nameOrFile := args[0]

	ch, err := chain.ResolveChain(nameOrFile)
	if err != nil {
		return &client.CLIError{
			ExitCode: 1,
			Message:  fmt.Sprintf("resolving chain: %s", err),
		}
	}

	// Header.
	fmt.Fprintf(os.Stdout, "Chain: %s\n", ch.Name)
	if ch.Description != "" {
		fmt.Fprintf(os.Stdout, "Description: %s\n", ch.Description)
	}
	if ch.Version != "" {
		fmt.Fprintf(os.Stdout, "Version: %s\n", ch.Version)
	}
	fmt.Fprintf(os.Stdout, "Steps: %d\n", len(ch.Steps))

	// Retry policy.
	if ch.Retry.MaxAttempts > 1 {
		fmt.Fprintf(os.Stdout, "Retry: up to %d attempts, %ds delay\n", ch.Retry.MaxAttempts, ch.Retry.DelaySeconds)
	}

	// Parameters.
	if len(ch.Params) > 0 {
		fmt.Fprintln(os.Stdout)
		fmt.Fprintln(os.Stdout, "Parameters:")
		w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
		fmt.Fprintln(w, "  NAME\tTYPE\tREQUIRED\tDEFAULT\tDESCRIPTION")
		for _, p := range ch.Params {
			req := "no"
			if p.Required {
				req = "yes"
			}
			def := p.Default
			if def == "" {
				def = "-"
			}
			fmt.Fprintf(w, "  %s\t%s\t%s\t%s\t%s\n", p.Name, p.Type, req, def, p.Description)
		}
		w.Flush()
	}

	// Steps.
	fmt.Fprintln(os.Stdout)
	fmt.Fprintln(os.Stdout, "Steps:")
	for i, step := range ch.Steps {
		fmt.Fprintf(os.Stdout, "  %d. [%s] %s\n", i+1, step.ID, step.Uses)
		if step.If != "" {
			fmt.Fprintf(os.Stdout, "     if: %s\n", step.If)
		}
		if step.Timeout > 0 {
			fmt.Fprintf(os.Stdout, "     timeout: %ds\n", step.Timeout)
		}
		if len(step.With) > 0 {
			fmt.Fprintln(os.Stdout, "     with:")
			for k, v := range step.With {
				// Truncate long values for display.
				display := v
				if len(display) > 60 {
					display = display[:57] + "..."
				}
				fmt.Fprintf(os.Stdout, "       %s: %s\n", k, display)
			}
		}
		// Add separator between steps (except last).
		if i < len(ch.Steps)-1 {
			fmt.Fprintln(os.Stdout)

		}
	}

	// Source indicator.
	fmt.Fprintln(os.Stdout)
	if chain.IsBuiltinChain(ch.Name) {
		fmt.Fprintln(os.Stdout, "Source: built-in")
	} else if strings.HasSuffix(nameOrFile, ".yaml") || strings.HasSuffix(nameOrFile, ".yml") || strings.HasSuffix(nameOrFile, ".json") {
		fmt.Fprintf(os.Stdout, "Source: %s\n", nameOrFile)
	} else {
		fmt.Fprintln(os.Stdout, "Source: local")
	}

	return nil
}
