import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, hashToken } from '../auth/crypto'

/**
 * Unit tests for the crypto module.
 *
 * Tests AES-256-GCM encrypt/decrypt round-trips with HKDF key derivation,
 * IV uniqueness, purpose-based domain separation, and SHA-256 token hashing.
 *
 * Uses the Workers-native Web Crypto API via cloudflare:test runtime.
 */

const MASTER_SECRET = 'test-master-secret-at-least-32-chars-long!'

describe('Crypto Module', () => {
  describe('encrypt / decrypt', () => {
    it('round-trips a simple string', async () => {
      const plaintext = 'hello world'
      const encrypted = await encrypt(plaintext, MASTER_SECRET)
      const decrypted = await decrypt(encrypted, MASTER_SECRET)
      expect(decrypted).toBe(plaintext)
    })

    it('round-trips a JSON credential payload', async () => {
      const credential = JSON.stringify({
        accessToken: 'ghp_abc123def456',
        refreshToken: 'ghr_refresh789',
        expiresAt: 1700000000000,
      })
      const encrypted = await encrypt(credential, MASTER_SECRET)
      const decrypted = await decrypt(encrypted, MASTER_SECRET)
      expect(decrypted).toBe(credential)
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(credential))
    })

    it('produces different ciphertext for the same plaintext (random IV)', async () => {
      const plaintext = 'same input every time'
      const encrypted1 = await encrypt(plaintext, MASTER_SECRET)
      const encrypted2 = await encrypt(plaintext, MASTER_SECRET)
      expect(encrypted1).not.toBe(encrypted2)
    })

    it('fails to decrypt with wrong master secret', async () => {
      const plaintext = 'secret data'
      const encrypted = await encrypt(plaintext, MASTER_SECRET)
      await expect(
        decrypt(encrypted, 'wrong-master-secret-at-least-32-chars-long!')
      ).rejects.toThrow()
    })

    it('fails to decrypt with corrupted ciphertext', async () => {
      const plaintext = 'secret data'
      const encrypted = await encrypt(plaintext, MASTER_SECRET)
      // Corrupt the base64 data by flipping characters
      const corrupted = encrypted.slice(0, -4) + 'XXXX'
      await expect(decrypt(corrupted, MASTER_SECRET)).rejects.toThrow()
    })

    it('different purposes produce different ciphertext, each decrypts with own purpose', async () => {
      const plaintext = 'shared data'
      const encryptedA = await encrypt(plaintext, MASTER_SECRET, 'purpose-a')
      const encryptedB = await encrypt(plaintext, MASTER_SECRET, 'purpose-b')

      // Different purposes should produce different derived keys
      // (ciphertext is also different due to random IV, but the key derivation
      // ensures cross-purpose decryption fails)
      const decryptedA = await decrypt(encryptedA, MASTER_SECRET, 'purpose-a')
      const decryptedB = await decrypt(encryptedB, MASTER_SECRET, 'purpose-b')
      expect(decryptedA).toBe(plaintext)
      expect(decryptedB).toBe(plaintext)

      // Cross-purpose decryption must fail
      await expect(
        decrypt(encryptedA, MASTER_SECRET, 'purpose-b')
      ).rejects.toThrow()
      await expect(
        decrypt(encryptedB, MASTER_SECRET, 'purpose-a')
      ).rejects.toThrow()
    })

    it('handles empty string', async () => {
      const plaintext = ''
      const encrypted = await encrypt(plaintext, MASTER_SECRET)
      const decrypted = await decrypt(encrypted, MASTER_SECRET)
      expect(decrypted).toBe(plaintext)
    })
  })

  describe('hashToken', () => {
    it('produces consistent output for same input', async () => {
      const token = 'mySecretToken123'
      const hash1 = await hashToken(token)
      const hash2 = await hashToken(token)
      expect(hash1).toBe(hash2)
    })

    it('produces 64-char hex string (SHA-256)', async () => {
      const hash = await hashToken('test-token')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces different output for different inputs', async () => {
      const hash1 = await hashToken('token-alpha')
      const hash2 = await hashToken('token-beta')
      expect(hash1).not.toBe(hash2)
    })
  })
})
