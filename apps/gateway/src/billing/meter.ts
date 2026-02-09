/**
 * Stripe Billing Meter event recording.
 *
 * Records API usage events to Stripe's Billing Meters API for metered
 * subscription billing. All operations are best-effort -- errors are
 * caught and silently swallowed, following the same philosophy as
 * usage-recorder.ts.
 *
 * Meter events are fired asynchronously via waitUntil after successful
 * API requests, so they never block the response to the caller.
 */

import Stripe from 'stripe'
import { createStripeClient } from './stripe-client'
import type { AppEnv } from '../lib/types'

/**
 * Record a meter event to Stripe Billing Meters.
 *
 * Best-effort: catches all errors silently. Never throws.
 * Designed to be called via `c.executionCtx.waitUntil(recordMeterEvent(...))`.
 *
 * @param stripe - Initialized Stripe client
 * @param customerId - Stripe customer ID (cus_xxx)
 * @param value - Number of API calls to record (defaults to 1)
 */
export async function recordMeterEvent(
  stripe: Stripe,
  customerId: string,
  value?: number
): Promise<void> {
  try {
    await stripe.billing.meterEvents.create({
      event_name: 'feelr_api_calls',
      payload: {
        stripe_customer_id: customerId,
        value: String(value ?? 1),
      },
    })
  } catch {
    // Best-effort: silently swallow -- meter recording must never fail the request.
    // Common failures: invalid customer ID, meter not configured, network error.
  }
}

/**
 * Create a Stripe client from environment bindings, or null if not configured.
 *
 * Returns null when STRIPE_SECRET_KEY is missing, which is the normal
 * state for self-hosted deployments. This makes it safe to call without
 * checking billing.enabled first (though callers typically do).
 *
 * @param env - Gateway AppEnv Bindings
 */
export function createStripeClientFromEnv(
  env: AppEnv['Bindings']
): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) {
    return null
  }
  return createStripeClient(env.STRIPE_SECRET_KEY)
}
