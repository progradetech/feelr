/**
 * Cloudflare Rate Limiting adapter.
 *
 * Thin wrapper around the Cloudflare Rate Limiting binding that implements the
 * RateLimiter interface. Delegates limit() directly to the underlying binding.
 */

import type { RateLimiter } from '../interfaces'

/** Cloudflare Rate Limiting binding type (GA Sep 2025). */
interface CloudflareRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export class CloudflareRateLimiterAdapter implements RateLimiter {
  constructor(private readonly binding: CloudflareRateLimitBinding) {}

  limit(options: { key: string }): Promise<{ success: boolean }> {
    return this.binding.limit(options)
  }
}
