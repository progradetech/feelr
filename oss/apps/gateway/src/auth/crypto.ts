/**
 * Cryptographic utilities for the Auth Vault.
 *
 * Uses the Workers-native Web Crypto API exclusively:
 * - HKDF for key derivation (single-pass, appropriate for high-entropy master secrets)
 * - AES-256-GCM for authenticated encryption
 * - SHA-256 for token hashing
 *
 * Zero external dependencies.
 */

/** Static salt for HKDF -- hardcoded, not secret. Provides domain separation. */
const HKDF_SALT = new TextEncoder().encode('feelr-credential-encryption-v1')

/**
 * Derive an AES-256-GCM key from a master secret using HKDF with SHA-256.
 *
 * HKDF is used instead of PBKDF2 because the master secret is a Worker Secret
 * (already high-entropy). PBKDF2's 100K+ iterations would be wasted cycles.
 * HKDF is a single-pass extraction.
 *
 * @param masterSecret - High-entropy master key (Worker Secret)
 * @param info - Purpose string for domain separation (e.g., 'credential', 'admin')
 * @returns Derived AES-256-GCM CryptoKey
 */
async function deriveKey(masterSecret: string, info: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterSecret),
    'HKDF',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: new TextEncoder().encode(info),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a plaintext string using AES-256-GCM with an HKDF-derived key.
 *
 * Output format: base64(IV [12 bytes] + ciphertext [includes 16-byte GCM auth tag])
 *
 * @param plaintext - The string to encrypt
 * @param masterSecret - High-entropy master key (Worker Secret)
 * @param purpose - Domain separation string (default: 'credential')
 * @returns Base64-encoded encrypted payload
 */
export async function encrypt(
  plaintext: string,
  masterSecret: string,
  purpose: string = 'credential'
): Promise<string> {
  const key = await deriveKey(masterSecret, purpose)
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for AES-GCM

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  )

  // Pack: IV (12 bytes) + ciphertext (includes 16-byte auth tag)
  const packed = new Uint8Array(iv.length + ciphertext.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ciphertext), iv.length)

  // Base64 encode for KV storage
  return btoa(String.fromCharCode(...packed))
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext using an HKDF-derived key.
 *
 * Expects the format produced by encrypt(): base64(IV [12 bytes] + ciphertext)
 *
 * @param encoded - Base64-encoded encrypted payload
 * @param masterSecret - High-entropy master key (Worker Secret)
 * @param purpose - Domain separation string (default: 'credential')
 * @returns Decrypted plaintext string
 * @throws If decryption fails (wrong key, tampered data, wrong purpose)
 */
export async function decrypt(
  encoded: string,
  masterSecret: string,
  purpose: string = 'credential'
): Promise<string> {
  const key = await deriveKey(masterSecret, purpose)

  // Decode base64 to bytes
  const packed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))

  // Unpack: first 12 bytes = IV, rest = ciphertext (with auth tag)
  const iv = packed.slice(0, 12)
  const ciphertext = packed.slice(12)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}

/**
 * Hash a token string using SHA-256.
 *
 * Used for API key long token storage -- only the hash is stored,
 * so a KV data breach does not expose usable keys.
 *
 * @param token - The token string to hash
 * @returns Lowercase hex-encoded SHA-256 hash
 */
export async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
