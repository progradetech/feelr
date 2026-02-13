import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'

/**
 * Integration tests for the response envelope format.
 * Tests: envelope shape, meta contents, pagination, raw mode, snake_case.
 * Validates GATE-02 (response envelope) and GATE-04 (normalization) success criteria.
 *
 * Updated for Phase 2: V1 routes now require a valid KV-backed API key.
 */

/** UUID v4 regex: 8-4-4-4-12 hex pattern */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Recursively checks all keys in an object are snake_case (lowercase + underscores) */
function allKeysSnakeCase(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return true
  if (Array.isArray(obj)) return obj.every(allKeysSnakeCase)
  return Object.keys(obj).every(
    (key) => /^[a-z][a-z0-9_]*$/.test(key) && allKeysSnakeCase((obj as any)[key]),
  )
}

/** Store a valid API key for authenticated v1 requests */
let validApiKey: string

/** Helper to get admin auth headers */
function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.ADMIN_TOKEN}` }
}

/** Helper to make authenticated v1 requests */
function apiKeyHeaders(): Record<string, string> {
  return { 'X-Feelr-Key': validApiKey }
}

beforeAll(async () => {
  const res = await SELF.fetch('http://localhost/admin/keys', {
    method: 'POST',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label: 'envelope-test-key' }),
  })
  const body = (await res.json()) as any
  validApiKey = body.data.key
})

describe('Response Envelope Format', () => {
  it('successful response has exactly { ok, data, meta } shape', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    const topKeys = Object.keys(body).sort()
    expect(topKeys).toEqual(['data', 'meta', 'ok'])
    expect(body.ok).toBe(true)
  })

  it('meta contains request_id in UUID format', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    expect(body.meta.request_id).toBeDefined()
    expect(body.meta.request_id).toMatch(UUID_REGEX)
  })

  it('meta contains connector name matching the URL', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    expect(body.meta.connector).toBe('mock')
  })

  it('meta contains action name matching the URL', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    expect(body.meta.action).toBe('echo')
  })

  it('meta contains duration_ms as a non-negative number', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    expect(typeof body.meta.duration_ms).toBe('number')
    expect(body.meta.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('list action response has data as array', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/items.list', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('single action response has data as object (not array)', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    expect(body.ok).toBe(true)
    expect(typeof body.data).toBe('object')
    expect(Array.isArray(body.data)).toBe(false)
  })

  it('list action with pagination has meta.cursor and meta.has_more', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/items.list', {
      headers: apiKeyHeaders(),
    })
    const body = await res.json() as any

    expect(body.meta.cursor).toBeDefined()
    expect(typeof body.meta.cursor).toBe('string')
    expect(body.meta.has_more).toBeDefined()
    expect(typeof body.meta.has_more).toBe('boolean')
  })

  it('?raw=true returns raw data without envelope', async () => {
    const res = await SELF.fetch(
      `http://localhost/v1/mock/echo?raw=true&key=${encodeURIComponent(validApiKey)}`
    )
    const body = await res.json() as any

    // Raw response should not have the envelope wrapper
    expect(body.ok).toBeUndefined()
    expect(body.meta).toBeUndefined()
    // Should have the raw mock data
    expect(body.original_params).toBeDefined()
  })

  it('all field names in response data are snake_case', async () => {
    // Test echo action
    const echoRes = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    const echoBody = await echoRes.json() as any
    expect(allKeysSnakeCase(echoBody.data)).toBe(true)

    // Test list action
    const listRes = await SELF.fetch('http://localhost/v1/mock/items.list', {
      headers: apiKeyHeaders(),
    })
    const listBody = await listRes.json() as any
    expect(allKeysSnakeCase(listBody.data)).toBe(true)
  })
})
