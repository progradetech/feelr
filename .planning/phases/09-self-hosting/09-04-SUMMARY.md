---
phase: 09-self-hosting
plan: 04
subsystem: runtime-abstraction
tags: [refactor, interfaces, abstraction, self-hosting, gateway]
dependency-graph:
  requires: [09-01]
  provides: [runtime-agnostic-gateway]
  affects: [09-05, 09-06, 09-07]
tech-stack:
  added: []
  patterns: [interface-segregation, dependency-inversion]
key-files:
  created: []
  modified:
    - apps/gateway/src/lib/types.ts
    - apps/gateway/src/middleware/usage-recorder.ts
    - apps/gateway/src/auth/credentials.ts
    - apps/gateway/src/routes/internal.ts
    - apps/gateway/src/routes/admin.ts
    - apps/gateway/src/routes/status.ts
    - apps/gateway/src/lib/chain-executor.ts
    - apps/gateway/src/runtime/cloudflare/rate-limiter-adapter.ts
decisions:
  - id: "09-04-01"
    decision: "RateLimitBinding moved from lib/types.ts to local type in cloudflare adapter"
    reason: "The interface was Cloudflare-specific, so it belongs in the adapter layer, not in shared types"
  - id: "09-04-02"
    decision: "list() type parameter removed from internal.ts rate-limits route"
    reason: "KeyValueStore.list() does not support type parameters; the gateway only uses key.name from results anyway"
  - id: "09-04-03"
    decision: "chain-executor.ts and status.ts updated alongside planned files"
    reason: "These files also referenced KVNamespace/DurableObjectNamespace directly, would have caused compile errors"
metrics:
  duration: 4 min
  completed: 2026-02-08
---

# Phase 9 Plan 4: Gateway Abstraction Refactor Summary

**All gateway business logic refactored to use KeyValueStore, UsageDatabase, RateLimiter, and TokenCoordinatorClient interfaces instead of Cloudflare-specific types -- zero tsc errors, zero behavior change**

## What Was Done

Refactored every gateway source file that directly referenced Cloudflare binding types (KVNamespace, D1Database, DurableObjectNamespace, RateLimitBinding) to instead use the abstract runtime interfaces defined in Plan 09-01. This is the core of the "same codebase" self-hosting requirement.

### Task 1: Update AppEnv and core types (22212cf)

Updated `apps/gateway/src/lib/types.ts`:
- Removed the local `RateLimitBinding` interface (replaced by `RateLimiter` from interfaces.ts)
- Replaced `KVNamespace` with `KeyValueStore` for AUTH_KV binding
- Replaced `D1Database` with `UsageDatabase` for USAGE_DB binding
- Replaced `DurableObjectNamespace` with `TokenCoordinatorClient` for TOKEN_COORDINATOR binding
- Replaced all `RateLimitBinding` references with `RateLimiter` for rate limit bindings
- Added optional `FEELR_CONFIG` binding for runtime feature toggles
- All string bindings (ENCRYPTION_KEY, ADMIN_TOKEN, etc.) unchanged

### Task 2: Update all gateway files to use abstract interfaces (0edf756)

Updated 7 files to compile against abstract interfaces:

- **middleware/usage-recorder.ts** -- `recordUsage(db: D1Database)` -> `recordUsage(db: UsageDatabase)` and `recordRateLimitEvent(db: D1Database)` -> `recordRateLimitEvent(db: UsageDatabase)`
- **auth/credentials.ts** -- All 4 functions (`storeCredential`, `getCredential`, `removeCredential`, `listCredentials`) now accept `kv: KeyValueStore` instead of `kv: KVNamespace`
- **routes/internal.ts** -- All 4 helper functions (`getRecentUsage`, `getUsageBuckets`, `getUsageCount`, `getThrottleCount`) now accept `db: UsageDatabase` instead of `db: D1Database`. Removed type parameter from `list<ApiKeyRecord>()` call.
- **routes/admin.ts** -- All 3 TOKEN_COORDINATOR usages changed from `idFromName('default')` + `get(id) as unknown as ...` to `getStub()`. Much cleaner pattern.
- **routes/status.ts** -- TOKEN_COORDINATOR access changed to `getStub()` pattern
- **lib/chain-executor.ts** -- `ExecuteChainOptions.kv` and `executeStep` parameter changed from `KVNamespace` to `KeyValueStore`
- **runtime/cloudflare/rate-limiter-adapter.ts** -- Moved `RateLimitBinding` type locally as `CloudflareRateLimitBinding` (was importing from types.ts which no longer exports it)

