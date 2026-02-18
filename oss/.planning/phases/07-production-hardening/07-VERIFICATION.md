---
phase: 07-production-hardening
verified: 2026-02-07T15:40:34Z
status: gaps_found
score: 2/3 must-haves verified
gaps:
  - truth: "Requests exceeding per-key rate limits receive 429 responses with a Retry-After header"
    status: partial
    reason: "Rate limiter throws 429 with Retry-After but does NOT record rate limit events"
    artifacts:
      - path: "apps/gateway/src/middleware/rate-limiter.ts"
        issue: "keyRateLimiter throws FeelrError on 429 but never calls recordRateLimitEvent"
    missing:
      - "Import recordRateLimitEvent from usage-recorder.ts in rate-limiter.ts"
      - "Call c.executionCtx.waitUntil(recordRateLimitEvent(...)) before throwing FeelrError in keyRateLimiter"
      - "Extract IP from c.req.header and tier from record for event recording"
---

# Phase 7: Production Hardening Verification Report

**Phase Goal:** The gateway enforces usage limits and tracks consumption for every API key
**Verified:** 2026-02-07T15:40:34Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Requests exceeding per-key rate limits receive 429 responses with a Retry-After header | ⚠️ PARTIAL | Middleware exists and throws 429 with Retry-After, BUT rate limit events are NOT recorded to D1 |
| 2 | Usage data is stored in D1 and queryable per key, per connector, and per time window | ✓ VERIFIED | D1 usage table records both success and error responses; /internal/usage and /internal/rate-limits endpoints query by key/connector/time |
| 3 | Rate limiting and metering do not add perceptible latency to normal requests | ✓ VERIFIED | All D1 writes use waitUntil (non-blocking); rate limit bindings are Cloudflare-native (sub-millisecond) |

