import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'

/**
 * Integration tests for V1 route dispatch.
 * Tests: connector lookup, action execution, param extraction, API key handling.
 * Validates GATE-01 (route dispatch) success criteria.
 *
 * Updated for Phase 2: V1 routes now require a valid KV-backed API key.
 * A real key is created via the admin route before tests run.
 */

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
  // Create a valid API key for use in tests
  const res = await SELF.fetch('http://localhost/admin/keys', {
    method: 'POST',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label: 'routes-test-key' }),
  })
  const body = (await res.json()) as any
  validApiKey = body.data.key
})

describe('V1 Route Dispatch', () => {
  it('mock echo action returns 200 with correct data shape', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: apiKeyHeaders(),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data.message).toBe('hello')
    expect(body.data.timestamp).toBeDefined()
  })

  it('mock items.list returns 200 with data as array', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/items.list', {
      headers: apiKeyHeaders(),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
  })

  it('unknown connector returns 404 with CONNECTOR_NOT_FOUND code', async () => {
    const res = await SELF.fetch('http://localhost/v1/nonexistent/echo', {
      headers: apiKeyHeaders(),
    })
    expect(res.status).toBe(404)

    const body = await res.json() as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONNECTOR_NOT_FOUND')
  })

  it('unknown action on known connector returns 404 with ACTION_NOT_FOUND code', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/nonexistent', {
      headers: apiKeyHeaders(),
    })
    expect(res.status).toBe(404)

    const body = await res.json() as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('ACTION_NOT_FOUND')
  })

  it('health check returns 200 with { ok: true }', async () => {
    const res = await SELF.fetch('http://localhost/health')
    expect(res.status).toBe(200)

    const body = await res.json() as any
    expect(body.ok).toBe(true)
  })

  it('unknown path returns 404 with NOT_FOUND error envelope', async () => {
    const res = await SELF.fetch('http://localhost/some/random/path')
    expect(res.status).toBe(404)

    const body = await res.json() as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toBeDefined()
  })

  it('POST to mock echo with JSON body works', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      method: 'POST',
      headers: {
        ...apiKeyHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'test_body' }),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(body.data.message).toBe('test_body')
  })

  it('API key accepted from X-Feelr-Key header', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: { 'X-Feelr-Key': validApiKey },
    })
    expect(res.status).toBe(200)

    const body = await res.json() as any
    expect(body.ok).toBe(true)
  })

  it('API key accepted from ?key= query param', async () => {
    const res = await SELF.fetch(
      `http://localhost/v1/mock/echo?key=${encodeURIComponent(validApiKey)}`
    )
    expect(res.status).toBe(200)

    const body = await res.json() as any
    expect(body.ok).toBe(true)
  })

  it('OpenAPI doc endpoint returns valid JSON with openapi field', async () => {
    const res = await SELF.fetch('http://localhost/openapi.json')
    expect(res.status).toBe(200)

    const body = await res.json() as any
    expect(body.openapi).toBeDefined()
    expect(typeof body.openapi).toBe('string')
  })
})
