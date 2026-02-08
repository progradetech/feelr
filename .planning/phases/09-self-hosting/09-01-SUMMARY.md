---
phase: 09-self-hosting
plan: 01
subsystem: runtime-abstraction
tags: [interfaces, adapters, cloudflare, self-hosting, abstraction]
dependency-graph:
  requires: [08-composable-actions]
  provides: [runtime-interfaces, cloudflare-adapters]
  affects: [09-03, 09-04]
tech-stack:
  added: []
  patterns: [adapter-pattern, interface-segregation, platform-abstraction]
key-files:
  created:
    - apps/gateway/src/runtime/interfaces.ts
    - apps/gateway/src/runtime/cloudflare/kv-adapter.ts
    - apps/gateway/src/runtime/cloudflare/db-adapter.ts
    - apps/gateway/src/runtime/cloudflare/rate-limiter-adapter.ts
    - apps/gateway/src/runtime/cloudflare/token-coordinator-adapter.ts
  modified: []
decisions:
  - id: "09-01-01"
    decision: "KeyValueStore get() uses method overloading for string vs json return types"
    reason: "Matches KVNamespace API shape exactly as used throughout gateway (api-key.ts, keys.ts)"
  - id: "09-01-02"
    decision: "TokenCoordinatorClient.getStub() abstracts idFromName+get pattern into single call"
    reason: "Every DO usage in admin.ts and credentials.ts follows the same idFromName('default') -> get(id) pattern"
  - id: "09-01-03"
    decision: "CloudflareBoundStatement is a separate class wrapping D1PreparedStatement.bind() result"
    reason: "D1 bind() returns a new object with execution methods, matching the BoundStatement interface contract"
metrics:
  duration: 2 min
  completed: 2026-02-08
---

# Phase 9 Plan 1: Runtime Abstraction Interfaces Summary

**JWT-less platform abstraction: TypeScript interfaces for KV, D1, RateLimiter, and DO coordinator with zero-logic Cloudflare adapters**

## What Was Done

Defined 8 TypeScript interfaces that abstract every Cloudflare-specific binding used by the gateway, then implemented 4 Cloudflare adapter classes that wrap the real bindings behind those interfaces.

### Task 1: Define runtime abstraction interfaces (4ad683b)

Created `apps/gateway/src/runtime/interfaces.ts` exporting:
- **KeyValueStore** -- abstracts KVNamespace with get (string + json overload), put, delete, list
- **UsageDatabase** -- abstracts D1Database with prepare()
- **PreparedStatement** -- abstracts D1PreparedStatement with bind, all, first, run
- **BoundStatement** -- abstracts bound D1 result with all, first, run
- **RateLimiter** -- abstracts RateLimitBinding with limit()
- **TokenCoordinatorStub** -- abstracts DO RPC methods (storeCredential, removeCredential, listCredentials)
- **TokenCoordinatorClient** -- abstracts DO namespace access pattern with getStub()
- **FeelrConfig** -- runtime/billing/encryption toggles for cloud vs self-hosted

### Task 2: Implement Cloudflare cloud adapters (db7a84d)

Created 4 adapter classes in `apps/gateway/src/runtime/cloudflare/`:
- **CloudflareKvAdapter** -- wraps KVNamespace, delegates all methods directly
- **CloudflareDbAdapter** -- wraps D1Database with CloudflarePreparedStatement and CloudflareBoundStatement wrappers
- **CloudflareRateLimiterAdapter** -- wraps RateLimitBinding, delegates limit() directly
- **CloudflareTokenCoordinatorAdapter** -- wraps DurableObjectNamespace, implements getStub() via idFromName('default') + get(id)

## Verification

- `tsc --noEmit` passes with zero errors
- All 8 interfaces exported from interfaces.ts
- All 4 adapter files implement their respective interface
- No existing gateway files modified (all additions)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **KeyValueStore get() overloading** -- Used TypeScript method overloading to support both `get(key): string | null` and `get<T>(key, 'json'): T | null`, matching the exact KVNamespace API shape used by the gateway.

2. **Single getStub() call** -- Collapsed the DurableObjectNamespace `idFromName('default')` -> `get(id)` two-step pattern into a single `getStub()` method, since every usage in the codebase uses the same 'default' name.

3. **Separate BoundStatement class** -- D1's `bind()` returns a new object (not the same PreparedStatement), so the adapter mirrors this with a distinct CloudflareBoundStatement class wrapping the bind result.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Define runtime abstraction interfaces | 4ad683b | runtime/interfaces.ts |
| 2 | Implement Cloudflare cloud adapters | db7a84d | cloudflare/kv-adapter.ts, db-adapter.ts, rate-limiter-adapter.ts, token-coordinator-adapter.ts |

## Next Phase Readiness

Plan 09-01 provides the foundation for:
- **Plan 09-03** (Self-hosted adapters) -- will implement the same interfaces with SQLite/in-memory backends
- **Plan 09-04** (Gateway refactoring) -- will replace direct Cloudflare binding usage with interface imports

## Self-Check: PASSED
