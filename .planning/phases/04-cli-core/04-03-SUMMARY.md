---
phase: 04-cli-core
plan: 03
subsystem: cli
tags: [go, cobra, run-command, key-value-params, dry-run, exit-codes, http-client]

# Dependency graph
requires:
  - phase: 04-cli-core
    provides: Go module scaffold, config loader, gateway client, output formatters (04-02)
  - phase: 01-edge-gateway-foundation
    provides: gateway response envelope types and dispatch routes
provides:
  - Working `feelr run` subcommand for executing connector actions
  - Key=value parameter parsing for action params
  - --dry-run request preview via httputil.DumpRequestOut
  - --cursor pagination as URL query parameter
  - Exit code mapping (0=success, 1=error, 2=auth, 3=not-found, 4=usage)
  - Unified CLIError type (client.CLIError used by both main.go and commands)
affects: [04-04-tools-status, 04-05-init-completion]

# Tech tracking
tech-stack:
  added: []
  patterns: [key-value-param-parsing, dry-run-preview, exit-code-mapping, unified-cli-error]

key-files:
  created:
    - cli/cmd/run.go
  modified:
    - cli/internal/client/client.go
    - cli/main.go

key-decisions:
  - "Key=value positional args for action params, flags for system params (avoids namespace collision)"
  - "Cursor passed as URL query parameter in dry-run path (consistent with client.Run behavior)"
  - "Unified CLIError type from client package used everywhere (removed duplicate in main.go)"
  - "NOT_FOUND error code mapped to exit code 3 (was missing from initial client implementation)"

patterns-established:
  - "Run command pattern: parse args -> load config -> check auth -> build client -> dry-run or execute -> format output"
  - "Error formatting via formatter.FormatError before returning error (stderr display + exit code)"
  - "Dry-run dumps full HTTP request including headers and body to stderr"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 4 Plan 3: Run Command Summary

**`feelr run` subcommand with key=value param parsing, dry-run preview, cursor pagination, and exit code mapping for all error categories**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T18:29:07Z
- **Completed:** 2026-02-06T18:32:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- `feelr run <connector> <action> [key=value...]` parses params and sends POST to gateway
- `--dry-run` shows full HTTP request via httputil.DumpRequestOut (headers, body, URL) on stderr
- `--cursor` appends pagination cursor as URL query parameter (not body param)
- Invalid key=value args return exit code 4 with helpful error message
- Missing API key returns exit code 2 with direction to run `feelr init` or set env var
- NOT_FOUND gateway errors now correctly map to exit code 3 (was missing)
- Unified CLIError type -- main.go now uses client.CLIError instead of a duplicate local type

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement run command with key=value parsing** - `f6c09b6` (feat)

## Files Created/Modified
- `cli/cmd/run.go` - Run subcommand implementation (137 lines) with key=value parsing, dry-run, output formatting
- `cli/internal/client/client.go` - Added NOT_FOUND -> exit code 3 mapping in doRequest error handling
- `cli/main.go` - Unified CLIError type to use client.CLIError, removed duplicate type definition

## Decisions Made
- Used `strings.Cut(arg, "=")` for key=value splitting -- splits on first `=` only, allowing values to contain `=` characters
- Dry-run prints to stderr (not stdout) maintaining stream separation -- data goes to stdout, debug info to stderr
- API key check happens before client creation -- fails fast with exit code 2 and actionable message
- Gateway URL override via `--gateway` flag takes precedence over config file value

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CLIError type mismatch causing wrong exit codes**
- **Found during:** Task 1 (verification testing)
- **Issue:** main.go defined its own CLIError in package main, but commands return client.CLIError from package client. errors.As could not match across different types, so all errors defaulted to exit code 1 regardless of the CLIError.ExitCode value.
- **Fix:** Removed duplicate CLIError from main.go, imported and used client.CLIError in exitCodeFromError
- **Files modified:** cli/main.go
- **Verification:** `./feelr run github issues.list badparam` returns exit code 4; `./feelr run github issues.list repo=test/repo` returns exit code 2
- **Committed in:** f6c09b6 (part of task commit)

**2. [Rule 2 - Missing Critical] Added NOT_FOUND exit code 3 mapping in client**
- **Found during:** Task 1 (implementing error-to-exit-code mapping)
- **Issue:** Plan specifies NOT_FOUND -> exit code 3, but client.doRequest only handled hint="auth" -> 2. All other errors returned exit code 1.
- **Fix:** Added `strings.Contains(errResp.Error.Code, "NOT_FOUND")` check for exit code 3
- **Files modified:** cli/internal/client/client.go
- **Verification:** Code review confirms NOT_FOUND codes will return exit code 3
- **Committed in:** f6c09b6 (part of task commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes required for correct exit code behavior. No scope creep.

## Issues Encountered
- zoxide `cd` hook (`__zoxide_z`) causes command-not-found errors in shell; worked around using `pushd`/`popd`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `feelr run` is fully functional, builds cleanly, all verification checks pass
- Ready for Plan 04-04 (tools progressive discovery + status health check)
- Ready for Plan 04-05 (init wizard + shell completion)
- The run command correctly integrates config, client, and output formatter packages from Plan 04-02

## Self-Check: PASSED
