import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'

/**
 * API key extraction middleware.
 * Generates a unique request ID and extracts the API key from
 * the X-Feelr-Key header (preferred) or ?key= query parameter.
 *
 * Phase 1: No validation -- just extraction. Auth comes in Phase 2.
 */
export const apiKeyMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // Generate unique request ID for tracing
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)

  // Extract API key: header takes priority over query param
  const headerKey = c.req.header('X-Feelr-Key') ?? null
  const queryKey = new URL(c.req.url).searchParams.get('key')
  const apiKey = headerKey ?? queryKey

  c.set('apiKey', apiKey)

  await next()
})
