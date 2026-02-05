import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { AppEnv } from './lib/types'
import { wrapError } from './lib/envelope'
import { errorHandler } from './middleware/error-handler'
import { apiKeyMiddleware } from './middleware/api-key'
import { v1Routes } from './routes/v1'

/**
 * Feelr Gateway -- OpenAPIHono application.
 *
 * Middleware chain:
 * 1. CORS (global)
 * 2. Logger (global)
 * 3. API key extraction (v1/* only)
 * 4. Error handler (global, registered via onError)
 */
const app = new OpenAPIHono<AppEnv>()

// Global middleware
app.use('*', cors())
app.use('*', logger())

// Global error handler
app.onError(errorHandler)

// API key middleware on v1 routes only
app.use('/v1/*', apiKeyMiddleware)

// Mount v1 dispatch routes
app.route('/v1', v1Routes)

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
