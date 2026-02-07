---
phase: 08-composable-actions
plan: 04
subsystem: cli
tags: [go, cobra, chain, composable-actions, cli-commands]

# Dependency graph
requires:
  - phase: 08-03
    provides: Chain executor, condition evaluator, selector, loader
  - phase: 04-cli-core
    provides: CLI structure, gateway client, output formatters, config loading
provides:
  - "feelr chain run subcommand for executing chains via gateway"
  - "feelr chain list subcommand for discovering available chains"
  - "feelr chain validate subcommand for validating chain definitions"
  - "feelr chain show subcommand for displaying chain details"
  - "Built-in chain registry with ResolveChain resolution"
affects: [08-05, 08-06, 08-07, 09-self-hosting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chain resolution: file path -> built-in dir -> current dir"
    - "ActionRunner wraps gwClient.Run for CLI chain execution"
    - "Array responses wrapped in {items: arr} for consistent map access"

key-files:
  created:
    - cli/internal/chain/builtin.go
    - cli/cmd/chain.go
    - cli/cmd/chain_run.go
    - cli/cmd/chain_list.go
    - cli/cmd/chain_validate.go
    - cli/cmd/chain_show.go
  modified:
    - cli/cmd/root.go

key-decisions:
  - "ResolveChain checks file extension, then built-in dir relative to executable, then cwd"
  - "Array JSON responses from gateway wrapped in {items: arr} for consistent step output access"
  - "Local chain discovery uses heuristic (name: + steps: presence) to filter non-chain YAML/JSON"
  - "chain run --verbose sends step progress to stderr, final output to stdout"

patterns-established:
  - "Chain subcommand group pattern: parent cmd + run/list/validate/show"
  - "ActionRunner adapter: gwClient.Run -> map[string]interface{} for chain executor"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 8 Plan 4: CLI Chain Commands Summary

**Cobra subcommand group `feelr chain` with run/list/validate/show commands and built-in chain resolver**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T20:27:49Z
- **Completed:** 2026-02-07T20:31:18Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Built-in chain registry with 6 pre-defined chains and multi-location resolver
- `chain run` executes chains via gateway API with key=value params and --verbose per-step output
- `chain list` shows built-in and local chains in tabular format
- `chain validate` validates chain definition files with clear error reporting
- `chain show` displays formatted chain definitions with params, steps, and conditions
- All commands registered in root.go and respond to --help

## Task Commits

Each task was committed atomically:

1. **Task 1: Create built-in chain resolver and parent chain command** - `8de4a33` (feat)
2. **Task 2: Implement chain run, list, validate, show commands and register in root** - `d056bfb` (feat)

## Files Created/Modified
- `cli/internal/chain/builtin.go` - Built-in chain registry, ResolveChain resolver, IsBuiltinChain helper
- `cli/cmd/chain.go` - Parent chain command with subcommand registration
- `cli/cmd/chain_run.go` - Chain execution with gateway API runner, verbose mode, output formatting
- `cli/cmd/chain_list.go` - List built-in and local chains in table format
- `cli/cmd/chain_validate.go` - Validate chain definition files
- `cli/cmd/chain_show.go` - Display formatted chain definitions
- `cli/cmd/root.go` - Added chainCmd registration

## Decisions Made
- ResolveChain checks file extension first, then built-in dir relative to executable, then current directory
- Array JSON responses from gateway wrapped in `{"items": arr}` for consistent step output map access
- Local chain discovery uses heuristic (checks for name: + steps: fields) to filter non-chain YAML/JSON files
- chain run --verbose sends per-step progress to stderr, final output to stdout (consistent with run.go pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chain CLI commands fully functional, ready for 08-05 (gateway chain endpoint integration)
- Built-in chain registry provides foundation for bundling chain definitions
- ResolveChain resolution order supports both development (local files) and production (built-in dir)

---
*Phase: 08-composable-actions*
*Completed: 2026-02-07*

## Self-Check: PASSED
