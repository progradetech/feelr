/**
 * Feelr Gateway -- Cloudflare Worker entry point.
 *
 * Exports the Worker as a module with:
 * - fetch: Wraps raw Cloudflare bindings in adapter classes, delegates to Hono app
 * - scheduled: Cron trigger handler for data retention (with adapter wrapping)
 * - TokenCoordinator: Durable Object class for token refresh coordination
 *
 * Raw Cloudflare bindings (KVNamespace, D1Database, DurableObjectNamespace,
 * rate limit bindings) are wrapped via createCloudBindings() before being
 * passed to the Hono app, which expects abstract runtime interfaces.
 */
import app from './app'
import { handleScheduled } from './scheduled'
import { createCloudBindings } from './runtime/factory'

export { TokenCoordinator } from './durable-objects/token-coordinator'

export default {
  async fetch(request: Request, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    const adaptedEnv = createCloudBindings(rawEnv as never)
    return app.fetch(request, adaptedEnv, ctx)
  },

  async scheduled(event: ScheduledEvent, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<void> {
    const adaptedEnv = createCloudBindings(rawEnv as never)
    return handleScheduled(event, adaptedEnv, ctx)
  },
}
