import { SELF } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

/**
 * Integration tests for error response format and handling.
 * Tests: error envelope shape, error codes, hints, status codes.
 * Validates GATE-03 (error handling) success criteria.
 */

/** Valid hints per the Feelr spec */
const VALID_HINTS = ['retry', 'auth', 'abort']

/** Normalized HTTP status codes per the Feelr spec */
const VALID_STATUSES = [400, 401, 403, 404, 429, 500, 502]

describe('Error Handling', () => {
  it('error response has exactly { ok, error: { code, message, hint, status } } shape', async () => {
    const res = await SELF.fetch('http://localhost/v1/nonexistent/action')
    const body = await res.json() as any

    const topKeys = Object.keys(body).sort()
    expect(topKeys).toEqual(['error', 'ok'])
    expect(body.ok).toBe(false)

    const errorKeys = Object.keys(body.error).sort()
    expect(errorKeys).toContain('code')
    expect(errorKeys).toContain('message')
    expect(errorKeys).toContain('hint')
    expect(errorKeys).toContain('status')
  })

  it('CONNECTOR_NOT_FOUND: status 404, hint abort', async () => {
    const res = await SELF.fetch('http://localhost/v1/nonexistent/action')
    expect(res.status).toBe(404)

    const body = await res.json() as any
    expect(body.error.code).toBe('CONNECTOR_NOT_FOUND')
    expect(body.error.status).toBe(404)
    expect(body.error.hint).toBe('abort')
  })

  it('ACTION_NOT_FOUND: status 404, hint abort', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/nonexistent')
    expect(res.status).toBe(404)

    const body = await res.json() as any
    expect(body.error.code).toBe('ACTION_NOT_FOUND')
    expect(body.error.status).toBe(404)
    expect(body.error.hint).toBe('abort')
  })

  it('mock error.throw action returns correct error code and status', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/error.throw')
    const body = await res.json() as any

    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('UPSTREAM_ERROR')
    expect(body.error.status).toBe(502)
  })

  it('error hint is always one of: retry, auth, abort', async () => {
    // Test retry hint via error.throw (default)
    const retryRes = await SELF.fetch('http://localhost/v1/mock/error.throw')
    const retryBody = await retryRes.json() as any
    expect(VALID_HINTS).toContain(retryBody.error.hint)

    // Test abort hint via connector not found
    const abortRes = await SELF.fetch('http://localhost/v1/nonexistent/action')
    const abortBody = await abortRes.json() as any
    expect(VALID_HINTS).toContain(abortBody.error.hint)

    // Test abort hint via action not found
    const abortRes2 = await SELF.fetch('http://localhost/v1/mock/nonexistent')
    const abortBody2 = await abortRes2.json() as any
    expect(VALID_HINTS).toContain(abortBody2.error.hint)
  })

  it('error status is always from the normalized set', async () => {
    // Test 404 (connector not found)
    const res404 = await SELF.fetch('http://localhost/v1/nonexistent/action')
    const body404 = await res404.json() as any
    expect(VALID_STATUSES).toContain(body404.error.status)

    // Test 502 (error.throw default)
    const res502 = await SELF.fetch('http://localhost/v1/mock/error.throw')
    const body502 = await res502.json() as any
    expect(VALID_STATUSES).toContain(body502.error.status)
  })

  it('HTTP response status code matches error.status in the body', async () => {
    // 404 case
    const res404 = await SELF.fetch('http://localhost/v1/nonexistent/action')
    const body404 = await res404.json() as any
    expect(res404.status).toBe(body404.error.status)

    // 502 case
    const res502 = await SELF.fetch('http://localhost/v1/mock/error.throw')
    const body502 = await res502.json() as any
    expect(res502.status).toBe(body502.error.status)
  })

  it('error includes message field as non-empty string', async () => {
    const res = await SELF.fetch('http://localhost/v1/nonexistent/action')
    const body = await res.json() as any

    expect(typeof body.error.message).toBe('string')
    expect(body.error.message.length).toBeGreaterThan(0)
  })

  it('error with detail field includes upstream context', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/error.throw')
    const body = await res.json() as any

    // error.throw mock includes detail: 'Simulated upstream error'
    expect(body.error.detail).toBeDefined()
    expect(typeof body.error.detail).toBe('string')
    expect(body.error.detail.length).toBeGreaterThan(0)
  })

  it('404 for unknown path uses error envelope, not Hono default HTML', async () => {
    const res = await SELF.fetch('http://localhost/totally/unknown')
    expect(res.status).toBe(404)

    // Verify the content type is JSON, not HTML
    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain('application/json')

    const body = await res.json() as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.hint).toBe('abort')
  })
})
