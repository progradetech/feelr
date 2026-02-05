---
phase: 01-edge-gateway-foundation
plan: 01
subsystem: infra
tags: [pnpm, turborepo, typescript, zod, connector-sdk, monorepo, cloudflare-workers]

# Dependency graph
requires: []
provides:
  - "pnpm + Turborepo monorepo with apps/*, packages/*, connectors/* workspaces"
  - "@feelr/connector-sdk package with ConnectorDefinition, ActionDefinition, ActionContext, ActionResult, ParamDefinition interfaces"
  - "FeelrResponse<T>, FeelrErrorResponse, ResponseMeta envelope types"
  - "FeelrError class with ErrorCode union, Hint type, and normalized HTTP status codes"
  - "Zod 3 validation schemas for response and error envelopes"
  - "Shared TypeScript configs (@feelr/tsconfig) with base and worker presets"
  - "Empty gateway shell (@feelr/gateway) ready for Plan 02"
affects: [01-02, 01-03, 02-auth-vault, 03-github-connector, 04-cli-core]

# Tech tracking
tech-stack:
  added: [pnpm@9.15.0, turbo@2.8.3, typescript@5.x, zod@3.x, hono@4.x, "@hono/zod-openapi@0.19.x", "@hono/zod-validator@0.7.x", wrangler@4.x, "vitest@~3.2.0", "@cloudflare/vitest-pool-workers@0.9.x", "@cloudflare/workers-types@4.x"]
  patterns: [monorepo-workspace, raw-ts-exports, strict-package-boundaries, zod3-strict-objects]

key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - tsconfig.base.json
    - .gitignore
    - packages/tsconfig/package.json
    - packages/tsconfig/base.json
    - packages/tsconfig/worker.json
    - packages/connector-sdk/package.json
    - packages/connector-sdk/tsconfig.json
    - packages/connector-sdk/src/index.ts
    - packages/connector-sdk/src/types.ts
    - packages/connector-sdk/src/envelope.ts
    - packages/connector-sdk/src/errors.ts
    - packages/connector-sdk/src/validation.ts
    - apps/gateway/package.json
    - apps/gateway/tsconfig.json
    - apps/gateway/wrangler.toml
    - apps/gateway/vitest.config.ts
    - apps/gateway/src/index.ts
  modified: []

key-decisions:
  - "Pinned @hono/zod-openapi to 0.19.x (not 1.x) because 1.x requires Zod 4 which has unresolved compatibility issues with the hono/zod-openapi ecosystem"
  - "Used Zod 3 (z.object().strict()) throughout instead of Zod 4 (z.strictObject()) per plan guidance on production stability"
  - "Connector SDK exports raw TypeScript source (not compiled JS) for monorepo internal consumption"
  - "FeelrError stores code, hint, status, detail as private fields with getters for immutability"

patterns-established:
  - "Package boundary: connector-sdk has ZERO dependencies on gateway packages (hono, wrangler, cloudflare)"
  - "Raw TS export: packages use main/types pointing to src/index.ts, no build step needed"
  - "Vitest pin: ~3.2.0 tilde pin required for @cloudflare/vitest-pool-workers compatibility"
  - "Workspace protocol: all internal dependencies use workspace:* for version linking"

# Metrics
duration: 4min
completed: 2026-02-05
---

# Phase 1 Plan 01: Monorepo Scaffold and Connector SDK Summary

**pnpm + Turborepo monorepo with @feelr/connector-sdk providing all shared types, FeelrError class, envelope types, and Zod 3 validation schemas**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-05T21:51:43Z
- **Completed:** 2026-02-05T21:55:33Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments
- Scaffolded complete pnpm + Turborepo monorepo with apps/gateway, packages/connector-sdk, and packages/tsconfig workspaces
- Built full Connector SDK with ConnectorDefinition, ActionDefinition, ActionContext, ActionResult, ParamDefinition interfaces
- Implemented FeelrResponse<T>, FeelrErrorResponse, and ResponseMeta envelope types
- Created FeelrError class with 11 error codes, 3 actionable hints (retry/auth/abort), and normalized HTTP status set
- Added Zod 3 validation schemas for response and error envelopes
- Verified clean install + typecheck succeeds across all workspace packages

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold monorepo with pnpm workspace, Turborepo, and shared TypeScript configs** - `b2e09ea` (chore)
2. **Task 2: Build the Connector SDK -- types, envelope, errors, and Zod validation schemas** - `a95aaf3` (feat)

