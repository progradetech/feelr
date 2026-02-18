---
phase: 10-launch-prep
plan: 01
subsystem: payments
tags: [stripe, billing, metering, middleware, hono]

# Dependency graph
requires:
  - phase: 07-production-hardening
    provides: rate limiting tiers (free/pro/enterprise) and RateLimitTier type
  - phase: 09-self-hosting
    provides: FeelrConfig runtime interface with billing.enabled toggle
provides:
  - Billing types with 3-tier plan limits (hatchling/lobster/leviathan)
  - Stripe client factory for Workers/workerd environments
  - Plan enforcer middleware with monthly quota enforcement
  - Meter event recorder for Stripe Billing Meters API
  - PLAN_QUOTA_EXCEEDED error code and 402 HTTP status
affects: [10-02, 10-03, 10-04]

# Tech tracking
tech-stack:
  added: [stripe@20.3.1]
  patterns: [billing-bypass-middleware, best-effort-meter-events, kv-cached-billing-state]

key-files:
  created:
    - apps/gateway/src/billing/types.ts
    - apps/gateway/src/billing/stripe-client.ts
    - apps/gateway/src/billing/plan-enforcer.ts
    - apps/gateway/src/billing/meter.ts
  modified:
    - apps/gateway/src/auth/types.ts
    - apps/gateway/src/lib/types.ts
    - apps/gateway/src/app.ts
    - apps/gateway/package.json
    - packages/connector-sdk/src/errors.ts

key-decisions:
  - "Stripe SDK v20 standard import (conditional exports resolve to worker build via workerd condition)"
  - "API version pinned to 2026-01-28.clover (matches installed SDK version, not plan's 2025-12-18.acacia)"
  - "PLAN_QUOTA_EXCEEDED and 402 added to connector-sdk ErrorCode/FeelrHttpStatus (shared types)"
  - "Default to hatchling (free) tier when no billing record exists in KV"

patterns-established:
  - "Billing bypass pattern: check FEELR_CONFIG.billing.enabled first, return next() for self-hosted"
  - "KV-cached billing state: CustomerBilling at billing:<apiKeyShort> with best-effort increment"
  - "Stripe client lazy init: createStripeClientFromEnv returns null when secret key absent"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 10 Plan 01: Stripe Billing Summary

**3-tier plan enforcement (hatchling/lobster/leviathan) with metered Stripe Billing Meters and complete self-hosted bypass**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T15:25:21Z
- **Completed:** 2026-02-09T15:29:36Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Stripe billing integration with 3 plan tiers: hatchling (1K/mo), lobster (50K/mo), leviathan (500K/mo)
- Plan enforcer middleware that returns 402 with upgrade hint when monthly quota exceeded
- Async meter event recording via Stripe Billing Meters API using waitUntil pattern
- Complete billing bypass for self-hosted mode (no-op when billing.enabled is false)

## Task Commits

Each task was committed atomically:

1. **Task 1: Billing types, Stripe client, and plan limits** - `9f5d5be` (feat)
2. **Task 2: Plan enforcer middleware, meter events, and gateway wiring** - `5d47571` (feat)

## Files Created/Modified
- `apps/gateway/src/billing/types.ts` - BillingPlan, PlanLimits, CustomerBilling types + PLAN_LIMITS constant
- `apps/gateway/src/billing/stripe-client.ts` - Workers-compatible Stripe client factory + webhook crypto provider
- `apps/gateway/src/billing/plan-enforcer.ts` - Middleware checking monthly usage against plan limits
- `apps/gateway/src/billing/meter.ts` - Async meter event recording + createStripeClientFromEnv helper
- `apps/gateway/src/auth/types.ts` - Added optional stripeCustomerId to ApiKeyRecord
- `apps/gateway/src/lib/types.ts` - Added optional STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to AppEnv
- `apps/gateway/src/app.ts` - Wired planEnforcer() into middleware chain after rate limiter
- `apps/gateway/package.json` - Added stripe dependency
- `packages/connector-sdk/src/errors.ts` - Added PLAN_QUOTA_EXCEEDED error code and 402 HTTP status

## Decisions Made
- Used Stripe SDK v20 standard import path instead of plan's `stripe/lib/stripe.js` -- v20 has conditional exports with `workerd` condition that resolves to the worker-compatible entry point automatically
- Pinned API version to `2026-01-28.clover` (current SDK version) instead of plan's `2025-12-18.acacia` which does not exist in v20
- Added `PLAN_QUOTA_EXCEEDED` to connector-sdk `ErrorCode` union and `402` to `FeelrHttpStatus` -- the plan enforcer needs these types and they belong in the shared package
- Default to hatchling (free) tier when no billing KV record exists, consistent with how keys default to 'free' rate limit tier

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added PLAN_QUOTA_EXCEEDED to connector-sdk ErrorCode type**
- **Found during:** Task 1 (billing types setup)
- **Issue:** FeelrError constructor requires ErrorCode union type member, PLAN_QUOTA_EXCEEDED did not exist
- **Fix:** Added `'PLAN_QUOTA_EXCEEDED'` to ErrorCode union and `402` to FeelrHttpStatus in connector-sdk/src/errors.ts
- **Files modified:** packages/connector-sdk/src/errors.ts
- **Verification:** Typecheck passes with new error code usage in plan-enforcer.ts
- **Committed in:** 9f5d5be (Task 1 commit)

**2. [Rule 1 - Bug] Updated Stripe import path and API version**
- **Found during:** Task 1 (Stripe client creation)
- **Issue:** Plan specified `stripe/lib/stripe.js` import path and `2025-12-18.acacia` API version, but Stripe SDK v20 uses conditional exports and the current API version is `2026-01-28.clover`
- **Fix:** Used standard `import Stripe from 'stripe'` (resolved via workerd conditional export) and pinned to `2026-01-28.clover`
- **Files modified:** apps/gateway/src/billing/stripe-client.ts
- **Verification:** Typecheck passes, stripe.esm.worker.js confirmed in SDK exports
- **Committed in:** 9f5d5be (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for compilation and correct SDK usage. No scope creep.

## Issues Encountered
None.

## User Setup Required

This plan creates the billing infrastructure code but requires Stripe dashboard configuration before activation. The plan frontmatter documents the required setup:

- **Stripe API keys**: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables
- **Billing Meter**: Create `feelr_api_calls` meter in Stripe Dashboard
- **Products**: Create Hatchling/Lobster/Leviathan products with metered prices
- **Webhook**: Create endpoint for `/billing/webhook` with subscription events

## Next Phase Readiness
- Billing middleware chain is complete and wired into gateway
- Ready for Plan 02 (webhook handling for subscription state sync)
- Self-hosted mode fully bypasses all billing logic
- KV-cached billing state ready for webhook-driven updates

## Self-Check: PASSED

All 9 files verified present. Both task commits (9f5d5be, 5d47571) verified in git log.

---
*Phase: 10-launch-prep*
*Completed: 2026-02-09*
