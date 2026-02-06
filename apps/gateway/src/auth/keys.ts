/**
 * API key generation, parsing, and validation.
 *
 * Key format: fk_<env>_<shortToken>_<longToken>
 *   - fk = "Feelr Key" prefix (enables GitHub secret scanning detection)
 *   - env = "live" | "test" (mapped from ENVIRONMENT binding)
 *   - shortToken = 8 chars base62 (identification in dashboards/logs)
 *   - longToken = 32 chars base62 (the secret, SHA-256 hashed for storage)
 *
 * Only the SHA-256 hash of the long token is stored in KV.
 * The full key is returned exactly once at creation time.
 *
 * Zero external dependencies -- uses Workers-native Web Crypto API.
 */

import type { ApiKeyRecord, ParsedApiKey } from './types'
import { hashToken } from './crypto'

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Generate a cryptographically random base62 string.
 *
 * Each byte maps to one character via modulo 62.
 * Slight bias (256 % 62 = 8) is acceptable for API key generation
 * since the token length provides sufficient entropy.
 *
 * @param length - Number of base62 characters to generate
 * @returns Random base62 string of the specified length
 */
function generateRandomBase62(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => BASE62[b % 62])
    .join('')
}

/**
 * Generate a new Feelr API key and its storage record.
 *
 * The returned fullKey is shown to the user exactly once.
 * The record contains only the SHA-256 hash of the long token,
 * safe for persistent storage in KV.
 *
 * @param environment - ENVIRONMENT binding value (e.g., "production", "development")
 * @param label - Optional user-provided label for key identification
 * @returns Object with fullKey (show once) and record (store in KV)
 */
export async function generateApiKey(
  environment: string,
  label?: string
): Promise<{ fullKey: string; record: ApiKeyRecord }> {
  const env = environment === 'production' ? 'live' : 'test'
  const shortToken = generateRandomBase62(8)
  const longToken = generateRandomBase62(32)
  const longTokenHash = await hashToken(longToken)

  const fullKey = `fk_${env}_${shortToken}_${longToken}`

  const record: ApiKeyRecord = {
    shortToken,
    longTokenHash,
    label,
    createdAt: new Date().toISOString(),
  }

  return { fullKey, record }
}

/**
 * Parse an API key string into its components.
 *
 * @param key - Full API key string (e.g., "fk_live_BRTRKs8L_...")
 * @returns Parsed components or null if the format is invalid
 */
export function parseApiKey(key: string): ParsedApiKey | null {
  const parts = key.split('_')
  if (parts.length !== 4 || parts[0] !== 'fk') return null
  const [prefix, env, shortToken, longToken] = parts
  if (!shortToken || !longToken) return null
  return { prefix, env, shortToken, longToken }
}

/**
 * Validate a long token against a stored SHA-256 hash using timing-safe comparison.
 *
 * Hashes the provided long token and compares it against the stored hash
 * using crypto.subtle.timingSafeEqual to prevent timing attacks.
 *
 * @param longToken - The long token extracted from the API key
 * @param storedHash - The SHA-256 hex hash stored in KV
 * @returns true if the token matches the stored hash
 */
export async function validateApiKey(
  longToken: string,
  storedHash: string
): Promise<boolean> {
  const providedHash = await hashToken(longToken)
  const a = new TextEncoder().encode(providedHash)
  const b = new TextEncoder().encode(storedHash)
  if (a.byteLength !== b.byteLength) return false
  return crypto.subtle.timingSafeEqual(a, b)
}
