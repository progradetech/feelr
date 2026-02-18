---
phase: 03-github-connector
plan: 03
subsystem: gateway-status
tags: [health-check, rate-limit, github-api, status-endpoint]
dependency-graph:
  requires: [03-01, 02-02, 02-04]
  provides: [status-endpoint, connector-health-check]
  affects: [03-04, 04-01]
tech-stack:
  added: []
  patterns: [shallow-deep-health-check, per-connector-resilience]
key-files:
  created:
    - apps/gateway/src/routes/status.ts
  modified:
    - apps/gateway/src/app.ts
decisions: []
metrics:
  duration: 2 min
  completed: 2026-02-06
---

# Phase 3 Plan 3: /status Endpoint with Shallow/Deep Health Checks Summary

**One-liner:** Authenticated /status endpoint with GitHub /rate_limit shallow check, /user deep check, and rate limit info for agent batch planning

## What Was Done

### Task 1: Create /status route with shallow and deep health checks
- Created `apps/gateway/src/routes/status.ts` as a new Hono route module
- Authenticated via `apiKeyMiddleware` (locked decision -- rate limit info is per-token context)
- Shallow check (default): calls GitHub `/rate_limit` endpoint (free, no quota cost)
- Deep check (`?deep=true`): also validates PAT via `/user` endpoint and returns `authenticated_as`
- Uses raw `fetch` (not connector's githubFetch) since this is a gateway-level route
- Per-connector try/catch for resilience -- one failing connector doesn't crash the response
- Status determination: `healthy` (remaining > 0), `degraded` (remaining = 0), `unhealthy` (call failed)
- Rate limit info: remaining, limit, used, resets_at (ISO 8601 from epoch conversion)
- Discovers connectors dynamically via `listCredentials` (only reports connectors with stored credentials)
- Response wrapped in standard Feelr envelope with gateway meta (request_id, connector: 'gateway', action: 'status', duration_ms)

### Task 2: Mount /status route in gateway app
- Imported `statusRoutes` from `./routes/status`
- Mounted at `app.route('', statusRoutes)` (route module defines /status path internally)
- Updated route structure JSDoc to include `/status` endpoint

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create /status route with shallow and deep health checks | 884036b | routes/status.ts |
| 2 | Mount /status route in gateway app | f838b9d | app.ts |

## Decisions Made

None -- all decisions were locked in CONTEXT.md (authenticated endpoint, shallow /rate_limit default, deep /user optional).

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm turbo typecheck`: All 4 packages pass (connector-sdk, gateway, connector-template, connector-github)
- `/status` route created and exported as `statusRoutes`
- `apiKeyMiddleware` applied to `/status` route (no API key = 401)
- Shallow check calls GitHub `/rate_limit` endpoint
- Deep check (`?deep=true`) also calls `/user` to validate PAT
- Rate limit info visible in response (remaining, limit, used, resets_at)
- Per-connector try/catch ensures unhealthy connector doesn't crash status
- Route mounted in gateway `app.ts`

## Next Phase Readiness

Plan 03-04 can proceed. It will:
1. Add unit tests for the status endpoint (mock GitHub API responses)
2. Test shallow vs deep check behavior
3. Test error handling (credential missing, API unreachable, rate limit exhausted)

The /status route uses only Web Standard `fetch` and gateway-internal credential functions, making it straightforward to test with mocked KV and fetch responses.

## Self-Check: PASSED
