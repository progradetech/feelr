---
phase: 07
plan: 04
subsystem: gateway-usage-metering
tags: [usage-metering, rate-limiting, cron, d1, retention, dashboard-api]
dependency_graph:
  requires: [07-01, 06-01]
  provides: [error-metering, rate-limit-events, retention-cron, rate-limits-endpoint]
  affects: [07-05]
tech_stack:
  added: []
  patterns: [error-metering-via-try-catch, cron-retention-cleanup, per-key-rate-limit-analytics]
key_files:
  created: []
  modified:
    - apps/gateway/src/middleware/usage-recorder.ts
    - apps/gateway/src/routes/v1.ts
    - apps/gateway/src/routes/internal.ts
    - apps/gateway/src/scheduled.ts
decisions:
  - id: "07-04-error-metering"
    description: "Error status code extracted from FeelrError.status, falls back to 500 for unknown errors"
  - id: "07-04-retention-cutoff"
    description: "90-day retention calculated via Date arithmetic (not SQLite datetime) for testability"
  - id: "07-04-rate-limits-per-key"
    description: "Rate limits endpoint queries D1 per-key (not aggregated) for dashboard granularity"
metrics:
  duration: "3 min"
  completed: "2026-02-07"
---

# Phase 7 Plan 4: Usage Metering Extensions Summary

**One-liner:** Error metering in dispatch, rate_limit_events D1 table schema + recorder, 90-day cron retention, and /internal/rate-limits dashboard endpoint.

## What Was Done

### Task 1: Extend usage recording with error metering and rate limit events
**Commit:** `3efb2d7`

- Added `RATE_LIMIT_EVENTS_TABLE_SCHEMA` to usage-recorder.ts with `rate_limit_events` table (api_key_short, tier, ip, timestamp) plus indexes on api_key_short and timestamp
- Added `RateLimitEvent` interface and `recordRateLimitEvent` function for best-effort D1 insertion
- Wrapped action handler in v1.ts dispatch route with try/catch to record usage for failed requests
- Error status code extracted from `FeelrError.status` (or defaults to 500 for unknown errors)
- Both success (200) and error (4xx/5xx) paths record usage via `waitUntil` (non-blocking)
- Re-throws error after recording so global error handler formats the response

### Task 2: Implement cron retention handler and /internal/rate-limits endpoint
**Commit:** `28a76bb`

- Replaced `scheduled.ts` stub with full retention logic: calculates 90-day cutoff date, deletes `usage` rows older than cutoff, deletes `rate_limit_events` rows older than cutoff
- Each table cleanup is independent (partial failure in one doesn't block the other)
- Added `GET /internal/rate-limits` endpoint to internal.ts returning per-key rate limit data:
  - Lists all API keys from AUTH_KV
  - For each key: tier, limit (from TIER_LIMITS), usage_1m (requests in last 60 seconds), throttle_24h (rate limit events in last 24 hours)
  - Supports optional `?key=` query parameter for single key lookup
  - Returns standard `{ ok: true, data: [...] }` envelope
- Added `getUsageCount` and `getThrottleCount` helper functions with graceful pre-migration error handling

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 07-04-error-metering | Error status code from FeelrError.status, fallback 500 | FeelrError carries the correct HTTP status; unknown errors are 500 by convention |
| 07-04-retention-cutoff | 90-day cutoff via JS Date arithmetic, not SQLite datetime | JS Date is more testable and gives explicit ISO string for D1 comparison |
| 07-04-rate-limits-per-key | Rate limits endpoint returns per-key data (not aggregated) | Dashboard needs key-level granularity for monitoring and alerts |

## Deviations from Plan

None -- plan executed exactly as written.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extend usage recording with error metering and rate limit events | `3efb2d7` | usage-recorder.ts, v1.ts |
| 2 | Implement cron retention handler and /internal/rate-limits endpoint | `28a76bb` | scheduled.ts, internal.ts |

## Verification Results

1. `npx tsc --noEmit` passes with no errors
2. usage-recorder.ts exports `RATE_LIMIT_EVENTS_TABLE_SCHEMA` and `recordRateLimitEvent`
3. v1.ts records usage for both success (200) and error (4xx/5xx) responses via try/catch
4. scheduled.ts deletes usage and rate_limit_events rows older than 90 days
5. internal.ts has GET /rate-limits returning tier, limit, usage_1m, and throttle_24h per key

## Next Phase Readiness

Plan 07-05 can proceed -- all usage metering extensions are in place. The `recordRateLimitEvent` function is exported and ready for use by rate-limiter middleware (from 07-02/07-03). The /internal/rate-limits endpoint provides the dashboard data needed for rate limit monitoring.

## Self-Check: PASSED
