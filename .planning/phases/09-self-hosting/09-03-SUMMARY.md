---
phase: 09-self-hosting
plan: 03
subsystem: runtime-adapters
tags: [durable-objects, sqlite, kv-store, usage-db, rate-limiter, self-hosted]
dependency-graph:
  requires: [09-01]
  provides: [self-hosted-kv-do, self-hosted-usage-db-do, in-memory-rate-limiter]
  affects: [09-05]
tech-stack:
  added: []
  patterns: [DO SQL storage for KV/D1 replacement, in-memory sliding window rate limiting]
key-files:
  created:
    - apps/gateway/src/runtime/self-hosted/kv-store-do.ts
    - apps/gateway/src/runtime/self-hosted/usage-db-do.ts
    - apps/gateway/src/runtime/self-hosted/rate-limiter.ts
  modified: []
decisions:
  - "KvStoreDO uses kv-prefixed RPC methods (kvGet, kvPut, etc.) to avoid DurableObject base class method conflicts"
  - "UsageDbDO splits index creation into separate exec calls (SQLite exec only runs one statement at a time)"
  - "InMemoryRateLimiter cleanup interval at 60s with 2x window cutoff for conservative memory management"
  - "Empty Record<string,never> for DO env types since self-hosted DOs need no external bindings"
metrics:
  duration: 2 min
  completed: 2026-02-08
---

# Phase 9 Plan 3: Self-Hosted Storage Adapters Summary

Self-hosted KV, D1, and rate limiting adapters implemented using workerd-native DO SQL storage and in-memory sliding window algorithm.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Implement KvStoreDO and UsageDbDO | 3853b3e | kv-store-do.ts, usage-db-do.ts |
| 2 | Implement InMemoryRateLimiter | 8703935 | rate-limiter.ts |

## What Was Built

### KvStoreDO (`self-hosted/kv-store-do.ts`)
- Durable Object extending `DurableObject` from `cloudflare:workers`
- Creates `kv` table (key TEXT PK, value TEXT) on construction via `blockConcurrencyWhile`
- RPC methods: `kvGet`, `kvGetJson`, `kvPut`, `kvDelete`, `kvList`
- `kvList` supports optional prefix filtering via SQL LIKE
- All operations use `this.ctx.storage.sql.exec()` matching TokenCoordinator pattern

### UsageDbDO (`self-hosted/usage-db-do.ts`)
- Durable Object extending `DurableObject` from `cloudflare:workers`
- Auto-creates `usage` and `rate_limit_events` tables with all indexes on construction
- RPC methods: `query` (all rows), `queryFirst` (first row), `execute` (INSERT/UPDATE/DELETE)
- `execute` returns `{ meta: { changes } }` via `SELECT changes()` for D1 compatibility
- Schemas match exactly what `usage-recorder.ts` and `internal.ts` expect

### InMemoryRateLimiter (`self-hosted/rate-limiter.ts`)
- Implements `RateLimiter` interface from `runtime/interfaces.ts`
- Sliding window algorithm: per-key timestamp arrays with configurable window/limit
- Periodic cleanup every 60 seconds removes expired entries (2x window cutoff)
- More accurate than Cloudflare distributed rate limiting for single-instance deployments
- Async interface for interface compatibility even though implementation is synchronous

## Verification Results

- All 3 files compile without type errors (`tsc --noEmit` passes)
- KvStoreDO extends DurableObject with `cloudflare:workers` import
- UsageDbDO extends DurableObject with auto-created tables + indexes
- InMemoryRateLimiter implements RateLimiter with sliding window
- No existing files modified

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **kv-prefixed RPC methods**: KvStoreDO uses `kvGet`, `kvPut`, etc. instead of `get`, `put` to avoid name collisions with DurableObject base class methods (like `fetch`). The adapter wrapper in Plan 05 will translate.

2. **Separate SQL exec calls for indexes**: Unlike the plan's multi-statement SQL strings, each `CREATE INDEX` is a separate `ctx.storage.sql.exec()` call because SQLite's exec in workerd only processes one statement at a time (same pattern as TokenCoordinator).

3. **Record<string, never> for env**: Both DOs use `Record<string, never>` as their env type since they have no external bindings (unlike TokenCoordinator which needs AUTH_KV, ENCRYPTION_KEY, etc.).

4. **Cleanup timer conservative cutoff**: InMemoryRateLimiter uses 2x the window duration for cleanup cutoff, providing a buffer against race conditions between the cleanup timer and active rate limit checks.

## Next Phase Readiness

Plan 05 (adapter factory) will wire these adapters into the gateway:
- KvStoreDO and UsageDbDO need wrangler.toml Durable Object bindings configured
- The factory will create DO stub wrappers that translate KeyValueStore/UsageDatabase method calls to the DO RPC methods
- InMemoryRateLimiter can be instantiated directly with config values from `feelr.yaml`

## Self-Check: PASSED
