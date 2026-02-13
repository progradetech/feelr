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
