/**
 * Stripe client factory for Cloudflare Workers / workerd environments.
 *
 * The Stripe SDK v20+ has conditional exports that resolve to the
 * worker-compatible entry point (stripe.esm.worker.js) when running
 * in workerd/worker environments. No special import path needed.
 */

import Stripe from 'stripe'

/**
 * Create a Stripe client configured for Workers runtime.
 *
 * Uses Stripe's built-in fetch-based HTTP client (default in worker builds)
 * and pins the API version to the SDK's bundled version.
 *
 * @param secretKey - Stripe secret key (sk_live_xxx or sk_test_xxx)
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
    httpClient: Stripe.createFetchHttpClient(),
  })
}

/**
 * SubtleCrypto provider for Stripe webhook signature verification.
 * Uses the Web Crypto API available in Workers/workerd.
 */
export const webCrypto = Stripe.createSubtleCryptoProvider()
