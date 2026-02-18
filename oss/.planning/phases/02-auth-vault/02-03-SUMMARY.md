---
phase: 02-auth-vault
plan: 03
subsystem: token-coordination
tags: [durable-objects, sqlite, alarm, token-refresh, proactive-refresh, rpc]
requires:
  - 02-01 (crypto foundation, auth types, wrangler KV/DO config)
provides:
  - token-coordinator-do (TokenCoordinator class with SQLite storage)
  - alarm-based-proactive-refresh (5-minute buffer, exponential backoff)
  - do-rpc-methods (storeCredential, getCredential, removeCredential, listCredentials)
  - worker-entry-do-export (index.ts re-exports TokenCoordinator for wrangler binding)
affects:
  - 02-04 (Admin credential storage wires through DO for refresh scheduling)
  - 02-05 (Integration tests exercise DO coordinator methods and alarm behavior)
  - 03-xx (GitHub connector refresh will plug into performRefresh stub)
  - 05-xx (OAuth connectors will implement actual refresh logic in performRefresh)
tech-stack:
  added: []
  patterns:
    - SQLite-backed Durable Object with blockConcurrencyWhile schema initialization
    - RPC methods as primary DO interface (no fetch handler)
    - Alarm-based proactive token refresh with 5-minute expiry buffer
    - 3-retry exponential backoff (1s, 2s, 4s) with failed status on exhaustion
    - Per-user DO isolation via DO name = user identifier
key-files:
  created:
    - apps/gateway/src/durable-objects/token-coordinator.ts
  modified:
    - apps/gateway/src/index.ts
key-decisions:
  - TokenRow uses type alias with index signature (not interface) to satisfy SqlStorageValue constraint
  - Refresh stub logs intent and resets to active (real OAuth refresh deferred to Phase 3/5)
  - deleteAlarm() called when no tokens need refresh (clean alarm state)
  - scheduleRefresh uses 100ms delay for near-immediate proactive refresh on getCredential
  - Structured JSON console.log for all refresh events (token_refresh_stub, token_refresh_failed, token_refresh_error)
duration: 3 min
completed: 2026-02-06
---

# Phase 2 Plan 3: DO Token Coordinator with SQLite Storage and Alarm-Based Proactive Refresh Summary

SQLite-backed Durable Object serializing token refresh operations per user with alarm-based proactive refresh, 5-minute expiry buffer, 3-retry exponential backoff, and RPC methods for credential CRUD.

## Performance

- Duration: ~3 minutes
- Typecheck passes across all workspace packages
- Zero external dependencies added
- 1 type issue fixed during implementation (TokenRow index signature)

## Accomplishments

- Created `TokenCoordinator` DO class extending `DurableObject<Env>` with `blockConcurrencyWhile` SQLite schema initialization
- Implemented 4 RPC methods: `storeCredential`, `getCredential`, `removeCredential`, `listCredentials`
- Built alarm-based proactive refresh: tokens within 5-minute expiry buffer trigger automatic refresh scheduling
- Implemented 3-retry exponential backoff (1s, 2s, 4s) with `status='failed'` on exhaustion (token NOT deleted)
- Stubbed `performRefresh` with structured logging -- actual OAuth refresh deferred to Phase 3/5
- Updated worker entry point (`index.ts`) to re-export `TokenCoordinator` for wrangler `class_name` binding
- All SQL operations use `this.ctx.storage.sql.exec()` with typed generics for result rows

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create TokenCoordinator DO with SQLite storage and alarm-based refresh | d0133f6 | apps/gateway/src/durable-objects/token-coordinator.ts |
| 2 | Export TokenCoordinator from worker entry point | fac4ee4 | apps/gateway/src/index.ts |

## Files Created

- `apps/gateway/src/durable-objects/token-coordinator.ts` -- TokenCoordinator DO class with SQLite storage, RPC methods, alarm-based proactive refresh

## Files Modified

- `apps/gateway/src/index.ts` -- Added named export of TokenCoordinator for wrangler binding

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| TokenRow as type alias with index signature | TypeScript interfaces lack implicit index signatures; `Record<string, SqlStorageValue>` constraint on `sql.exec()` requires it. Type aliases work. |
| Refresh stub resets to active | Phase 2 has no connector refresh logic; stub logs intent and keeps token active. Real refresh plugs in at Phase 3/5. |
| deleteAlarm() on empty token set | Clean alarm state when no tokens need refresh, preventing stale alarms from firing unnecessarily. |
| 100ms delay for scheduleRefresh | Near-immediate alarm when getCredential detects approaching expiry, without blocking the read response. |
| Structured JSON logging | All refresh events logged as JSON to console for Workers Analytics / wrangler tail visibility. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TokenRow interface incompatible with SqlStorageCursor generic**

- **Found during:** Task 1 typecheck verification
- **Issue:** `interface TokenRow` does not satisfy `Record<string, SqlStorageValue>` because TypeScript interfaces lack implicit index signatures. `sql.exec<TokenRow>()` fails to compile.
- **Fix:** Changed `TokenRow` from `interface` to `type` alias with explicit `[key: string]: SqlStorageValue` index signature.
- **Files modified:** `apps/gateway/src/durable-objects/token-coordinator.ts`
- **Commit:** d0133f6 (included in Task 1 commit after fix)

## Issues Encountered

None beyond the TokenRow type fix (resolved immediately).

## User Setup Required

No additional setup required beyond what was established in 02-01:
- KV namespace creation and wrangler.toml ID update
- ENCRYPTION_KEY and ADMIN_TOKEN Worker Secrets

The TokenCoordinator DO binding is already configured in wrangler.toml (from 02-01) and the class is now exported from the worker entry point.

## Next Phase Readiness

- **02-04** (Admin auth + credential storage): Can call `TokenCoordinator.storeCredential()` via the `TOKEN_COORDINATOR` binding to register tokens for proactive refresh
- **02-05** (Integration tests): Can test DO via `cloudflare:test` utilities (`runInDurableObject`, `runDurableObjectAlarm`)
- **Phase 3/5** (Connectors): `performRefresh` stub is ready for real OAuth refresh adapter injection

## Self-Check: PASSED
