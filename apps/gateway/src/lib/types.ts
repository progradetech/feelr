import type { Env } from 'hono'

/**
 * Gateway-internal environment type for Hono context.
 * NOT exported to connector-sdk -- these are gateway-specific bindings.
 */
export interface AppEnv extends Env {
  Bindings: {
    ENVIRONMENT: string
  }
  Variables: {
    requestId: string
    apiKey: string | null
  }
}
