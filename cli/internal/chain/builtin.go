package chain

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// BuiltinChains lists the names of all built-in chains that ship with Feelr.
var BuiltinChains = []string{
	"github-slack-issue-notify",
	"github-discord-pr-notify",
	"stripe-slack-payment-alert",
	"github-stripe-customer-issue",
	"slack-discord-cross-post",
	"github-slack-pr-review",
}

// ResolveChain resolves a chain name or file path to a loaded Chain.
// Resolution order:
//  1. If name ends in .yaml, .yml, or .json -> load as file path
//  2. Check built-in chains directory (chains/<name>.yaml relative to executable)
//  3. Check current directory (./<name>.yaml)
//  4. Return error if not found
func ResolveChain(name string) (*Chain, error) {
	// 1. Direct file path (has known extension).
	ext := strings.ToLower(filepath.Ext(name))
	if ext == ".yaml" || ext == ".yml" || ext == ".json" {
		return LoadChain(name)
	}

	// 2. Check built-in chains directory relative to executable.
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		builtinDir := filepath.Join(exeDir, "chains")
		for _, candidate := range []string{
			filepath.Join(builtinDir, name+".yaml"),
			filepath.Join(builtinDir, name+".yml"),
			filepath.Join(builtinDir, name+".json"),
		} {
			if _, statErr := os.Stat(candidate); statErr == nil {
				return LoadChain(candidate)
			}
		}
	}

	// 3. Check current directory.
	for _, candidate := range []string{
		name + ".yaml",
		name + ".yml",
		name + ".json",
	} {
		if _, statErr := os.Stat(candidate); statErr == nil {
			return LoadChain(candidate)
		}
	}

	return nil, fmt.Errorf("chain %q not found: provide a file path (e.g. %s.yaml) or place it in the chains/ directory", name, name)
}

// IsBuiltinChain returns true if the given name matches a known built-in chain.
func IsBuiltinChain(name string) bool {
	for _, b := range BuiltinChains {
		if b == name {
			return true
		}
	}
	return false
}
