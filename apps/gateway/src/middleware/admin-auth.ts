/**
 * Admin authentication middleware.
 *
 * Validates Bearer token from the Authorization header against ADMIN_TOKEN
 * using timing-safe comparison to prevent timing attacks.
 *
 * Applied to all /admin/* routes that manage credentials.
 * API key middleware (/v1/*) and admin auth (/admin/*) are separate scopes.
 */

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'

/**
 * Middleware that validates admin Bearer token with timing-safe comparison.
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. If missing or malformed: throw ADMIN_AUTH_REQUIRED (401)
 * 3. Length check (different lengths always fail fast)
 * 4. Timing-safe compare against ADMIN_TOKEN binding
 * 5. If invalid: throw ADMIN_AUTH_INVALID (403)
 */
export const adminAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    throw new FeelrError('ADMIN_AUTH_REQUIRED', {
      message: 'Admin token required. Include Authorization: Bearer <admin-token> header.',
      hint: 'auth',
      status: 401,
    })
  }

  const token = authHeader.slice(7) // Remove "Bearer " prefix

  if (!token) {
    throw new FeelrError('ADMIN_AUTH_REQUIRED', {
      message: 'Admin token required. Include Authorization: Bearer <admin-token> header.',
      hint: 'auth',
      status: 401,
    })
  }

  const encoder = new TextEncoder()
  const provided = encoder.encode(token)
  const expected = encoder.encode(c.env.ADMIN_TOKEN)

  // Length check: different lengths always fail (timingSafeEqual requires equal lengths)
  if (provided.byteLength !== expected.byteLength) {
    throw new FeelrError('ADMIN_AUTH_INVALID', {
      message: 'Invalid admin token.',
      hint: 'auth',
      status: 403,
    })
  }

  const isValid = crypto.subtle.timingSafeEqual(provided, expected)

  if (!isValid) {
    throw new FeelrError('ADMIN_AUTH_INVALID', {
      message: 'Invalid admin token.',
      hint: 'auth',
      status: 403,
    })
  }

  await next()
})
