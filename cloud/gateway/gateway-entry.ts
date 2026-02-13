/**
 * Feelr Cloud Gateway -- Cloudflare Worker entry point with billing overlay.
 *
 * Imports the OSS Hono app from the embedded subtree, wraps raw Cloudflare
 * bindings in adapter classes, and injects StripeBillingProvider as the
 * BILLING_PROVIDER environment binding before delegating to the app.
 *
 * This file is the cloud-specific entry point deployed via wrangler.cloud.toml.
 * It mirrors oss/apps/gateway/src/index.ts but adds:
 * - StripeBillingProvider instantiation from STRIPE_SECRET_KEY Worker secret
 * - FEELR_CONFIG override with billing.enabled = true
 */
import app from '../../oss/apps/gateway/src/app'
import { handleScheduled } from '../../oss/apps/gateway/src/scheduled'
import { createCloudBindings } from '../../oss/apps/gateway/src/runtime/factory'
import { StripeBillingProvider } from '../../oss/apps/gateway/src/billing/stripe'

export { TokenCoordinator } from '../../oss/apps/gateway/src/durable-objects/token-coordinator'

export default {
  async fetch(request: Request, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    const adaptedEnv = createCloudBindings(rawEnv as never)
    // Inject StripeBillingProvider with STRIPE_SECRET_KEY from Worker secrets
    const stripeKey = (rawEnv as { STRIPE_SECRET_KEY: string }).STRIPE_SECRET_KEY
    adaptedEnv.BILLING_PROVIDER = new StripeBillingProvider(stripeKey)
    // Override FEELR_CONFIG to enable billing in cloud mode
    adaptedEnv.FEELR_CONFIG = {
      runtime: 'cloud',
      billing: { enabled: true },
      encryption: { enabled: true },
    }
    return app.fetch(request, adaptedEnv, ctx)
  },

  async scheduled(event: ScheduledEvent, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<void> {
    const adaptedEnv = createCloudBindings(rawEnv as never)
    return handleScheduled(event, adaptedEnv, ctx)
  },
}
