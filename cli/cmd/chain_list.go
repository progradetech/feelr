package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter"

	"github.com/andrewprograde/feelr/cli/internal/chain"
	"github.com/spf13/cobra"
)

var chainListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available chains (built-in + local)",
	Long: `List all available chains from built-in registry and the current directory.

Built-in chains ship with Feelr. Local chains are .yaml/.yml/.json files
in the current directory that contain valid chain definitions.`,
	Args: cobra.NoArgs,
	RunE: runChainList,
}

func runChainList(cmd *cobra.Command, args []string) error {
	w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	fmt.Fprintln(w, "NAME\tDESCRIPTION\tSTEPS\tSOURCE")
	fmt.Fprintln(w, "----\t-----------\t-----\t------")

	// List built-in chains.
	for _, name := range chain.BuiltinChains {
		// Try to load the built-in chain for description and step count.
		desc := ""
		steps := "?"
		ch, err := chain.ResolveChain(name)
		if err == nil {
			desc = ch.Description
			steps = fmt.Sprintf("%d", len(ch.Steps))
		}
		fmt.Fprintf(w, "%s\t%s\t%s\tbuilt-in\n", name, desc, steps)
	}

	// Scan current directory for local chain files.
	localChains := findLocalChainFiles()
	for _, path := range localChains {
		ch, err := chain.LoadChain(path)
		if err != nil {
			continue // Skip invalid files silently.
		}
		name := ch.Name
		if name == "" {
			name = filepath.Base(path)
		}
		fmt.Fprintf(w, "%s\t%s\t%d\tlocal\n", name, ch.Description, len(ch.Steps))
	}

	w.Flush()
	return nil
}

// findLocalChainFiles scans the current directory for chain definition files.
func findLocalChainFiles() []string {
	var files []string
	for _, pattern := range []string{"*.yaml", "*.yml", "*.json"} {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		for _, m := range matches {
			// Quick check: read first bytes to see if it looks like a chain file.
			data, err := os.ReadFile(m)
			if err != nil || len(data) == 0 {
				continue
			}
			content := string(data)
			// Heuristic: chain files have "name:" (YAML) or "\"name\":" (JSON) and "steps:" or "\"steps\":" fields.
			isYAML := strings.Contains(content, "name:") && strings.Contains(content, "steps:")
			isJSON := strings.Contains(content, "\"name\"") && strings.Contains(content, "\"steps\"")
			if isYAML || isJSON {
				files = append(files, m)
			}
		}
	}
	return files
}
