---
phase: 04-cli-core
plan: 02
subsystem: cli
tags: [go, cobra, viper, toml, http-client, output-formatters]

# Dependency graph
requires:
  - phase: 01-edge-gateway-foundation
    provides: gateway response envelope types (ok, data, error, meta)
  - phase: 03-github-connector
    provides: gateway /status endpoint and connector actions
provides:
  - Go module at cli/ with Cobra root command and global flags
  - TOML config loader with profile support and env override
  - Gateway HTTP client with 30s timeout and X-Feelr-Key auth
  - Gateway response Go types mirroring TypeScript envelope
  - Pluggable output formatters (JSON, minimal, table)
  - CLIError type with exit code mapping
affects: [04-03-run-command, 04-04-tools-status, 04-05-init-completion]

# Tech tracking
tech-stack:
  added: [go-1.25.7, cobra-v1.10.2, viper-v1.21.0, pflag-v1.0.10]
  patterns: [cobra-root-command, viper-new-instances, formatter-interface, stderr-error-routing]

key-files:
  created:
    - cli/go.mod
    - cli/go.sum
    - cli/main.go
    - cli/cmd/root.go
    - cli/internal/gateway/types.go
    - cli/internal/config/config.go
    - cli/internal/client/client.go
    - cli/internal/output/formatter.go
    - cli/internal/output/json.go
    - cli/internal/output/minimal.go
    - cli/internal/output/table.go
    - cli/Makefile
  modified: []

key-decisions:
  - "viper.New() instances instead of global Viper singleton (test isolation)"
  - "X-Feelr-Key header for auth (matches gateway middleware)"
  - "cursor as URL query parameter (not body field) matching gateway convention"
  - "JSON unwrapped data by default, full envelope with --verbose"
  - "Minimal format: pipe-delimited arrays, key=value objects"
  - "Table format: text/tabwriter with optional ANSI bold headers"
  - "All data to stdout, all errors to stderr"
  - "RunE on root command to show flags in help output"

patterns-established:
  - "Formatter interface: FormatData(json.RawMessage, *ResponseMeta) / FormatError(err)"
  - "CLIError with ExitCode for structured exit codes (0/1/2/3/4)"
  - "Config precedence: env > config file > defaults"
  - "GatewayClient methods: Run, GetTools, GetStatus, BuildRequest"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 4 Plan 2: Go Module Scaffold + Config + HTTP Client + Output Formatters Summary

**Go CLI foundation with Cobra root command, TOML config profiles, gateway HTTP client with X-Feelr-Key auth, and three output formatters (json/minimal/table)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T18:20:56Z
- **Completed:** 2026-02-06T18:25:44Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Go module initialized at cli/ with Cobra v1.10.2 and Viper v1.21.0
- Root command with all 6 global flags (--profile, --format, --verbose, --dry-run, --color, --gateway)
- TOML config loading with named profile sections and FEELR_API_KEY/FEELR_GATEWAY env overrides
- Gateway HTTP client with 30s timeout, X-Feelr-Key header, cursor as query param, and error-to-CLIError mapping
- Three output formatters: JSON (unwrapped default / verbose envelope), minimal (pipe-delimited / key=value), table (tabwriter with optional color)
- Gateway response types mirroring the TypeScript envelope (GatewayResponse, GatewayErrorResponse, ResponseMeta, ErrorDetail)

## Task Commits

Each task was committed atomically:

1. **Task 1: Go module scaffold + root command + gateway types** - `cc00c9e` (feat)
2. **Task 2: Config loader + HTTP client + output formatters** - `0017ccb` (feat)

## Files Created/Modified
- `cli/go.mod` - Go module definition (github.com/andrewprograde/feelr/cli)
- `cli/go.sum` - Dependency checksums
- `cli/main.go` - Thin entry point with CLIError exit code mapping
- `cli/cmd/root.go` - Root Cobra command with 6 global persistent flags
- `cli/internal/gateway/types.go` - Go structs mirroring gateway response envelope
- `cli/internal/config/config.go` - TOML config loader with profile support and env override
- `cli/internal/client/client.go` - Gateway HTTP client (Run, GetTools, GetStatus, BuildRequest)
- `cli/internal/output/formatter.go` - Formatter interface and factory function
- `cli/internal/output/json.go` - JSON formatter with unwrapped/verbose modes
- `cli/internal/output/minimal.go` - Minimal formatter (pipe-delimited arrays, key=value objects)
- `cli/internal/output/table.go` - Table formatter using text/tabwriter with optional ANSI bold
- `cli/Makefile` - Build targets: build, test, install, clean

## Decisions Made
- Used `viper.New()` instances instead of global Viper singleton to avoid test interference (per research pitfall #2)
- Auth header is `X-Feelr-Key` matching the gateway's API key middleware (not Authorization Bearer)
- Cursor passed as URL query parameter `?cursor=...` (not in request body) matching gateway convention from Phase 3
- Added `RunE` to root command that shows help -- without this, Cobra's help template omits the Flags section when no subcommands exist
- Installed Go 1.25.7 to user-local `~/go-sdk/` since no sudo access available

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Go not installed in environment; installed Go 1.25.7 to `~/go-sdk/go/` (user-local, no sudo)
- zoxide `cd` hook (`__zoxide_z`) causing command failures; worked around with `pushd`/`popd`
- Cobra help template hides Flags section when root command has no `Run`/`RunE`; added `RunE` that calls `cmd.Help()`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Go module builds cleanly, all packages compile, go vet passes
- Ready for Plan 04-03 (run command with key=value params, dry-run, output formatting)
- Ready for Plan 04-04 (tools progressive discovery + status health check)
- Config, client, and output packages are all importable from cmd/ layer

## Self-Check: PASSED

---
*Phase: 04-cli-core*
*Completed: 2026-02-06*
