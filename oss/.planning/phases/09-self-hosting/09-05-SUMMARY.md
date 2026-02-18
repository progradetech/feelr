---
phase: 09-self-hosting
plan: 05
subsystem: runtime-wiring
tags: [adapter-factory, workerd, self-hosted, entry-point, capnp]
dependency_graph:
  requires: ["09-01", "09-03", "09-04"]
  provides: ["adapter-factory", "self-hosted-entry", "workerd-config", "cloud-entry-wrapping"]
  affects: ["09-06", "09-07"]
tech_stack:
  added: []
  patterns: ["adapter-factory", "singleton-rate-limiters", "DO-stub-wrapping", "SPA-404-fallback"]
key_files:
  created:
    - apps/gateway/src/runtime/factory.ts
    - apps/gateway/src/runtime/self-hosted/kv-adapter-wrapper.ts
    - apps/gateway/src/runtime/self-hosted/db-adapter-wrapper.ts
    - apps/gateway/src/self-hosted-entry.ts
    - self-host/config.capnp
  modified:
    - apps/gateway/src/index.ts
decisions:
  - id: "09-05-01"
    decision: "DO stubs cast via 'as never' for structural interface bridging"
    reason: "workerd DO stubs have correct RPC methods at runtime but TypeScript sees DurableObjectStub type; 'as never' is cleanest bridge"
  - id: "09-05-02"
    decision: "buildAdaptedEnv extracted as shared function between fetch and scheduled handlers"
    reason: "Both handlers need identical adapter setup; DRY avoids env-building divergence"
  - id: "09-05-03"
    decision: "Cloud index.ts now wraps raw bindings via createCloudBindings before Hono app"
    reason: "Gateway expects abstract interfaces; raw Cloudflare types no longer compatible after 09-04 refactor"
  - id: "09-05-04"
    decision: "fromEnvironment bindings for secrets instead of hardcoded text"
    reason: "Secrets must come from container environment, not baked into config"
metrics:
  duration: "4 min"
  completed: "2026-02-08"
---

# Phase 9 Plan 5: Adapter Factory and Runtime Wiring Summary

**Factory creates cloud/self-hosted adapter bindings; workerd capnp config defines 3 DO namespaces with local disk storage; entry points wrap raw bindings before delegating to Hono app.**

## What Was Done

### Task 1: Adapter Wrappers and Factory

Created three files that bridge DO RPC methods to abstract interfaces:

- **kv-adapter-wrapper.ts**: `SelfHostedKvAdapter` wraps a KvStoreDO stub. Translates `get/put/delete/list` calls to `kvGet/kvGetJson/kvPut/kvDelete/kvList` RPC methods. Handles the `get(key, 'json')` overload by routing to `kvGetJson`.

- **db-adapter-wrapper.ts**: `SelfHostedDbAdapter` wraps a UsageDbDO stub. Implements the D1-style `prepare(sql).bind(...).all/first/run()` chain by deferring execution. `SelfHostedBoundStatement` holds SQL + values and dispatches to `stub.query/queryFirst/execute` on execution. `SelfHostedPreparedStatement` also supports direct `all/first/run` without `bind()` for parameterless queries.

- **factory.ts**: `createCloudBindings(rawEnv)` wraps all raw Cloudflare bindings in their adapter classes (CloudflareKvAdapter, CloudflareDbAdapter, CloudflareRateLimiterAdapter, CloudflareTokenCoordinatorAdapter). `detectRuntime(env)` reads the RUNTIME binding to determine cloud vs self-hosted mode.

### Task 2: Self-Hosted Entry Point and workerd Config

Created the self-hosted Worker entry point and workerd standalone configuration:

- **self-hosted-entry.ts**: Creates adapted bindings from DO namespace stubs. Rate limiters are singletons (created once per worker isolate via module-level variable). DO stubs created per-request (cheap `idFromName` + `get`). Exports all 3 DO classes (TokenCoordinator, KvStoreDO, UsageDbDO) for workerd instantiation. 404 fallback to DASHBOARD service binding for SPA routing (skips API/admin/internal routes).

- **config.capnp**: workerd standalone config with gateway worker, dashboard disk service, HTTP socket on *:8080. 3 DO namespaces (TokenCoordinator, KvStoreDO, UsageDbDO) with local disk storage at /data/feelr/do. Secrets via `fromEnvironment` bindings (FEELR_ENCRYPTION_KEY, FEELR_ADMIN_TOKEN, etc.). FEELR_CONFIG for JSON-encoded YAML config injection.

- **index.ts** (updated): Cloud entry point now wraps raw Cloudflare bindings via `createCloudBindings()` before delegating to the Hono app. Both `fetch` and `scheduled` handlers go through the factory.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Adapter wrappers and factory | d24cab1 | factory.ts, kv-adapter-wrapper.ts, db-adapter-wrapper.ts |
| 2 | Self-hosted entry point and workerd config | 8e0d6bd | self-hosted-entry.ts, config.capnp, index.ts |

## Decisions Made

1. **DO stubs cast via `as never`** -- workerd DO stubs have correct RPC methods at runtime but TypeScript sees DurableObjectStub type. Using `as never` for the intermediate cast is cleaner than `as unknown as SpecificType` chains.

2. **Shared `buildAdaptedEnv` function** -- Both fetch and scheduled handlers in self-hosted-entry.ts need identical adapter setup. Extracted to avoid divergence.

3. **Cloud index.ts now uses factory** -- After 09-04 refactored all gateway code to abstract interfaces, the cloud entry point must also wrap raw Cloudflare bindings through the adapter factory.

4. **`fromEnvironment` for secrets** -- workerd capnp config reads secrets from process environment (FEELR_ENCRYPTION_KEY, etc.) rather than hardcoding, matching Docker container deployment pattern.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with zero errors
- self-hosted-entry.ts exports: TokenCoordinator, KvStoreDO, UsageDbDO, default (fetch+scheduled)
- index.ts wraps TOKEN_COORDINATOR (and all bindings) via createCloudBindings
- config.capnp declares 3 DO namespaces (TokenCoordinator, KvStoreDO, UsageDbDO)
- factory.ts exports createCloudBindings and detectRuntime
- Adapter wrappers correctly translate between DO RPC methods and interface shapes

## Next Phase Readiness

Plan 06 (Docker packaging) can now reference:
- `self-host/config.capnp` for workerd configuration
- `apps/gateway/src/self-hosted-entry.ts` as the build entry point
- DO storage path `/data/feelr/do` for volume mounts
- Environment variables (FEELR_ENCRYPTION_KEY, FEELR_ADMIN_TOKEN, etc.) for secrets

No blockers identified.

## Self-Check: PASSED
