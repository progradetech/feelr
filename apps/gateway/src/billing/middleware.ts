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
 * 6. Call provider.recordUsage() via waitUntil -- best-effort, non-blocking
 */

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { NoopBillingProvider } from './provider'
import type { BillingProvider } from './provider'
import type { CustomerBilling } from './types'

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
      (c.env as any).BILLING_PROVIDER ?? new NoopBillingProvider()

    const apiKeyRecord = c.get('apiKeyRecord')
    if (!apiKeyRecord) {
      // No authenticated key (shouldn't happen after apiKeyMiddleware, safe fallback)
      return next()
    }

    const apiKeyShort = apiKeyRecord.shortToken

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

    // Proceed with the request
    await next()

    // After successful response: record usage (best-effort, non-blocking)
    const billing = await c.env.AUTH_KV.get<CustomerBilling>(
      `billing:${apiKeyShort}`,
      'json',
    )
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
  })
}
