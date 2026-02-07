/**
 * Auth-specific TypeScript types for API keys and credentials.
 *
 * These types define the storage schema for KV records and DO state.
 * Storage keys follow the naming convention:
 *   apikey:<shortToken>  -> ApiKeyRecord (JSON)
 *   cred:<connector>     -> CredentialRecord (encrypted JSON)
 */

/** Rate limit tier determining requests-per-minute allowance */
export type RateLimitTier = 'free' | 'pro' | 'enterprise'

/** Requests-per-minute limits for each tier */
export const TIER_LIMITS: Record<RateLimitTier, number> = {
  free: 30,
  pro: 300,
  enterprise: 3000,
}

/** Stored API key record (value in KV at apikey:<shortToken>) */
export interface ApiKeyRecord {
  shortToken: string
  longTokenHash: string       // SHA-256 hex hash of long token
  label?: string              // Optional user-provided label
  /** Rate limit tier determining requests-per-minute allowance */
  tier: RateLimitTier
  createdAt: string           // ISO 8601 timestamp
  lastUsedAt?: string         // ISO 8601, updated on successful validation
  // Future: scopes?: string[]  // Per-connector scoping (deferred)
  // Future: userId?: string    // Multi-user isolation (deferred)
}

/** Stored encrypted credential record (value in KV at cred:<connector>) */
export interface CredentialRecord {
  accessToken: string         // Encrypted
  refreshToken: string | null // Encrypted, null for non-refreshable (e.g., GitHub PAT)
  expiresAt: number | null    // Epoch ms, null for non-expiring tokens
}

/** Token state as tracked by the DO coordinator */
export interface TokenState {
  connector: string
  accessToken: string         // Encrypted
  refreshToken: string        // Encrypted
  expiresAt: number           // Epoch ms
  status: 'active' | 'refreshing' | 'failed'
  retryCount: number
  lastRefreshAt?: number
}

/** Parsed API key components */
export interface ParsedApiKey {
  prefix: string              // 'fk'
  env: string                 // 'live' | 'test'
  shortToken: string          // 8 chars
  longToken: string           // 32 chars
}
