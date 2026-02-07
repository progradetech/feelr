/**
 * Feelr Gateway -- Cloudflare Worker entry point.
 *
 * Exports the Worker as a module with:
 * - fetch: Hono app handler for HTTP requests
 * - scheduled: Cron trigger handler for data retention
 * - TokenCoordinator: Durable Object class for token refresh coordination
 */
import app from './app'
import { handleScheduled } from './scheduled'

export { TokenCoordinator } from './durable-objects/token-coordinator'

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
}
