---
phase: 04-cli-core
plan: 04
subsystem: cli-discovery
tags: [go, cobra, discovery, health, progressive-discovery, tools, status]
dependency-graph:
  requires: [04-01, 04-02]
  provides: [tools-progressive-discovery, status-health-check]
  affects: [04-05]
tech-stack:
  added: []
  patterns: [progressive-arg-parsing, three-level-discovery, deep-health-flag]
key-files:
  created:
    - cli/cmd/tools.go
    - cli/cmd/status.go
  modified:
    - cli/cmd/root.go
    - cli/internal/client/client.go
decisions:
  - "parseToolsArg splits on first dot: github.issues.list -> (github, issues.list)"
  - "404 gateway errors mapped to exit code 3 via client.CLIError"
  - "--schema flag outputs raw pretty-printed JSON (bypasses formatter)"
  - "GetStatus accepts deep bool parameter for ?deep=true query"
metrics:
  duration: 3 min
  completed: 2026-02-06
---

# Phase 04 Plan 04: Tools Discovery + Status Health Summary

**Progressive 3-level tools discovery (connectors, actions, param schema) and gateway status health check commands for the CLI.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T18:29:57Z
- **Completed:** 2026-02-06T18:32:34Z
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 2

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement tools command with progressive discovery | b2e502c | cli/cmd/tools.go, cli/cmd/root.go |
| 2 | Implement status command | 1fe217f | cli/cmd/status.go, cli/cmd/root.go, cli/internal/client/client.go |

## What Was Built

### Tools Command (cli/cmd/tools.go - 150 lines)

Three-level progressive discovery command:

1. **Level 0: `feelr tools`** -- Lists all registered connectors via GET /v1/tools. Shows connector name, version, action count, and auth type.

2. **Level 1: `feelr tools github`** -- Lists actions for a specific connector via GET /v1/tools/github. Shows action names, descriptions, and return types.

3. **Level 2: `feelr tools github.issues.list`** -- Shows full parameter schema for a specific action via GET /v1/tools/github/issues.list. Displays param names, types, required/optional, descriptions, and defaults.

The `--schema` flag (Level 2 only) outputs the raw JSON data for machine consumption, bypassing the formatter entirely.

Argument parsing: `parseToolsArg()` splits on the first dot, handling multi-segment action names correctly (e.g., "github.issues.list" -> connector="github", action="issues.list").

### Status Command (cli/cmd/status.go - 72 lines)

Gateway health check command:

- **`feelr status`** -- Fetches GET /status for gateway and connector health
- **`feelr status --deep`** -- Appends `?deep=true` for deep health checks on all connectors
- Output shows gateway status, version, and per-connector health with rate limit info

### Client Enhancement

- `GetStatus()` method updated to accept `deep bool` parameter, appending `?deep=true` query when true

### Both Commands Share

- Same config/client initialization pattern as `run` command
- Full --format support (json/minimal/table) via existing formatters
- --verbose support for full envelope output
- Exit code 2 for missing API key
- Exit code 3 for not-found (404) responses

## Decisions Made

1. **parseToolsArg splits on first dot** -- Connector names are single words ("github"), action names use dots ("issues.list"). Split on first dot handles this cleanly.
2. **404 mapped to exit code 3** -- NOT_FOUND gateway errors (unknown connector or action) use exit code 3, distinct from auth (2) and general errors (1).
3. **--schema bypasses formatter** -- Raw JSON pretty-print goes directly to stdout, useful for piping to jq or feeding to agents.
4. **GetStatus accepts deep parameter** -- Rather than building query params in the command, the client method handles URL construction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Uncommitted 04-03 run command changes**

- **Found during:** Task 1 (pre-execution)
- **Issue:** cli/cmd/run.go, cli/main.go, and cli/internal/client/client.go had uncommitted changes from a prior 04-03 plan execution
- **Fix:** Committed as `f6c09b6` before proceeding with 04-04 tasks
- **Files committed:** cli/cmd/run.go, cli/main.go, cli/internal/client/client.go

**2. [Rule 2 - Missing Critical] GetStatus deep parameter**

- **Found during:** Task 2
- **Issue:** client.GetStatus() had no parameter for deep health checks but plan requires --deep flag
- **Fix:** Added `deep bool` parameter to GetStatus method signature
- **Files modified:** cli/internal/client/client.go

## Verification Results

- `go build -o feelr .`: passed
- `go vet ./...`: passed
- `./feelr tools --help`: shows progressive discovery usage with all three levels
- `./feelr status --help`: shows health check usage with --deep flag
- `./feelr tools` without config: returns exit code 2 (auth error)
- `./feelr status` without config: returns exit code 2 (auth error)
- `./feelr tools github.issues.list --schema`: --schema flag recognized
- `./feelr status --deep`: --deep flag recognized
- tools.go: 150 lines (min 80 required)
- status.go: 72 lines (min 30 required)

## Next Phase Readiness

Both discovery and health commands are operational. Plan 04-05 (init + completion) can proceed. No blockers.

## Self-Check: PASSED
