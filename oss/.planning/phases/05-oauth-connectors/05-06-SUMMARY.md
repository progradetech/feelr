---
phase: 05-oauth-connectors
plan: 06
subsystem: cli-tools-search
tags: [go, cli, cobra, search, tools, discovery]
depends_on:
  requires: ["05-04", "05-05"]
  provides: ["cli-tools-search-flag", "cross-connector-search"]
  affects: ["06-dashboard", "08-composable-actions"]
tech-stack:
  added: []
  patterns: ["search-query-forwarding", "flag-precedence-over-positional-args"]
key-files:
  created: []
  modified:
    - cli/cmd/tools.go
    - cli/internal/client/client.go
decisions:
  - id: "05-06-01"
    description: "Search flag takes precedence over positional args (--search wins if both provided)"
  - id: "05-06-02"
    description: "GetToolsSearch as separate method from GetTools for backward compat"
metrics:
  duration: "2 min"
  completed: "2026-02-06"
---

# Phase 05 Plan 06: CLI Tools Search Flag Summary

Added --search flag to CLI tools command for cross-connector action search via gateway ?search= endpoint.

## One-liner

Cobra --search flag on tools command with GetToolsSearch client method forwarding URL-encoded queries to /v1/tools?search= gateway endpoint.

## What Was Built

### Tools Command Enhancement (`cli/cmd/tools.go`)

**--search flag** - New string flag registered in `init()`:
- `feelr tools --search message` searches actions across all connectors
- Search takes precedence over positional args (checked before `len(args)` dispatch)
- Help text updated with search usage example

**toolsSearch function** - Routes search results through existing `output.NewFormatter` pipeline, consistent with all other tools subcommands. Calls `GetToolsSearch` on the gateway client.

### Client Extension (`cli/internal/client/client.go`)

**GetToolsSearch(query string)** - New method that sends `GET /v1/tools?search={url.QueryEscape(query)}` to the gateway. Uses `net/url.QueryEscape` for proper encoding of special characters. Returns standard `GatewayResponse` through existing `doRequest` pipeline.

Kept existing `GetTools(path string)` unchanged for backward compatibility with the 3-level progressive discovery (list connectors, list actions, action detail).

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add --search flag to tools command + client support | 5e8b20d | tools.go, client.go |

## Decisions Made

1. **Search flag precedence** - `--search` takes precedence over positional args. If both `--search message` and a positional arg are provided, search wins. This is consistent with the flag being an alternative discovery mode.

2. **Separate GetToolsSearch method** - Added `GetToolsSearch(query)` rather than modifying existing `GetTools(path)` signature. Keeps backward compat and makes the search semantics explicit at the call site.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `go build ./...` succeeds
- `feelr tools --help` shows `--search` flag with description
- Help text includes `feelr tools --search message` example
- `GetToolsSearch` sends GET to `/v1/tools?search=<encoded-query>`
- Search results formatted through existing `output.NewFormatter` pipeline
- Shell completion includes `--search` flag (Cobra auto-registers)

## Next Phase Readiness

Phase 05 (OAuth Connectors) is now complete. All 6 plans delivered:
- 05-01: Slack connector
- 05-02: Stripe connector
- 05-03: Discord connector
- 05-04: Gateway wiring (connectors + search endpoint)
- 05-05: CLI auth command
- 05-06: CLI tools search flag

No blockers for Phase 06 (Dashboard).

## Self-Check: PASSED
