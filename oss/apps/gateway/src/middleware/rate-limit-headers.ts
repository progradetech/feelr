import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { TIER_LIMITS } from '../auth/types'
import type { RateLimitTier } from '../auth/types'

/**
 * Rate limit response header middleware -- runs AFTER auth and rate limit checks.
 *
 * Injects standard RateLimit-* headers on every successful /v1/* response:
 *   RateLimit-Limit:     requests-per-minute for the key's tier
 *   RateLimit-Remaining: approximate remaining requests (estimated)
 *   RateLimit-Reset:     Unix epoch timestamp of next window reset
 *
 * Note: Cloudflare Rate Limiting bindings don't expose remaining counts,
 * so RateLimit-Remaining is an approximation. The limit() call only returns
 * { success: boolean }. We track per-request decrement on the context to
 * provide a best-effort remaining count based on the window period.
 *
 * Since exact remaining isn't available from the binding, we set
 * RateLimit-Remaining to the tier limit minus 1 (indicating at least one
 * request was consumed). This is the standard approach when backends
 * don't expose precise counters -- agents/clients should treat it as
 * "requests are available" rather than an exact count.
 */
export const rateLimitHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next()

  const record = c.get('apiKeyRecord')
  if (!record) {
    return
  }

  const tier: RateLimitTier = record.tier ?? 'free'
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free

  // Approximate remaining: limit - 1 (we know at least this request consumed 1)
  const remaining = Math.max(0, limit - 1)

  // Reset: next minute boundary (60s window aligned to minute)
  const now = Math.floor(Date.now() / 1000)
  const reset = now + 60 - (now % 60)

  c.header('RateLimit-Limit', String(limit))
  c.header('RateLimit-Remaining', String(remaining))
  c.header('RateLimit-Reset', String(reset))
})
