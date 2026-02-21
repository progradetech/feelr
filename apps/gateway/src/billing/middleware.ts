/**
 * Billing middleware -- delegates quota enforcement and usage recording
 * to a pluggable BillingProvider.
 *
 * Runs AFTER rate limiting in the middleware chain so that rate-limited
 * requests (429) are not counted against the monthly quota.
 *
 * When billing.enabled is false (self-hosted mode), this middleware is a
 * complete no-op passthrough -- no provider calls, no KV lookups.
 *
 * When no BILLING_PROVIDER is registered on the environment, falls back
 * to NoopBillingProvider (always allows, never records).
 *
 * Flow:
 * 1. Check billing.enabled -- short-circuit if disabled
 * 2. Get BillingProvider from env (or default to NoopBillingProvider)
 * 3. Check apiKeyRecord -- short-circuit if missing
 * 4. Call provider.enforceQuota() -- deny with 402 if over quota
 * 5. Call next() -- process the request
 * 6. Inject X-Feelr-Quota-Limit, X-Feelr-Quota-Remaining, X-Feelr-Quota-Reset, X-Feelr-Plan headers
 * 7. Call provider.recordUsage() via waitUntil -- best-effort, non-blocking (success only)
 */

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { NoopBillingProvider } from './provider'
import type { BillingProvider } from './provider'
import { PLAN_LIMITS } from './types'
import type { BillingPlan, CustomerBilling } from './types'

/**
 * Billing middleware factory.
 *
 * Returns a Hono middleware that enforces billing quotas via BillingProvider.
 * Falls back to NoopBillingProvider when no provider is registered.
 * No-op when billing is disabled (self-hosted deployments).
 */
export function billingMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    // No-op for self-hosted: skip all billing logic
    if (!c.env.FEELR_CONFIG?.billing?.enabled) {
      return next()
    }

    // Get the billing provider (cloud entry injects StripeBillingProvider)
    const provider: BillingProvider =
      c.env.BILLING_PROVIDER ?? new NoopBillingProvider()

    const apiKeyRecord = c.get('apiKeyRecord')
    if (!apiKeyRecord) {
      // No authenticated key (shouldn't happen after apiKeyMiddleware, safe fallback)
      return next()
    }

    const apiKeyShort = apiKeyRecord.shortToken

    // Lazy migration: create Stripe customer for legacy keys missing stripeCustomerId
    if (!apiKeyRecord.stripeCustomerId && c.env.FEELR_CONFIG?.billing?.enabled) {
      try {
        const customerId = await provider.createCustomer(apiKeyShort)
        // Update apiKeyRecord in KV with billing fields
        const updatedRecord = {
          ...apiKeyRecord,
          stripeCustomerId: customerId,
          plan: 'hatchling' as const,
          quotaLimit: PLAN_LIMITS.hatchling.api_calls_per_month,
        }
        await c.env.AUTH_KV.put(`apikey:${apiKeyShort}`, JSON.stringify(updatedRecord))
        // Write reverse lookup for webhook handlers
        await c.env.AUTH_KV.put(`customer:${customerId}`, apiKeyShort)
        // Update the context variable so downstream middleware sees the updated record
        c.set('apiKeyRecord', updatedRecord as typeof apiKeyRecord)
      } catch {
        // Per user decision: if Stripe is down during lazy migration, the API request fails
        throw new FeelrError('INTERNAL_ERROR', {
          message: 'Billing service temporarily unavailable. Please retry.',
          hint: 'retry',
          status: 502,
        })
      }
    }

    // Enforce quota
    const result = await provider.enforceQuota(
      apiKeyShort,
      async (key) => c.env.AUTH_KV.get<CustomerBilling>(key, 'json'),
    )

    if (!result.allowed) {
      throw new FeelrError('PLAN_QUOTA_EXCEEDED', {
        message: `Monthly API quota exceeded for ${result.plan} plan (${result.limit?.toLocaleString()} calls/month). Upgrade your plan for higher limits.`,
        hint: 'abort',
        status: 402,
      })
    }

    // Proceed with the request, injecting quota headers in finally block
    let nextError: unknown = undefined
    try {
      await next()
    } catch (e) {
      nextError = e
    } finally {
      // Read billing state once -- used for both headers and usage recording
      const billing = await c.env.AUTH_KV.get<CustomerBilling>(
        `billing:${apiKeyShort}`,
        'json',
      )

      // Inject quota headers (always, even on error paths)
      const plan: BillingPlan = billing?.plan ?? 'hatchling'
      const limits = PLAN_LIMITS[plan]
      const used = billing?.currentMonthUsage ?? 0
      c.header('X-Feelr-Quota-Limit', String(limits.api_calls_per_month))
      c.header('X-Feelr-Quota-Remaining', String(Math.max(0, limits.api_calls_per_month - used)))
      c.header('X-Feelr-Plan', plan)
      if (billing?.billingCycleStart) {
        const resetDate = new Date(billing.billingCycleStart)
        resetDate.setMonth(resetDate.getMonth() + 1)
        c.header('X-Feelr-Quota-Reset', resetDate.toISOString())
      }

      // Record usage only on success (best-effort, non-blocking)
      if (!nextError) {
        const customerId = billing?.stripeCustomerId ?? apiKeyRecord.stripeCustomerId
        c.executionCtx.waitUntil(
          provider
            .recordUsage(apiKeyShort, billing, customerId, async (key, value) => {
              await c.env.AUTH_KV.put(key, value)
            })
            .catch(() => {
              // Best-effort: silently swallow errors
            }),
        )
      }
    }
    if (nextError) throw nextError
  })
}
