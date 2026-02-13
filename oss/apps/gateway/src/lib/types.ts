import type { Env } from 'hono'
import type { ApiKeyRecord } from '../auth/types'
import type {
  KeyValueStore,
  UsageDatabase,
  RateLimiter,
  TokenCoordinatorClient,
} from '../runtime/interfaces'
import type { BillingProvider } from '../billing/provider'

/**
 * Gateway-internal environment type for Hono context.
 * NOT exported to connector-sdk -- these are gateway-specific bindings.
 *
 * Uses abstract runtime interfaces instead of Cloudflare-specific types
 * (KVNamespace, D1Database, DurableObjectNamespace, RateLimitBinding).
 * Cloud deployment uses Cloudflare adapters; self-hosted uses workerd adapters.
 */
export interface AppEnv extends Env {
  Bindings: {
    ENVIRONMENT: string
    /** Key-value store for API keys and encrypted credentials */
    AUTH_KV: KeyValueStore
    /** Token coordinator client for refresh coordination */
    TOKEN_COORDINATOR: TokenCoordinatorClient
    /** Worker Secret: master encryption key for credential encryption (hex string) */
    ENCRYPTION_KEY: string
    /** Worker Secret: admin token for credential management endpoints */
    ADMIN_TOKEN: string
    /** Worker Secret: Slack OAuth client ID (for OAuth config + token exchange) */
    SLACK_CLIENT_ID: string
    /** Worker Secret: Slack OAuth client secret (for token exchange + refresh) */
    SLACK_CLIENT_SECRET: string
    /** SQL database for usage analytics (dashboard data) */
    USAGE_DB: UsageDatabase
    /** Rate limiter: free tier (30 req/min) */
    RATE_LIMIT_FREE: RateLimiter
    /** Rate limiter: pro tier (300 req/min) */
    RATE_LIMIT_PRO: RateLimiter
    /** Rate limiter: enterprise tier (3000 req/min) */
    RATE_LIMIT_ENTERPRISE: RateLimiter
    /** Rate limiter: IP-based pre-auth (100 req/10s) */
    RATE_LIMIT_IP: RateLimiter
    /** Pluggable billing provider (undefined = NoopBillingProvider) */
    BILLING_PROVIDER?: BillingProvider
    /** Optional runtime configuration for cloud vs self-hosted feature toggles */
    FEELR_CONFIG?: import('../runtime/interfaces').FeelrConfig
  }
  Variables: {
    requestId: string
    apiKey: string | null
    /** Populated after successful API key validation */
    apiKeyRecord?: ApiKeyRecord
  }
}
