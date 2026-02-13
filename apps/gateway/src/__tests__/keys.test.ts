import { SELF, env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { generateApiKey, parseApiKey, validateApiKey } from '../auth/keys'

/**
 * Tests for API key generation, parsing, validation, CRUD routes, and middleware.
 *
 * Unit tests: key format, parsing, timing-safe validation.
 * Integration tests: admin key routes (create, list, revoke) and API key middleware.
 *
 * Uses SELF.fetch for integration tests (through the full Workers stack).
 * Uses env.ADMIN_TOKEN from vitest.config.ts bindings.
 */

/** Helper to construct admin auth headers */
function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.ADMIN_TOKEN}` }
}

/** API key format regex: fk_<live|test>_<8 base62>_<32 base62> */
const KEY_FORMAT = /^fk_(live|test)_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/

describe('API Key Module', () => {
  describe('generateApiKey', () => {
    it('produces correct format (fk_<env>_<short>_<long>)', async () => {
      const { fullKey } = await generateApiKey('development')
      expect(fullKey).toMatch(KEY_FORMAT)
    })

    it('uses "live" for production environment', async () => {
      const { fullKey } = await generateApiKey('production')
      expect(fullKey).toMatch(/^fk_live_/)
    })

    it('uses "test" for non-production environment', async () => {
      const { fullKey } = await generateApiKey('development')
      expect(fullKey).toMatch(/^fk_test_/)

      const { fullKey: stageKey } = await generateApiKey('staging')
      expect(stageKey).toMatch(/^fk_test_/)
    })

    it('stores label in record when provided', async () => {
      const { record } = await generateApiKey('development', 'my-cli-key')
      expect(record.label).toBe('my-cli-key')
    })

    it('record has correct structure', async () => {
      const { record } = await generateApiKey('development')
      expect(record.shortToken).toHaveLength(8)
      expect(record.longTokenHash).toHaveLength(64) // SHA-256 hex
      expect(record.createdAt).toBeDefined()
      expect(new Date(record.createdAt).getTime()).not.toBeNaN()
    })
  })

  describe('parseApiKey', () => {
    it('parses a valid key', async () => {
      const { fullKey } = await generateApiKey('development')
      const parsed = parseApiKey(fullKey)
      expect(parsed).not.toBeNull()
      expect(parsed!.prefix).toBe('fk')
      expect(parsed!.env).toBe('test')
      expect(parsed!.shortToken).toHaveLength(8)
      expect(parsed!.longToken).toHaveLength(32)
    })

    it('returns null for invalid format', () => {
      expect(parseApiKey('invalid-key')).toBeNull()
      expect(parseApiKey('fk_live_short')).toBeNull() // missing long token
      expect(parseApiKey('xx_live_12345678_' + 'a'.repeat(32))).toBeNull() // wrong prefix
      expect(parseApiKey('')).toBeNull()
    })
  })

  describe('validateApiKey', () => {
    it('succeeds with matching token', async () => {
      const { fullKey, record } = await generateApiKey('development')
      const parsed = parseApiKey(fullKey)!
      const isValid = await validateApiKey(parsed.longToken, record.longTokenHash)
      expect(isValid).toBe(true)
    })

    it('fails with wrong token', async () => {
      const { record } = await generateApiKey('development')
      const isValid = await validateApiKey('wrong-token-not-matching-hash!!!!!', record.longTokenHash)
      expect(isValid).toBe(false)
    })
  })
})

describe('API Key Admin Routes', () => {
  it('POST /admin/keys creates a new key (201, ok:true)', async () => {
    const res = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(201)

    const body = (await res.json()) as any
    expect(body.ok).toBe(true)
    expect(body.data.key).toMatch(KEY_FORMAT)
    expect(body.data.short_token).toHaveLength(8)
    expect(body.data.created_at).toBeDefined()
  })

  it('POST /admin/keys with label stores label', async () => {
    const res = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'cli-key' }),
    })
    expect(res.status).toBe(201)

    const body = (await res.json()) as any
    expect(body.data.label).toBe('cli-key')
  })

  it('GET /admin/keys lists created keys', async () => {
    // Create a key first
    const createRes = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'list-test-key' }),
    })
    const createBody = (await createRes.json()) as any
    const shortToken = createBody.data.short_token

    // List keys
    const listRes = await SELF.fetch('http://localhost/admin/keys', {
      headers: adminHeaders(),
    })
    expect(listRes.status).toBe(200)

    const listBody = (await listRes.json()) as any
    expect(listBody.ok).toBe(true)
    expect(Array.isArray(listBody.data)).toBe(true)

    // Find our created key in the list
    const found = listBody.data.find((k: any) => k.short_token === shortToken)
    expect(found).toBeDefined()
    expect(found.label).toBe('list-test-key')
  })

  it('DELETE /admin/keys/:id revokes a key', async () => {
    // Create a key
    const createRes = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const createBody = (await createRes.json()) as any
    const shortToken = createBody.data.short_token

    // Delete it
    const deleteRes = await SELF.fetch(`http://localhost/admin/keys/${shortToken}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    expect(deleteRes.status).toBe(200)

    const deleteBody = (await deleteRes.json()) as any
    expect(deleteBody.ok).toBe(true)
    expect(deleteBody.data.status).toBe('revoked')

    // Verify it's gone from the list
    const listRes = await SELF.fetch('http://localhost/admin/keys', {
      headers: adminHeaders(),
    })
    const listBody = (await listRes.json()) as any
    const found = listBody.data.find((k: any) => k.short_token === shortToken)
    expect(found).toBeUndefined()
  })

  it('POST /admin/keys without admin token returns 401', async () => {
    const res = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)

    const body = (await res.json()) as any
    expect(body.ok).toBe(false)
  })

  it('POST /admin/keys with wrong admin token returns 401', async () => {
    const res = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-token-value',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)

    const body = (await res.json()) as any
    expect(body.ok).toBe(false)
  })
})

describe('API Key Middleware', () => {
  it('request without API key returns 401', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo')
    expect(res.status).toBe(401)

    const body = (await res.json()) as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('AUTH_REQUIRED')
  })

  it('request with valid API key succeeds', async () => {
    // Create a key via admin route
    const createRes = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'middleware-test' }),
    })
    const createBody = (await createRes.json()) as any
    const fullKey = createBody.data.key

    // Use the key to make a v1 request
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: { 'X-Feelr-Key': fullKey },
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as any
    expect(body.ok).toBe(true)
    expect(body.data).toBeDefined()
  })

  it('request with invalid format API key returns 401', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: { 'X-Feelr-Key': 'not-a-valid-key-format' },
    })
    expect(res.status).toBe(401)

    const body = (await res.json()) as any
    expect(body.error.code).toBe('AUTH_INVALID')
  })

  it('request with revoked API key returns 401', async () => {
    // Create a key
    const createRes = await SELF.fetch('http://localhost/admin/keys', {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const createBody = (await createRes.json()) as any
    const fullKey = createBody.data.key
    const shortToken = createBody.data.short_token

    // Verify it works first
    const validRes = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: { 'X-Feelr-Key': fullKey },
    })
    expect(validRes.status).toBe(200)

    // Revoke it
    await SELF.fetch(`http://localhost/admin/keys/${shortToken}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })

    // Verify it no longer works
    const revokedRes = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: { 'X-Feelr-Key': fullKey },
    })
    expect(revokedRes.status).toBe(401)
  })
})