## Verification

- `tsc --noEmit` passes with ZERO type errors
- `grep -r 'KVNamespace|D1Database|DurableObjectNamespace'` only matches:
  - `runtime/cloudflare/*` (adapter implementations)
  - `runtime/self-hosted/*` (adapter implementations)
  - `runtime/interfaces.ts` (comments only)
  - `durable-objects/token-coordinator.ts` (DO implementation, correctly Cloudflare-specific)
  - `__tests__/env.d.ts` (test environment type declarations)
  - `lib/types.ts` (comment only, explaining what was replaced)
- admin.ts uses `getStub()` pattern in all 3 routes
- usage-recorder.ts accepts `UsageDatabase`
- credentials.ts accepts `KeyValueStore`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] chain-executor.ts also used KVNamespace**

- **Found during:** Task 2
- **Issue:** `ExecuteChainOptions.kv` and `executeStep` parameter both typed as `KVNamespace`, causing compile errors after types.ts change
- **Fix:** Changed to `KeyValueStore` with import from runtime/interfaces
- **Files modified:** apps/gateway/src/lib/chain-executor.ts
- **Commit:** 0edf756

**2. [Rule 3 - Blocking] status.ts also used DurableObjectNamespace pattern**

- **Found during:** Task 2
- **Issue:** `status.ts` used `c.env.TOKEN_COORDINATOR.idFromName('default')` and `c.env.TOKEN_COORDINATOR.get(id)` directly
- **Fix:** Changed to `c.env.TOKEN_COORDINATOR.getStub()` pattern
- **Files modified:** apps/gateway/src/routes/status.ts
- **Commit:** 0edf756

**3. [Rule 3 - Blocking] rate-limiter-adapter.ts imported removed RateLimitBinding**

- **Found during:** Task 2
- **Issue:** Cloudflare rate limiter adapter imported `RateLimitBinding` from `../../lib/types` which no longer exports it
- **Fix:** Declared `CloudflareRateLimitBinding` locally in the adapter file (appropriate since it IS Cloudflare-specific)
- **Files modified:** apps/gateway/src/runtime/cloudflare/rate-limiter-adapter.ts
- **Commit:** 0edf756

**4. [Rule 1 - Bug] list() type parameter incompatible with KeyValueStore**

- **Found during:** Task 2
- **Issue:** `c.env.AUTH_KV.list<ApiKeyRecord>()` in internal.ts passed a type parameter, but `KeyValueStore.list()` doesn't accept one
- **Fix:** Removed type parameter (gateway only uses `key.name` from list results anyway)
- **Files modified:** apps/gateway/src/routes/internal.ts
- **Commit:** 0edf756

## Decisions Made

1. **RateLimitBinding relocated to adapter layer** -- The `RateLimitBinding` interface was removed from `lib/types.ts` (gateway-wide shared types) and redeclared locally as `CloudflareRateLimitBinding` in the Cloudflare rate limiter adapter. This is correct because the type is Cloudflare-specific and only the adapter needs it.

2. **list() type parameter removed** -- `KeyValueStore.list()` returns `{ keys: Array<{ name: string }> }` without generic type support. The type parameter on `KVNamespace.list<T>()` provided typed metadata, but the gateway never uses metadata -- only `key.name`. Removing it is semantically equivalent.

3. **Additional files updated beyond plan scope** -- `chain-executor.ts`, `status.ts`, and `rate-limiter-adapter.ts` were not in the plan's `files_modified` list but required changes to achieve zero compile errors. These are straightforward blocking fixes (Rule 3).

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Update AppEnv and core types | 22212cf | lib/types.ts |
| 2 | Update all gateway files to use abstract interfaces | 0edf756 | usage-recorder.ts, credentials.ts, internal.ts, admin.ts, status.ts, chain-executor.ts, rate-limiter-adapter.ts |

## Next Phase Readiness

Plan 09-04 completes the core "same codebase" requirement. The gateway now compiles entirely against abstract runtime interfaces:
- **Cloud path:** Cloudflare adapters (runtime/cloudflare/) wrap real bindings behind the interfaces
- **Self-hosted path:** Self-hosted adapters (runtime/self-hosted/) will provide alternative implementations
- **Plan 09-05/06** can now build the self-hosted worker entry point that wires self-hosted adapters into the same gateway code

## Self-Check: PASSED
