/**
 * Type augmentation for cloudflare:test module.
 *
 * Declares the ProvidedEnv interface so that `env` imported from
 * `cloudflare:test` has the correct bindings for ADMIN_TOKEN,
 * ENCRYPTION_KEY, AUTH_KV, TOKEN_COORDINATOR, and ENVIRONMENT.
 *
 * These bindings are provided at runtime by vitest.config.ts miniflare config
 * and the wrangler.toml bindings.
 */
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    ADMIN_TOKEN: string
    ENCRYPTION_KEY: string
    ENVIRONMENT: string
    AUTH_KV: KVNamespace
    TOKEN_COORDINATOR: DurableObjectNamespace
  }
}
