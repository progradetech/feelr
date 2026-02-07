package cmd

import (
	"github.com/spf13/cobra"
)

var chainCmd = &cobra.Command{
	Use:   "chain <command>",
	Short: "Manage and execute composable action chains",
	Long: `Discover, validate, and execute composable action chains.

A chain is a sequence of connector actions that execute in order,
passing data between steps via template expressions.

Commands:
  run        Execute a chain by name or file path
  list       List available chains (built-in + local)
  validate   Validate a chain definition file
  show       Display a chain definition with step details`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}
