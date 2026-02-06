import type { Env } from 'hono'
import type { ApiKeyRecord } from '../auth/types'

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
  }
  Variables: {
    requestId: string
    apiKey: string | null
    /** Populated after successful API key validation */
    apiKeyRecord?: ApiKeyRecord
  }
}
