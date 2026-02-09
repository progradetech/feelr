/**
 * Plan enforcer middleware -- checks monthly API usage against plan limits.
 *
 * Runs AFTER rate limiting in the middleware chain so that rate-limited
 * requests (429) are not counted against the monthly quota.
 *
 * When billing.enabled is false (self-hosted mode), this middleware is a
 * complete no-op passthrough -- no Stripe SDK initialization, no KV lookups.
 *
 * Flow:
 * 1. Check billing.enabled -- short-circuit if disabled
 * 2. Look up cached CustomerBilling from KV (billing:<apiKeyShort>)
 * 3. Compare currentMonthUsage against PLAN_LIMITS[plan].api_calls_per_month
 * 4. If over quota: return 402 with PLAN_QUOTA_EXCEEDED
 * 5. If under quota: call next(), then fire meter event + increment usage via waitUntil
 */

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import type { CustomerBilling } from './types'
import { PLAN_LIMITS } from './types'
import { recordMeterEvent, createStripeClientFromEnv } from './meter'

/**
 * Plan enforcement middleware factory.
 *
 * Returns a Hono middleware that enforces monthly plan quotas.
 * No-op when billing is disabled (self-hosted deployments).
 */
export function planEnforcer() {
  return createMiddleware<AppEnv>(async (c, next) => {
    // No-op for self-hosted: skip all billing logic
    if (!c.env.FEELR_CONFIG?.billing?.enabled) {
      return next()
    }

    const apiKeyRecord = c.get('apiKeyRecord')
    if (!apiKeyRecord) {
      // No authenticated key (shouldn't happen after apiKeyMiddleware, safe fallback)
      return next()
    }

    const apiKeyShort = apiKeyRecord.shortToken

    // Look up cached billing state from KV
    const billingKey = `billing:${apiKeyShort}`
    let billing: CustomerBilling | null = null
    try {
      billing = await c.env.AUTH_KV.get<CustomerBilling>(billingKey, 'json')
    } catch {
      // KV read failed -- proceed without billing enforcement (best-effort)
    }

    // Default to hatchling (free) tier if no billing record exists
    const plan = billing?.plan ?? 'hatchling'
    const currentUsage = billing?.currentMonthUsage ?? 0
    const limits = PLAN_LIMITS[plan]

    // Check monthly quota
    if (currentUsage >= limits.api_calls_per_month) {
      throw new FeelrError('PLAN_QUOTA_EXCEEDED', {
        message: `Monthly API quota exceeded for ${plan} plan (${limits.api_calls_per_month.toLocaleString()} calls/month). Upgrade your plan for higher limits.`,
        hint: 'abort',
        status: 402,
      })
    }

    // Proceed with the request
    await next()

    // After successful response: fire meter event and increment cached usage (best-effort)
    const stripe = createStripeClientFromEnv(c.env)
    const customerId = billing?.stripeCustomerId ?? apiKeyRecord.stripeCustomerId

    if (stripe && customerId) {
      c.executionCtx.waitUntil(recordMeterEvent(stripe, customerId))
    }

    // Increment cached usage count in KV (best-effort, non-blocking)
    if (billing) {
      const updatedBilling: CustomerBilling = {
        ...billing,
        currentMonthUsage: billing.currentMonthUsage + 1,
      }
      c.executionCtx.waitUntil(
        c.env.AUTH_KV
          .put(billingKey, JSON.stringify(updatedBilling))
          .catch(() => {
            // Best-effort: silently swallow KV write errors
          })
      )
    }
  })
}
