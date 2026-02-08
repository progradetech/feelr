/**
 * Cloudflare Rate Limiting adapter.
 *
 * Thin wrapper around the gateway's RateLimitBinding that implements the
 * RateLimiter interface. Delegates limit() directly to the underlying binding.
 */

import type { RateLimiter } from '../interfaces'
import type { RateLimitBinding } from '../../lib/types'

export class CloudflareRateLimiterAdapter implements RateLimiter {
  constructor(private readonly binding: RateLimitBinding) {}

  limit(options: { key: string }): Promise<{ success: boolean }> {
    return this.binding.limit(options)
  }
}
