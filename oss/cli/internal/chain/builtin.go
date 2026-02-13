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

// ChainInfo describes a discoverable chain for listing purposes.
type ChainInfo struct {
	Name        string
	Description string
	Steps       int
	Source      string // "built-in" or "local"
	Path        string
}

// ResolveChain resolves a chain name or file path to a loaded Chain.
// Resolution order:
//  1. If name ends in .yaml, .yml, or .json -> load as file path
//  2. Check current directory (./<name>.yaml)
//  3. Check chains/ subdirectory in cwd
//  4. Check chains/ directory relative to executable
//  5. Check parent of executable directory (for development layouts)
//  6. Return error if not found
func ResolveChain(name string) (*Chain, error) {
	// 1. Direct file path (has known extension).
	ext := strings.ToLower(filepath.Ext(name))
	if ext == ".yaml" || ext == ".yml" || ext == ".json" {
		return LoadChain(name)
	}

	extensions := []string{".yaml", ".yml", ".json"}

	// 2. Check current directory.
	for _, e := range extensions {
		candidate := name + e
		if _, statErr := os.Stat(candidate); statErr == nil {
			return LoadChain(candidate)
		}
	}

	// 3. Check chains/ subdirectory in cwd.
	for _, e := range extensions {
		candidate := filepath.Join("chains", name+e)
		if _, statErr := os.Stat(candidate); statErr == nil {
			return LoadChain(candidate)
		}
	}

	// 4. Check chains/ directory relative to executable.
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		builtinDir := filepath.Join(exeDir, "chains")
		for _, e := range extensions {
			candidate := filepath.Join(builtinDir, name+e)
			if _, statErr := os.Stat(candidate); statErr == nil {
				return LoadChain(candidate)
			}
		}

		// 5. Check parent of executable directory (development layout: ../chains/).
		parentDir := filepath.Dir(exeDir)
		parentChainsDir := filepath.Join(parentDir, "chains")
		for _, e := range extensions {
			candidate := filepath.Join(parentChainsDir, name+e)
			if _, statErr := os.Stat(candidate); statErr == nil {
				return LoadChain(candidate)
			}
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

// ListAvailableChains scans for chains in built-in directories and the current
// working directory, returning ChainInfo structs for each discoverable chain.
func ListAvailableChains() []ChainInfo {
	var infos []ChainInfo
	seen := make(map[string]bool)

	// Scan built-in chains directories (relative to executable).
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)

		// chains/ next to executable.
		builtinDir := filepath.Join(exeDir, "chains")
		infos = append(infos, scanChainsDir(builtinDir, "built-in", seen)...)

		// chains/ in parent of executable (development layout).
		parentDir := filepath.Dir(exeDir)
		parentChainsDir := filepath.Join(parentDir, "chains")
		infos = append(infos, scanChainsDir(parentChainsDir, "built-in", seen)...)
	}

	// Scan chains/ subdirectory in cwd.
	infos = append(infos, scanChainsDir("chains", "built-in", seen)...)

	// Scan current directory for local chain files.
	infos = append(infos, scanChainsDir(".", "local", seen)...)

	return infos
}

// scanChainsDir scans a directory for chain definition files and returns ChainInfo
// for each valid chain found. Already-seen chain names are skipped.
func scanChainsDir(dir, source string, seen map[string]bool) []ChainInfo {
	var infos []ChainInfo

	for _, pattern := range []string{"*.yaml", "*.yml", "*.json"} {
		matches, err := filepath.Glob(filepath.Join(dir, pattern))
		if err != nil {
			continue
		}
		for _, path := range matches {
			ch, loadErr := LoadChain(path)
			if loadErr != nil {
				continue
			}
			name := ch.Name
			if name == "" {
				name = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
			}
			if seen[name] {
				continue
			}
			seen[name] = true
			absPath, _ := filepath.Abs(path)
			infos = append(infos, ChainInfo{
				Name:        name,
				Description: ch.Description,
				Steps:       len(ch.Steps),
				Source:      source,
				Path:        absPath,
			})
		}
	}

	return infos
}
