---
phase: 07
plan: 03
subsystem: gateway-rate-limiting
tags: [rate-limiting, middleware, cloudflare-workers, hono, response-headers]
dependency_graph:
  requires: [07-01]
  provides: [rate-limit-middleware, rate-limit-headers, middleware-chain-ordering]
  affects: [07-04, 07-05]
tech_stack:
  added: []
  patterns: [ip-rate-limiting, tier-based-rate-limiting, response-header-injection, middleware-chain-ordering]
key_files:
  created:
    - apps/gateway/src/middleware/rate-limiter.ts
    - apps/gateway/src/middleware/rate-limit-headers.ts
  modified:
    - apps/gateway/src/app.ts
decisions:
  - id: "07-03-retry-after-60"
    description: "Conservative 60s Retry-After for per-key 429 (full window period, not remaining time)"
  - id: "07-03-approximate-remaining"
    description: "RateLimit-Remaining is approximate (limit-1) since Cloudflare binding only returns success boolean"
  - id: "07-03-ip-no-retry-after"
    description: "IP rate limiter omits Retry-After (pre-auth defense, less guidance for abusers)"
metrics:
  duration: "3 min"
  completed: "2026-02-07"
---

# Phase 7 Plan 3: Rate Limit Middleware and Response Headers Summary

**One-liner:** IP pre-auth and per-key tier-based rate limiting middleware with RateLimit-* response headers wired into Hono app in correct order.

## What Was Done

### Task 1: Create IP + per-key rate limit middleware
**Commit:** `1d238ed`

- Created `rate-limiter.ts` with two exported middleware functions
- `ipRateLimiter`: Uses `cf-connecting-ip` header (with fallback) to rate limit by IP via `RATE_LIMIT_IP` binding (100 req/10s). Throws `FeelrError('RATE_LIMITED')` on 429. No Retry-After (pre-auth defense)
- `keyRateLimiter`: Uses authenticated `apiKeyRecord.tier` to select binding (`RATE_LIMIT_FREE`/`PRO`/`ENTERPRISE`). Sets `Retry-After: 60` header before throwing `FeelrError('RATE_LIMITED')` on 429
- Backward-compatible: `record.tier ?? 'free'` handles existing keys without tier field

### Task 2: Create rate limit response headers middleware and wire into app
**Commit:** `f128145`

- Created `rate-limit-headers.ts` that injects `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on every successful /v1/* response
- `RateLimit-Remaining` is approximate (limit - 1) since Cloudflare binding only exposes `{ success: boolean }`, not remaining count
- `RateLimit-Reset` aligns to next minute boundary (60s window)
- Updated `app.ts` middleware registration to enforce correct ordering:
  1. `ipRateLimiter` -- IP defense (BEFORE auth)
  2. `apiKeyMiddleware` -- Auth (existing)
  3. `keyRateLimiter` -- Per-key tier-based limit (AFTER auth)
  4. `rateLimitHeaders` -- Response headers (AFTER auth, runs on response)
- Updated app.ts header comment to document all 7 middleware layers

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 07-03-retry-after-60 | Conservative 60s Retry-After for per-key 429 | Full window period is safest; actual remaining time unknown from binding |
| 07-03-approximate-remaining | RateLimit-Remaining is approximate (limit-1) | Cloudflare Rate Limiting binding only returns `{ success: boolean }`, no remaining count |
| 07-03-ip-no-retry-after | IP rate limiter omits Retry-After header | Pre-auth defense -- providing timing info to potential abusers is counterproductive |

## Deviations from Plan

None -- plan executed exactly as written.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create IP + per-key rate limit middleware | `1d238ed` | middleware/rate-limiter.ts |
| 2 | Create rate limit response headers + wire app | `f128145` | middleware/rate-limit-headers.ts, app.ts |

## Verification Results

1. `tsc --noEmit` passes with no errors
2. `rate-limiter.ts` exports `ipRateLimiter` and `keyRateLimiter`
3. `rate-limit-headers.ts` exports `rateLimitHeaders`
4. `app.ts` middleware order: ipRateLimiter -> apiKeyMiddleware -> keyRateLimiter -> rateLimitHeaders
5. 429 responses include Retry-After header (in keyRateLimiter)
6. Successful responses include RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset headers

## Next Phase Readiness

Plan 07-04 (data retention and cleanup) can proceed immediately. The rate limiting middleware chain is fully wired and operational. The scheduled handler stub from 07-01 is ready for retention logic.

## Self-Check: PASSED
