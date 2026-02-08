/**
 * Runtime abstraction interfaces for platform-independent gateway operation.
 *
 * These interfaces abstract Cloudflare-specific bindings (KVNamespace, D1Database,
 * RateLimitBinding, DurableObjectNamespace) behind portable TypeScript interfaces.
 * The gateway code imports these interfaces instead of Cloudflare-specific types,
 * enabling the same codebase to run on both Cloudflare Workers (cloud) and
 * workerd standalone (self-hosted).
 *
 * Each interface matches the exact subset of the Cloudflare API that the gateway
 * uses -- no more, no less. This keeps adapters thin and testable.
 */

// ---------------------------------------------------------------------------
// KeyValueStore -- abstracts KVNamespace
// ---------------------------------------------------------------------------

/**
 * Key-value storage interface.
 *
 * Used by: api-key.ts (get/put), credentials.ts (get/put/delete/list),
 * keys.ts (get/put/delete/list), internal.ts (list), admin.ts (list).
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>
  get<T>(key: string, type: 'json'): Promise<T | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>
}

// ---------------------------------------------------------------------------
// UsageDatabase -- abstracts D1Database
// ---------------------------------------------------------------------------

/**
 * Prepared statement returned by UsageDatabase.prepare().
 *
 * Mirrors D1PreparedStatement's interface for the methods the gateway uses.
 * Calling bind() returns a BoundStatement with the same execution methods.
 */
export interface PreparedStatement {
  bind(...values: unknown[]): BoundStatement
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<{ meta: { changes?: number } }>
}

/**
 * Bound statement with parameter values applied.
 *
 * Mirrors the D1 pattern where bind() returns an object with
 * all/first/run execution methods.
 */
export interface BoundStatement {
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<{ meta: { changes?: number } }>
}

/**
 * SQL database interface for usage analytics.
 *
 * Used by: usage-recorder.ts (prepare/bind/run), internal.ts (prepare/bind/all/first),
 * scheduled.ts (prepare/bind/run).
 */
export interface UsageDatabase {
  prepare(sql: string): PreparedStatement
}

// ---------------------------------------------------------------------------
// RateLimiter -- abstracts RateLimitBinding
// ---------------------------------------------------------------------------

/**
 * Rate limiting interface.
 *
 * Used by: rate-limiter.ts (limit with key). Returns { success: boolean }
 * where false means the request should be rejected (429).
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

// ---------------------------------------------------------------------------
// TokenCoordinatorClient -- abstracts DurableObjectNamespace access pattern
// ---------------------------------------------------------------------------

/**
 * Token coordinator stub interface.
 *
 * Mirrors the RPC methods exposed by the TokenCoordinator Durable Object.
 * Used by: admin.ts (storeCredential, removeCredential),
 * credentials.ts (storeCredential, removeCredential).
 */
export interface TokenCoordinatorStub {
  storeCredential(
    connector: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): Promise<void>
  removeCredential(connector: string): Promise<void>
  listCredentials(): Promise<Array<{ connector: string; status: string; expiresAt: number }>>
}

/**
 * Client interface for obtaining a token coordinator stub.
 *
 * Abstracts the DurableObjectNamespace pattern of:
 *   ns.idFromName('default') -> ns.get(id) -> stub
 * into a single getStub() call.
 */
export interface TokenCoordinatorClient {
  getStub(): TokenCoordinatorStub
}

// ---------------------------------------------------------------------------
// FeelrConfig -- runtime configuration
// ---------------------------------------------------------------------------

/**
 * Runtime configuration for feature toggles between cloud and self-hosted modes.
 */
export interface FeelrConfig {
  runtime: 'cloud' | 'self-hosted'
  billing: { enabled: boolean }
  encryption: { enabled: boolean }
}
