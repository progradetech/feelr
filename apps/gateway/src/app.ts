import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { AppEnv } from './lib/types'
import { wrapError } from './lib/envelope'
import { errorHandler } from './middleware/error-handler'
import { apiKeyMiddleware } from './middleware/api-key'
import { v1Routes } from './routes/v1'
import { toolsRoutes } from './routes/tools'
import { keyRoutes } from './routes/keys'
import { adminRoutes } from './routes/admin'
import { statusRoutes } from './routes/status'

/**
 * Feelr Gateway -- OpenAPIHono application.
 *
 * Middleware chain:
 * 1. CORS (global)
 * 2. Logger (global)
 * 3. API key validation (v1/* only -- KV-backed with timing-safe hash comparison)
 * 4. Error handler (global, registered via onError)
 *
 * Route structure:
 * - /v1/tools/* - Connector discovery (requires API key)
 * - /v1/*       - Connector dispatch (requires API key)
 * - /admin/*    - Key + credential management (requires admin token, own auth)
 * - /status     - Service health + connector health (requires API key)
 * - /health     - Health check (no auth)
 */
const app = new OpenAPIHono<AppEnv>()

// Global middleware
app.use('*', cors())
app.use('*', logger())

// Global error handler
app.onError(errorHandler)

// API key middleware on v1 routes only (admin routes use their own auth)
app.use('/v1/*', apiKeyMiddleware)

// Mount admin key management routes (/admin/keys)
app.route('/admin', keyRoutes)

// Mount admin credential management routes (/admin/credentials)
app.route('/admin', adminRoutes)

// Mount v1 tools discovery routes (before dispatch so /v1/tools is matched first)
app.route('/v1/tools', toolsRoutes)

// Mount v1 dispatch routes
app.route('/v1', v1Routes)

// Mount status route (/status -- requires API key, reports connector health)
app.route('', statusRoutes)

// OpenAPI documentation endpoint
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Feelr API',
    version: '1.0.0',
  },
})

// Health check
app.get('/health', (c) => {
  return c.json({ ok: true, version: '1.0.0' })
})

// 404 handler -- catches all unmatched routes
app.notFound((c) => {
  const body = wrapError({
    code: 'NOT_FOUND',
    message: 'The requested resource was not found',
    hint: 'abort',
    status: 404,
  })
  return c.json(body, 404)
})

export default app
