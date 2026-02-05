---
phase: 01-edge-gateway-foundation
plan: 02
subsystem: api
tags: [hono, openapi, cloudflare-workers, middleware, connector-dispatch, envelope]

# Dependency graph
requires:
  - phase: 01-edge-gateway-foundation (plan 01)
    provides: Monorepo scaffold, @feelr/connector-sdk types, FeelrError, envelope types, Zod schemas
provides:
  - OpenAPIHono gateway app with CORS, logger, error handler, health check, 404 handler
  - API key extraction middleware (header + query param)
  - Connector registry (register/get/list)
  - Mock connector with echo, items.list, error.throw actions
  - V1 dispatch route (/:connector/:action) with param extraction and response wrapping
  - ?raw=true debug mode for raw upstream responses
  - wrapResponse/wrapError envelope helpers
affects: [01-03-testing, 02-auth-vault, 03-github-connector, 04-cli-core]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OpenAPIHono<AppEnv> with typed Bindings and Variables"
    - "Connector registry pattern (Map-based register/get/list)"
    - "V1 dispatch route: app.all('/:connector/:action') with RPC-style method agnosticism"
    - "Error handler cascade: FeelrError -> HTTPException -> unknown"
    - "System param filtering (key, raw, cursor) before action handler"
    - "Param defaults applied from ActionDefinition.params"

key-files:
  created:
    - apps/gateway/src/app.ts
    - apps/gateway/src/lib/types.ts
    - apps/gateway/src/lib/errors.ts
    - apps/gateway/src/lib/envelope.ts
    - apps/gateway/src/middleware/api-key.ts
    - apps/gateway/src/middleware/error-handler.ts
    - apps/gateway/src/routes/v1.ts
    - apps/gateway/src/connectors/registry.ts
    - apps/gateway/src/connectors/mock.ts
  modified:
    - apps/gateway/src/index.ts

key-decisions:
  - "AppEnv type is gateway-internal, not exported to connector-sdk"
  - "Request ID generated in API key middleware (first v1 middleware) via crypto.randomUUID()"
  - "app.all() for dispatch route -- RPC-style, method-agnostic"
  - "System params (key, raw, cursor) filtered before forwarding to action handler"
  - "Param defaults applied from action definition when param is undefined"
  - "?raw=true returns result.raw directly without envelope wrapping"

patterns-established:
  - "Connector dispatch: registry lookup -> action lookup -> param extraction -> handler call -> envelope wrap"
  - "Error envelope consistency: all errors return { ok: false, error: { code, message, hint, status } }"
  - "Mock connector as pipeline validator: echo (single), items.list (list), error.throw (error)"

# Metrics
duration: 6min
completed: 2026-02-05
---

# Phase 1 Plan 2: Gateway Core + Dispatch Summary

**OpenAPIHono gateway with connector dispatch, response envelope wrapping, and mock connector validating the full request pipeline end-to-end**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-05T21:59:08Z
- **Completed:** 2026-02-05T22:05:40Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Complete Hono gateway app with CORS, logger, error handler, health check, OpenAPI doc, and 404 handler
- API key extraction middleware supporting X-Feelr-Key header and ?key= query param
- Connector registry with Map-based register/get/list pattern
- Mock connector with 3 actions (echo, items.list, error.throw) validating all pipeline paths
- V1 dispatch route with param extraction, defaults, system param filtering, and ?raw=true support
- All 9 must_have truths verified against running wrangler dev server

## Task Commits

Each task was committed atomically:

1. **Task 1: Create gateway app, middleware, and library modules** - `74f6ef3` (feat)
2. **Task 2: Create connector registry, mock connector, and v1 dispatch route** - `3b9f3b6` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `apps/gateway/src/app.ts` - OpenAPIHono app with middleware chain, health check, 404 handler, OpenAPI doc
- `apps/gateway/src/index.ts` - Worker entry point re-exporting app
- `apps/gateway/src/lib/types.ts` - AppEnv type with Bindings and Variables
- `apps/gateway/src/lib/errors.ts` - Re-exports FeelrError from connector-sdk
- `apps/gateway/src/lib/envelope.ts` - wrapResponse and wrapError helpers
- `apps/gateway/src/middleware/api-key.ts` - Request ID generation + API key extraction
- `apps/gateway/src/middleware/error-handler.ts` - Global error handler for FeelrError/HTTPException/unknown
- `apps/gateway/src/routes/v1.ts` - V1 dispatch route with connector/action lookup
- `apps/gateway/src/connectors/registry.ts` - Connector registry (register/get/list)
- `apps/gateway/src/connectors/mock.ts` - Mock connector with echo, items.list, error.throw

## Decisions Made

- **AppEnv is gateway-internal:** Types live in `apps/gateway/src/lib/types.ts`, not in connector-sdk. Connectors don't need to know about Hono context bindings.
- **Request ID in API key middleware:** Both request_id and api_key extraction happen in a single middleware, keeping the middleware chain minimal.
- **app.all() for dispatch:** RPC-style gateway accepts any HTTP method. Connectors are action-based, not REST-based.
- **System param filtering:** `key`, `raw`, and `cursor` are stripped from params before forwarding to action handlers. Cursor may be re-used by the gateway for pagination coordination in future phases.
- **Param defaults from definition:** When a param is undefined in the request, the action's `default` value is applied. This ensures consistent behavior even when agents omit optional params.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all code compiled on first attempt and all endpoints returned expected responses.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gateway is fully functional and ready for test coverage in Plan 03
- Mock connector validates the complete pipeline: routing, param extraction, defaults, error handling, envelope wrapping, and raw mode
- Connector registry pattern established for adding GitHub connector in Phase 3
- API key middleware prepared for Phase 2 auth vault integration (currently extraction-only, no validation)

## Self-Check: PASSED

---
*Phase: 01-edge-gateway-foundation*
*Completed: 2026-02-05*
