---
phase: 07-production-hardening
plan: 02
subsystem: cli
tags: [rate-limiting, retry, http-client, go]

dependency_graph:
  requires: [04-02, 05-05]
  provides: [cli-429-retry, rate-limit-transparency]
  affects: [07-03, 08-composable-actions]

tech_stack:
  added: []
  patterns: [single-retry-with-backoff, stderr-messaging, header-parsing]

file_tracking:
  key_files:
    created: []
    modified:
      - cli/internal/client/client.go

decisions:
  - id: "07-02-01"
    decision: "429 check before defer resp.Body.Close() with explicit close in retry path"
    reason: "Body must be closed before sleep+retry to avoid holding connection during wait"
  - id: "07-02-02"
    decision: "Missing Retry-After returns immediate error (no default wait)"
    reason: "Without server guidance, blind retry could worsen rate limiting"
  - id: "07-02-03"
    decision: "isRetry flag shared between 429 retry and auth-expired retry paths"
    reason: "Both use single-retry semantics; prevents compounding retries"

metrics:
  duration: "1 min"
  completed: "2026-02-07"
---

# Phase 7 Plan 02: CLI 429 Rate Limit Retry Summary

**One-liner:** Automatic single-retry on HTTP 429 with Retry-After header parsing, 120s cap, and stderr messaging in Go CLI client.

## What Was Done

### Task 1: Add 429 retry logic with Retry-After parsing to Go client (4ff6a34)

Modified `doRequestInner` in `cli/internal/client/client.go` to intercept HTTP 429 responses before body reading:

- **429 detection:** Checks `resp.StatusCode == 429 && !isRetry` immediately after `c.httpClient.Do(req)`
- **Body lifecycle:** Explicitly closes body before sleep (moved `defer resp.Body.Close()` after the 429 block)
- **Retry-After parsing:** Reads header, validates as positive integer, returns CLIError on missing/invalid
- **120s cap:** `if waitSeconds > 120 { waitSeconds = 120 }`
- **Stderr messaging:** `fmt.Fprintf(os.Stderr, "Rate limited. Waiting %ds...\n", waitSeconds)`
- **Single retry:** Clones request via existing `cloneRequest()`, calls `doRequestInner(retryReq, true)`
- **Second 429 fallthrough:** When `isRetry=true`, the 429 block is skipped; response falls through to normal envelope parsing where gateway's RATE_LIMITED error produces a CLIError

Added imports: `"os"` and `"strconv"`.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add 429 retry logic with Retry-After parsing | 4ff6a34 | cli/internal/client/client.go |

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **429 check before defer:** Body explicitly closed in retry path so connection is released during the wait sleep. Normal path retains `defer resp.Body.Close()` after the 429 block.
2. **No default wait on missing Retry-After:** Returns immediate CLIError rather than guessing a wait duration, preventing blind retry loops.
3. **Shared isRetry flag:** The existing `isRetry` parameter (used for auth-expired retry in 05-05) now also gates 429 retry, ensuring at most one retry per request regardless of reason.

## Verification Results

- `go build ./...` -- compiles without errors
- `go vet ./...` -- passes
- 429 status check with Retry-After parsing confirmed via grep
- 120s cap present (`waitSeconds > 120`)
- Stderr output confirmed (`Rate limited. Waiting %ds...`)
- Single retry enforced via `isRetry` flag

## Next Phase Readiness

No blockers. The 429 retry logic is self-contained in the client and does not affect any other subsystem. Composable actions (Phase 8) will inherit this behavior automatically through the existing client.

## Self-Check: PASSED
