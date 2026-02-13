/**
 * In-memory sliding window rate limiter for self-hosted mode.
 *
 * Replaces Cloudflare's managed Rate Limiting binding for self-hosted
 * deployments. Uses a sliding window algorithm with per-key timestamp
 * arrays to track request counts within a configurable time window.
 *
 * For self-hosted single-instance deployments, in-memory rate limiting
 * is actually MORE accurate than Cloudflare's per-location distributed
 * limits (no cross-datacenter eventual consistency delay).
 *
 * Includes periodic cleanup of expired entries to prevent unbounded
 * memory growth from abandoned keys.
 */

import type { RateLimiter } from '../interfaces'

export class InMemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, number[]>()
  private readonly maxRequests: number
  private readonly windowMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  /**
   * Create a new rate limiter.
   *
   * @param maxRequests - Maximum requests allowed within the window
   * @param windowSeconds - Sliding window duration in seconds
   */
  constructor(maxRequests: number, windowSeconds: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowSeconds * 1000

    // Periodic cleanup of expired entries to prevent memory leak.
    // Runs every 60 seconds, removes entries older than 2x the window
    // to account for clock skew and cleanup interval gaps.
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000)
  }

  /**
   * Check if a request should be allowed for the given key.
   *
   * Implements sliding window: counts timestamps within the current
   * window, rejects if at or above the limit, otherwise records
   * the request and allows it.
   *
   * @returns { success: true } if allowed, { success: false } if rate limited
   */
  async limit(options: { key: string }): Promise<{ success: boolean }> {
    const now = Date.now()
    const key = options.key
    const timestamps = this.windows.get(key) ?? []

    // Remove expired entries outside the current window
    const valid = timestamps.filter((t) => now - t < this.windowMs)

    if (valid.length >= this.maxRequests) {
      // Over limit -- update window with pruned timestamps but don't add new one
      this.windows.set(key, valid)
      return { success: false }
    }

    // Under limit -- record this request
    valid.push(now)
    this.windows.set(key, valid)
    return { success: true }
  }

  /**
   * Remove expired entries from all tracked keys.
   *
   * Uses 2x the window duration as cutoff to be conservative.
   * Completely removes keys with no remaining valid timestamps
   * to free memory from abandoned keys.
   */
  private cleanup(): void {
    const now = Date.now()
    const cutoff = this.windowMs * 2

    for (const [key, timestamps] of this.windows) {
      const valid = timestamps.filter((t) => now - t < cutoff)
      if (valid.length === 0) {
        this.windows.delete(key)
      } else {
        this.windows.set(key, valid)
      }
    }
  }
}
