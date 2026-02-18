---
phase: 04-cli-core
plan: 05
subsystem: cli
tags: [go, cobra, init-wizard, shell-completion, exit-codes, terminal-detection]

# Dependency graph
requires:
  - phase: 04-cli-core
    provides: Go module scaffold, config loader, gateway client, output formatters (04-02)
  - phase: 04-cli-core
    provides: Run command with key=value parsing and exit code mapping (04-03)
  - phase: 04-cli-core
    provides: Tools progressive discovery and status health check (04-04)
provides:
  - Interactive `feelr init` wizard with config file writing
  - Non-interactive terminal detection with CI/automation guidance
  - Shell completion generation for bash, zsh, and fish
  - Dynamic shell completion for run (connectors, actions) and tools (connector.action)
  - Consistent exit codes across all commands (0/1/2/3/4)
  - getProfile() helper for shared profile flag access
affects: [05-oauth-connectors, 10-launch-prep]

# Tech tracking
tech-stack:
  added: [golang.org/x/term]
  patterns: [interactive-terminal-detection, shell-completion-generation, dynamic-completion, exit-code-wrapping]

key-files:
  created:
    - cli/cmd/init_cmd.go
    - cli/cmd/completion.go
  modified:
    - cli/internal/config/config.go
    - cli/cmd/root.go
    - cli/cmd/run.go
    - cli/cmd/tools.go
    - cli/go.mod
    - cli/go.sum

key-decisions:
  - "golang.org/x/term for terminal detection (standard library extension, reliable cross-platform)"
  - "String formatting for TOML writing (not Viper write, which loses comments)"
  - "Config file permissions 0600, directory 0700 (API key security)"
  - "Cobra-native errors wrapped as CLIError exit code 4 in Execute()"
  - "All prompts to stderr (stdout reserved for data output)"

patterns-established:
  - "Init pattern: detect terminal -> check existing -> prompt -> write -> verify connection"
  - "Completion pattern: Cobra's Gen*Completion methods + ValidArgsFunction for dynamic args"
  - "Exit code wrapping: Execute() catches non-CLIError and wraps as exit code 4"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 4 Plan 5: Init, Completion, and Exit Codes Summary

**`feelr init` interactive wizard with terminal detection, `feelr completion` for bash/zsh/fish with dynamic arg completion, and hardened exit codes across all commands**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-06T18:36:34Z
- **Completed:** 2026-02-06T18:40:52Z
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 6

## Accomplishments

- `feelr init` interactively prompts for profile name, gateway URL, and API key
- Terminal detection via `golang.org/x/term` prevents hanging in piped/CI environments (exit 4 with env var instructions)
- Existing config detection with overwrite confirmation
- `config.Write()` creates `~/.feelr/config.toml` with TOML formatting and secure permissions (0600)
- `config.Exists()` checks for existing config file
- Optional gateway connectivity verification after config save
- `feelr completion bash|zsh|fish` generates valid shell completion scripts
- Dynamic completion for `run` command: connectors (arg 0) and actions (arg 1) from gateway
- Dynamic completion for `tools` command: connector names and connector.action patterns
- All Cobra-native errors (unknown commands, missing args, unknown flags) wrapped as exit code 4
- Exit code audit verified: 0=success, 1=error, 2=auth, 3=not-found, 4=usage
- All 5 subcommands registered: run, tools, status, init, completion
- `getProfile()` helper shared across completion functions and commands

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement init wizard and config writing** - `6484666` (feat)
2. **Task 2: Shell completion with dynamic arg completion** - `50ed429` (feat)
3. **Task 3: Verify and harden exit codes across all commands** - `7de9f6a` (fix)

## Files Created/Modified

- `cli/cmd/init_cmd.go` - Interactive init wizard (105 lines) with terminal detection, prompts, config writing
- `cli/cmd/completion.go` - Shell completion generation (42 lines) for bash, zsh, fish
- `cli/internal/config/config.go` - Added Write() and Exists() functions for config file management
- `cli/cmd/root.go` - Added getProfile() helper, registered init and completion commands, wrapped Cobra errors as exit code 4
- `cli/cmd/run.go` - Added ValidArgsFunction with dynamic connector/action completion
- `cli/cmd/tools.go` - Added ValidArgsFunction with dynamic connector.action completion
- `cli/go.mod` / `cli/go.sum` - Added golang.org/x/term dependency

## Decisions Made

- Used `golang.org/x/term.IsTerminal()` for terminal detection -- cross-platform, standard library extension
- TOML writing via string formatting (not Viper's write) to preserve comments and formatting
- Config file at 0600 permissions, directory at 0700 -- API key is sensitive data
- Prompts print to stderr, maintaining stream separation (data to stdout only)
- Non-interactive detection returns exit 4 with explicit env var setup instructions for CI
- Cobra-native errors (not CLIError) wrapped in Execute() as exit code 4 (usage errors)
- Optional gateway verify on init: logs warning on failure, does not fail init (config saved regardless)

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- zoxide `cd` hook (`__zoxide_z`) causes command-not-found errors in subshells; worked around using `pushd`/`popd`

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Phase 4 (CLI Core) is now COMPLETE: all 5 plans executed
- All 5 CLI commands are functional: run, tools, status, init, completion
- CLI is ready for Phase 5 (OAuth Connectors) which will use `feelr run` to test Slack, Discord, Stripe connectors
- Shell completion enables agent-friendly discovery of connectors and actions
- Exit codes provide structured machine-readable outcomes for automation

## Self-Check: PASSED