**Plan metadata:** `b605fc1` (docs: complete plan)

## Files Created/Modified
- `package.json` - Root workspace config with Turborepo scripts
- `pnpm-workspace.yaml` - Workspace definitions for apps/*, packages/*, connectors/*
- `turbo.json` - Turborepo pipeline config with build, dev, test, typecheck, deploy tasks
- `tsconfig.base.json` - Shared strict TS config (ES2022, bundler resolution)
- `.gitignore` - node_modules, dist, .wrangler, .turbo, *.tsbuildinfo
- `packages/tsconfig/package.json` - Shared tsconfig package identity
- `packages/tsconfig/base.json` - Base TypeScript config extended by all packages
- `packages/tsconfig/worker.json` - Workers-specific config (no DOM, @cloudflare/workers-types)
- `packages/connector-sdk/package.json` - SDK package with Zod 3 dependency, zero gateway deps
- `packages/connector-sdk/tsconfig.json` - Extends @feelr/tsconfig/base.json
- `packages/connector-sdk/src/index.ts` - Barrel export of all SDK types and values
- `packages/connector-sdk/src/types.ts` - ConnectorDefinition, ActionDefinition, ActionContext, ActionResult, ParamDefinition
- `packages/connector-sdk/src/envelope.ts` - FeelrResponse<T>, FeelrErrorResponse, ResponseMeta
- `packages/connector-sdk/src/errors.ts` - ErrorCode union, Hint type, FeelrError class
- `packages/connector-sdk/src/validation.ts` - Zod schemas for envelope validation
- `apps/gateway/package.json` - Gateway with Hono, vitest ~3.2.0 pin, workspace SDK dep
- `apps/gateway/tsconfig.json` - Extends worker.json, paths alias for connector-sdk
- `apps/gateway/wrangler.toml` - Workers config with compatibility_date 2026-02-05
- `apps/gateway/vitest.config.ts` - @cloudflare/vitest-pool-workers test pool config
- `apps/gateway/src/index.ts` - Placeholder fetch handler

## Decisions Made

1. **@hono/zod-openapi 0.19.x instead of 1.x** - Version 1.x requires Zod 4 as a peer dependency. Since the plan mandates Zod 3 for production stability and the @hono/zod-openapi ecosystem has unresolved Zod 4 compatibility issues, pinned to 0.19.10 which supports Zod 3 (peerDep: zod>=3.0.0).

2. **Zod 3 z.object().strict() pattern** - Used z.object().strict() for strict object validation instead of Zod 4's z.strictObject(). This is the correct API for Zod 3.24.x.

3. **FeelrError with private backing fields and getters** - Stored hint, status, detail as private fields with public getters for immutability, rather than exposing the raw options object.

4. **FeelrHttpStatus type** - Added an explicit type for the normalized HTTP status set (400|401|403|404|429|500|502) to enforce type safety at construction time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned @hono/zod-openapi to 0.19.x for Zod 3 compatibility**
- **Found during:** Task 1 (pnpm install)
- **Issue:** Plan specified @hono/zod-openapi ^1.2.0, but version 1.x requires Zod 4 as peer dependency. With zod@^3.24.0, pnpm install showed unmet peer dependency warnings.
- **Fix:** Changed to @hono/zod-openapi@^0.19.10 which has peerDep zod>=3.0.0
- **Files modified:** apps/gateway/package.json
- **Verification:** pnpm install completes with zero peer dependency warnings
- **Committed in:** b2e09ea (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for Zod 3 compatibility. No scope creep. The 0.19.x API is functionally equivalent for our use case (OpenAPIHono, createRoute).

## Issues Encountered
None - both tasks executed cleanly after the @hono/zod-openapi version fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Monorepo structure complete, ready for Plan 02 (Hono gateway routes, middleware, error handler)
- @feelr/connector-sdk is importable from @feelr/gateway via workspace:* protocol
- All types needed for Plan 02's route dispatch, error handling, and envelope wrapping are exported
- Gateway shell placeholder will be replaced with full Hono app in Plan 02

## Self-Check: PASSED

---
*Phase: 01-edge-gateway-foundation*
*Completed: 2026-02-05*
