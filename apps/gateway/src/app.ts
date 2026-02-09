import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { AppEnv } from './lib/types'
import { wrapError } from './lib/envelope'
import { errorHandler } from './middleware/error-handler'
import { ipRateLimiter, keyRateLimiter } from './middleware/rate-limiter'
import { rateLimitHeaders } from './middleware/rate-limit-headers'
import { planEnforcer } from './billing/plan-enforcer'
import { apiKeyMiddleware } from './middleware/api-key'
import { v1Routes } from './routes/v1'
import { toolsRoutes } from './routes/tools'
import { keyRoutes } from './routes/keys'
import { adminRoutes } from './routes/admin'
import { internalRoutes } from './routes/internal'
import { statusRoutes } from './routes/status'
import { chainsRoutes } from './routes/chains'

/**
 * Feelr Gateway -- OpenAPIHono application.
 *
 * Middleware chain on /v1/*:
 * 1. CORS (global)
 * 2. Logger (global)
 * 3. IP rate limiter (pre-auth defense -- 100 req/10s per IP)
 * 4. API key validation (KV-backed with timing-safe hash comparison)
 * 5. Per-key tier-based rate limiter (free: 30, pro: 300, enterprise: 3000 req/min)
 * 6. Rate limit response headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
 * 7. Error handler (global, registered via onError)
 *
 * Route structure:
 * - /v1/tools/*  - Connector discovery (requires API key)
 * - /v1/chains/* - Chain execution (requires API key)
 * - /v1/*        - Connector dispatch (requires API key)
 * - /admin/*    - Key + credential management (requires admin token, own auth)
 * - /internal/* - Dashboard data aggregation (requires admin token)
 * - /status     - Service health + connector health (requires API key)
 * - /health     - Health check (no auth)
 */
const app = new OpenAPIHono<AppEnv>()

// Global middleware
app.use('*', cors())
app.use('*', logger())

// Global error handler
app.onError(errorHandler)

// v1/* middleware chain (order matters):
// 1. IP rate limiter   -- pre-auth defense against brute-force
// 2. API key auth      -- validates key, populates apiKeyRecord
// 3. Per-key limiter   -- tier-based rate limiting (requires apiKeyRecord)
// 4. Plan enforcer     -- monthly quota check + meter event recording (no-op when billing disabled)
// 5. Response headers  -- injects RateLimit-* headers on successful responses
app.use('/v1/*', ipRateLimiter)
app.use('/v1/*', apiKeyMiddleware)
app.use('/v1/*', keyRateLimiter)
app.use('/v1/*', planEnforcer())
app.use('/v1/*', rateLimitHeaders)

// Mount admin key management routes (/admin/keys)
app.route('/admin', keyRoutes)

// Mount admin credential management routes (/admin/credentials)
app.route('/admin', adminRoutes)

// Mount internal dashboard data routes (/internal/overview, /internal/usage)
app.route('/internal', internalRoutes)

// Mount v1 tools discovery routes (before dispatch so /v1/tools is matched first)
app.route('/v1/tools', toolsRoutes)

// Mount v1 chain execution routes (before dispatch so /v1/chains is matched first)
app.route('/v1/chains', chainsRoutes)

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
