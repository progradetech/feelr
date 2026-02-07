import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { recordRateLimitEvent } from './usage-recorder'

/**
 * IP-based rate limiter -- runs BEFORE API key auth.
 * Provides defense against brute-force auth attempts.
 * Uses Cloudflare native Rate Limiting binding (100 req/10s per IP).
 *
 * Position in middleware chain: FIRST on /v1/* (before apiKeyMiddleware).
 * This prevents unauthenticated abuse from exhausting KV lookups.
 */
export const ipRateLimiter = createMiddleware<AppEnv>(async (c, next) => {
  const ip =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for') ??
    'unknown'

  const result = await c.env.RATE_LIMIT_IP.limit({ key: ip })
  if (!result.success) {
    throw new FeelrError('RATE_LIMITED', {
      message: 'Too many requests from this IP. Please slow down.',
      hint: 'retry',
      status: 429,
    })
  }

  await next()
})

/**
 * Per-key tier-based rate limiter -- runs AFTER API key auth.
 * Uses the authenticated key's tier to select the appropriate binding:
 *   free:       30 req/min  (RATE_LIMIT_FREE)
 *   pro:       300 req/min  (RATE_LIMIT_PRO)
 *   enterprise: 3000 req/min (RATE_LIMIT_ENTERPRISE)
 *
 * On 429, throws RATE_LIMITED with Retry-After derived from a 60s window.
 * The Retry-After header is set on the context before throwing so the
 * error handler's c.json() response includes it.
 *
 * Backward-compatible: keys without a tier field default to 'free'.
 */
export const keyRateLimiter = createMiddleware<AppEnv>(async (c, next) => {
  const record = c.get('apiKeyRecord')
  if (!record) {
    // No authenticated record (shouldn't happen after apiKeyMiddleware, but safe fallback)
    await next()
    return
  }

  const tier = record.tier ?? 'free'
  const bindingMap: Record<string, typeof c.env.RATE_LIMIT_FREE> = {
    free: c.env.RATE_LIMIT_FREE,
    pro: c.env.RATE_LIMIT_PRO,
    enterprise: c.env.RATE_LIMIT_ENTERPRISE,
  }
  const binding = bindingMap[tier] ?? c.env.RATE_LIMIT_FREE

  const result = await binding.limit({ key: record.shortToken })
  if (!result.success) {
    const retryAfter = 60 // Conservative: full window period
    c.header('Retry-After', String(retryAfter))
    // Record throttle event for dashboard visibility (best-effort)
    const ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for') ??
      'unknown'
    c.executionCtx.waitUntil(
      recordRateLimitEvent(c.env.USAGE_DB, {
        api_key_short: record.shortToken,
        tier,
        ip,
        timestamp: new Date().toISOString(),
      })
    )
    throw new FeelrError('RATE_LIMITED', {
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      hint: 'retry',
      status: 429,
    })
  }

  await next()
})