**Score:** 2/3 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/gateway/src/auth/types.ts` | ApiKeyRecord with tier field | ✓ VERIFIED | Line 26: `tier: RateLimitTier` (required field). Line 11-18: RateLimitTier type + TIER_LIMITS constant |
| `apps/gateway/src/lib/types.ts` | AppEnv with RateLimit bindings | ✓ VERIFIED | Lines 31-37: RATE_LIMIT_FREE, RATE_LIMIT_PRO, RATE_LIMIT_ENTERPRISE, RATE_LIMIT_IP bindings |
| `apps/gateway/wrangler.toml` | Rate limit bindings + cron config | ✓ VERIFIED | Lines 39-62: 4 [[unsafe.bindings]] with type="ratelimit". Lines 65-66: crons = ["0 3 * * *"] |
| `apps/gateway/src/auth/keys.ts` | generateApiKey includes tier:'free' | ✓ VERIFIED | Line 64: `tier: 'free'` in record construction |
| `apps/gateway/src/routes/keys.ts` | Key creation stores tier, listing returns tier | ✓ VERIFIED | Lines 97-110: POST returns tier in response. Lines 137: GET returns tier with backward compat |
| `apps/gateway/src/index.ts` | Module export with fetch + scheduled | ✓ VERIFIED | Lines 14-17: exports object with fetch and scheduled handlers |
| `apps/gateway/src/scheduled.ts` | 90-day retention cleanup | ✓ VERIFIED | Lines 24-51: Deletes usage + rate_limit_events rows older than 90 days |
| `apps/gateway/src/middleware/rate-limiter.ts` | IP + per-key rate limiters | ✓ VERIFIED | ipRateLimiter (lines 13-29) and keyRateLimiter (lines 44-72) both exist and throw 429 with Retry-After |
| `apps/gateway/src/middleware/rate-limit-headers.ts` | Response header injection | ✓ VERIFIED | Lines 25-46: Adds RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset headers |
| `apps/gateway/src/app.ts` | Middleware wiring order | ✓ VERIFIED | Lines 51-54: Correct order: ipRateLimiter -> apiKeyMiddleware -> keyRateLimiter -> rateLimitHeaders |
| `cli/internal/client/client.go` | 429 retry with Retry-After | ✓ VERIFIED | Lines 282-311: Detects 429, parses Retry-After, caps at 120s, sleeps, retries once |
| `apps/gateway/src/routes/v1.ts` | Error metering in dispatch | ✓ VERIFIED | Lines 127-152: try/catch around action handler, records usage on error with status_code |
| `apps/gateway/src/middleware/usage-recorder.ts` | recordRateLimitEvent function | ✓ VERIFIED | Lines 115-129: Function exists and exports RATE_LIMIT_EVENTS_TABLE_SCHEMA |
| `apps/gateway/src/routes/internal.ts` | /rate-limits endpoint | ✓ VERIFIED | Lines 120-178: Returns per-key tier, limit, usage_1m, throttle_24h |
| `apps/dashboard/src/lib/hooks/use-usage.ts` | useRateLimits hook | ✓ VERIFIED | Lines 34-40: Hook with 30s refresh interval |
| `apps/dashboard/src/app/(dashboard)/usage/page.tsx` | Rate limit display UI | ✓ VERIFIED | Lines 110-231: RateLimitCard component with tier badge, usage bar, throttle count |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| app.ts | rate-limiter.ts | Middleware registration | ✓ WIRED | Lines 7-8: imports ipRateLimiter + keyRateLimiter. Lines 51-53: app.use('/v1/*', ...) in correct order |
| rate-limiter.ts | AppEnv RATE_LIMIT bindings | c.env.RATE_LIMIT_* | ✓ WIRED | Lines 19, 58: Uses binding.limit({ key }) for IP and per-key checks |
| rate-limit-headers.ts | TIER_LIMITS | Import + lookup | ✓ WIRED | Line 3: imports TIER_LIMITS. Line 34: uses TIER_LIMITS[tier] for RateLimit-Limit header |
| client.go | 429 response | HTTP status + Retry-After | ✓ WIRED | Line 282: checks resp.StatusCode == 429. Line 284: parses Retry-After header |
| v1.ts | usage-recorder.ts | recordUsage on error | ✓ WIRED | Line 12: imports recordUsage. Lines 139-148: calls recordUsage in catch block |
| internal.ts | rate_limit_events table | D1 query | ✓ WIRED | Lines 329-345: getThrottleCount queries rate_limit_events table |
| usage page | useRateLimits hook | Import + call | ✓ WIRED | Line 9: imports useRateLimits. Line 46: calls hook. Line 116: renders data |
| rate-limiter.ts | recordRateLimitEvent | waitUntil call | ✗ NOT_WIRED | recordRateLimitEvent is NEVER called from rate-limiter.ts when 429 occurs |

### Requirements Coverage

Phase 7 requirements from ROADMAP.md:

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| PLAT-02: Rate limiting per API key | ✓ SATISFIED | All infrastructure exists; gap is event recording (non-blocking to core functionality) |
| PLAT-03: Usage metering | ✓ SATISFIED | Usage metering records success AND error responses |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| rate-limiter.ts | 44-72 | Missing recordRateLimitEvent call in keyRateLimiter | ⚠️ WARNING | Dashboard shows 0 throttle events even when users are rate limited. Monitoring incomplete but core rate limiting works. |

### Gaps Summary

**1 gap preventing full goal achievement:**

The rate limiter middleware enforces rate limits correctly (returns 429 with Retry-After) but does NOT record rate limit events to the `rate_limit_events` D1 table. This means:

- ✓ Users ARE rate limited (429 responses work)
- ✓ CLI retries work (respects Retry-After)
- ✓ Dashboard displays rate limit info (tier, limit, current usage)
- ✗ Dashboard throttle count always shows 0 (no events recorded)

**Root cause:** The `keyRateLimiter` middleware (lines 44-72) throws `FeelrError` on 429 but never calls `recordRateLimitEvent`. The function exists and is exported from `usage-recorder.ts`, but is not imported or invoked.

**Fix required:**
1. Import `recordRateLimitEvent` from `../middleware/usage-recorder`
2. Before throwing `FeelrError` on line 64, add:
   ```typescript
   c.executionCtx.waitUntil(
     recordRateLimitEvent(c.env.USAGE_DB, {
       api_key_short: record.shortToken,
       tier,
       ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown',
       timestamp: new Date().toISOString(),
     })
   )
   ```

**Impact:** Low severity. Core rate limiting functionality works perfectly. Only monitoring/observability is incomplete. Users can still see their tier and current usage in the dashboard.

---

_Verified: 2026-02-07T15:40:34Z_
_Verifier: Claude (gsd-verifier)_
