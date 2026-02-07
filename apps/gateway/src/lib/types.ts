import type { Env } from 'hono'
import type { ApiKeyRecord } from '../auth/types'

/** Cloudflare Rate Limiting binding (GA Sep 2025). Returns { success: boolean } */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/**
 * Gateway-internal environment type for Hono context.
 * NOT exported to connector-sdk -- these are gateway-specific bindings.
 */
export interface AppEnv extends Env {
  Bindings: {
    ENVIRONMENT: string
    /** KV namespace for API keys and encrypted credentials */
    AUTH_KV: KVNamespace
    /** Durable Object namespace for token refresh coordination */
    TOKEN_COORDINATOR: DurableObjectNamespace
    /** Worker Secret: master encryption key for credential encryption (hex string) */
    ENCRYPTION_KEY: string
    /** Worker Secret: admin token for credential management endpoints */
    ADMIN_TOKEN: string
    /** Worker Secret: Slack OAuth client ID (for OAuth config + token exchange) */
    SLACK_CLIENT_ID: string
    /** Worker Secret: Slack OAuth client secret (for token exchange + refresh) */
    SLACK_CLIENT_SECRET: string
    /** D1 database for usage analytics (dashboard data) */
    USAGE_DB: D1Database
    /** Rate limit binding: free tier (30 req/min) */
    RATE_LIMIT_FREE: RateLimitBinding
    /** Rate limit binding: pro tier (300 req/min) */
    RATE_LIMIT_PRO: RateLimitBinding
    /** Rate limit binding: enterprise tier (3000 req/min) */
    RATE_LIMIT_ENTERPRISE: RateLimitBinding
    /** Rate limit binding: IP-based pre-auth (100 req/10s) */
    RATE_LIMIT_IP: RateLimitBinding
  }
  Variables: {
    requestId: string
    apiKey: string | null
    /** Populated after successful API key validation */
    apiKeyRecord?: ApiKeyRecord
  }
}
