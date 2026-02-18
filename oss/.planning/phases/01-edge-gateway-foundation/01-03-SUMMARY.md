---
phase: 01-edge-gateway-foundation
plan: 03
subsystem: gateway-testing
tags: [vitest, cloudflare-workers, integration-tests, connector-template]

dependency-graph:
  requires: ["01-01", "01-02"]
  provides: ["integration-test-suite", "connector-template"]
  affects: ["02-*", "03-*", "05-*"]

tech-stack:
  added: []
  patterns: ["pool-workers-integration-testing", "SELF.fetch-pattern", "connector-template-pattern"]

key-files:
  created:
    - apps/gateway/src/__tests__/routes.test.ts
    - apps/gateway/src/__tests__/envelope.test.ts
    - apps/gateway/src/__tests__/errors.test.ts
    - connectors/_template/package.json
    - connectors/_template/tsconfig.json
    - connectors/_template/src/index.ts
    - connectors/_template/src/actions/.gitkeep
  modified:
    - apps/gateway/tsconfig.json
    - pnpm-lock.yaml

decisions:
  - key: "cloudflare-test-types"
    choice: "Add @cloudflare/vitest-pool-workers to gateway tsconfig types array"
    reason: "TypeScript cannot resolve cloudflare:test module without explicit type declarations"

metrics:
  duration: "4 min"
  completed: "2026-02-05"
---

# Phase 01 Plan 03: Integration Tests & Connector Template Summary

30 integration tests proving all Phase 1 gateway success criteria in Workers runtime, plus a connector template validating the SDK interface is practical for building new connectors.

## What Was Built

### Integration Test Suite (30 tests across 3 files)

**routes.test.ts (10 tests):** Route dispatch, connector lookup, action execution, POST body parsing, API key from header and query param, health check, OpenAPI doc, 404 handling.

**envelope.test.ts (10 tests):** Response envelope shape `{ ok, data, meta }`, UUID request_id, connector/action meta fields, duration_ms, list vs single data types, pagination (cursor + has_more), `?raw=true` bypass, snake_case field validation.

**errors.test.ts (10 tests):** Error envelope shape `{ ok, error: { code, message, hint, status } }`, CONNECTOR_NOT_FOUND and ACTION_NOT_FOUND codes, error.throw mock action, hint validation (retry/auth/abort), normalized status codes (400/401/403/404/429/500/502), HTTP status matches body status, detail field for upstream context, JSON (not HTML) 404 responses.

### Connector Template

A minimal, documented connector boilerplate at `connectors/_template/` that:
- Implements `ConnectorDefinition` with a `resource.list` example action
- Uses only Web Standard APIs (no hono, wrangler, or cloudflare imports)
- Depends only on `@feelr/connector-sdk` (no other runtime deps)
- Includes JSDoc instructions for creating new connectors
- Compiles cleanly with `pnpm turbo typecheck`

## Phase 1 Success Criteria Coverage

| Criterion | Test Coverage |
|-----------|--------------|
| GATE-01: Route dispatch | routes.test.ts: 10 tests (connector lookup, action exec, params, methods) |
| GATE-02: Response envelope | envelope.test.ts: 7 tests (shape, meta fields, list vs single, pagination) |
| GATE-03: Error handling | errors.test.ts: 10 tests (error shape, codes, hints, status normalization) |
| GATE-04: Normalization | envelope.test.ts: 3 tests (raw mode, snake_case, consistent shapes) |
| GATE-05: Connector SDK | Connector template proves interfaces are practical for building connectors |

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Integration tests for routes, envelope, errors | 0ea7a03 | routes.test.ts, envelope.test.ts, errors.test.ts |
| 2 | Connector template + tsconfig fix | 9384085 | connectors/_template/*, apps/gateway/tsconfig.json |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @cloudflare/vitest-pool-workers to gateway tsconfig types**
- **Found during:** Task 1 verification (typecheck failed)
- **Issue:** `tsc --noEmit` could not resolve `cloudflare:test` module used in test files
- **Fix:** Added `@cloudflare/vitest-pool-workers` to `compilerOptions.types` array in `apps/gateway/tsconfig.json` (alongside existing `@cloudflare/workers-types`)
- **Files modified:** `apps/gateway/tsconfig.json`
- **Commit:** 9384085 (bundled with Task 2)

## Decisions Made

1. **cloudflare:test types:** Added `@cloudflare/vitest-pool-workers` to gateway tsconfig types array. The pool-workers package ships its own type declarations for the `cloudflare:test` module, but TypeScript needs explicit configuration to find them.

## Next Phase Readiness

Phase 1 is now complete. All 3 plans executed:
- Plan 01: Monorepo scaffold + Connector SDK
- Plan 02: Gateway core + dispatch
- Plan 03: Integration tests + connector template

Ready for Phase 2 (Auth Vault) with:
- Proven gateway pipeline (30 passing tests)
- Connector template ready for GitHub connector (Phase 3)
- SDK interfaces validated as practical

## Self-Check: PASSED
