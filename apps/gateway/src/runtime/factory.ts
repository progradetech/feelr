/**
 * Adapter factory for creating runtime bindings.
 *
 * Creates the correct adapter instances based on runtime mode (cloud vs self-hosted).
 * Cloud mode wraps raw Cloudflare bindings (KVNamespace, D1Database, etc.) in adapter
 * classes that implement the abstract interfaces from interfaces.ts.
 *
 * Self-hosted bindings are created in self-hosted-entry.ts rather than here, because
 * they require DO namespace bindings that are only available in the self-hosted Worker
 * environment. The factory focuses on cloud mode where raw bindings need wrapping.
 */

import type { AppEnv } from '../lib/types'
import { CloudflareKvAdapter } from './cloudflare/kv-adapter'
import { CloudflareDbAdapter } from './cloudflare/db-adapter'
import { CloudflareRateLimiterAdapter } from './cloudflare/rate-limiter-adapter'
import { CloudflareTokenCoordinatorAdapter } from './cloudflare/token-coordinator-adapter'

/**
 * Raw Cloudflare environment bindings before adapter wrapping.
 *
 * This represents the actual types that Cloudflare Workers runtime provides.
 * The factory wraps these in adapter classes to produce AppEnv['Bindings'].
 */
interface RawCloudflareEnv {
  ENVIRONMENT: string
  AUTH_KV: KVNamespace
  TOKEN_COORDINATOR: DurableObjectNamespace
  ENCRYPTION_KEY: string
  ADMIN_TOKEN: string
  SLACK_CLIENT_ID: string
  SLACK_CLIENT_SECRET: string
  USAGE_DB: D1Database
  RATE_LIMIT_FREE: { limit(options: { key: string }): Promise<{ success: boolean }> }
  RATE_LIMIT_PRO: { limit(options: { key: string }): Promise<{ success: boolean }> }
  RATE_LIMIT_ENTERPRISE: { limit(options: { key: string }): Promise<{ success: boolean }> }
  RATE_LIMIT_IP: { limit(options: { key: string }): Promise<{ success: boolean }> }
  FEELR_CONFIG?: import('./interfaces').FeelrConfig
}

/**
 * Detects the runtime mode from environment bindings.
 *
 * In self-hosted mode, the workerd config sets RUNTIME = "self-hosted".
 * In cloud mode (Cloudflare Workers), this binding is absent.
 */
export function detectRuntime(env: Record<string, unknown>): 'cloud' | 'self-hosted' {
  return (env as { RUNTIME?: string }).RUNTIME === 'self-hosted' ? 'self-hosted' : 'cloud'
}

/**
 * Wraps raw Cloudflare bindings in adapter classes for the gateway.
 *
 * Takes the native Cloudflare Workers environment (KVNamespace, D1Database,
 * DurableObjectNamespace, rate limit bindings) and wraps each in its
 * corresponding adapter class to produce objects satisfying AppEnv['Bindings'].
 *
 * @param rawEnv - Native Cloudflare Workers environment bindings
 * @returns Adapted bindings conforming to AppEnv['Bindings']
 */
export function createCloudBindings(rawEnv: RawCloudflareEnv): AppEnv['Bindings'] {
  return {
    ENVIRONMENT: rawEnv.ENVIRONMENT,
    AUTH_KV: new CloudflareKvAdapter(rawEnv.AUTH_KV),
    TOKEN_COORDINATOR: new CloudflareTokenCoordinatorAdapter(rawEnv.TOKEN_COORDINATOR),
    ENCRYPTION_KEY: rawEnv.ENCRYPTION_KEY,
    ADMIN_TOKEN: rawEnv.ADMIN_TOKEN,
    SLACK_CLIENT_ID: rawEnv.SLACK_CLIENT_ID,
    SLACK_CLIENT_SECRET: rawEnv.SLACK_CLIENT_SECRET,
    USAGE_DB: new CloudflareDbAdapter(rawEnv.USAGE_DB),
    RATE_LIMIT_FREE: new CloudflareRateLimiterAdapter(rawEnv.RATE_LIMIT_FREE),
    RATE_LIMIT_PRO: new CloudflareRateLimiterAdapter(rawEnv.RATE_LIMIT_PRO),
    RATE_LIMIT_ENTERPRISE: new CloudflareRateLimiterAdapter(rawEnv.RATE_LIMIT_ENTERPRISE),
    RATE_LIMIT_IP: new CloudflareRateLimiterAdapter(rawEnv.RATE_LIMIT_IP),
    FEELR_CONFIG: rawEnv.FEELR_CONFIG ?? { runtime: 'cloud', billing: { enabled: true }, encryption: { enabled: true } },
  }
}
