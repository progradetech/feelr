import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'

/**
 * Integration tests for the GitHub connector in the gateway.
 * Tests: connector routing, unknown action handling, status endpoint behavior.
 *
 * These tests run against the real gateway app with Cloudflare bindings.
 * No GitHub credentials are stored, so action calls will get AUTH_REQUIRED --
 * this validates routing and error handling without needing a real GitHub API.
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
    body: JSON.stringify({ label: 'github-integration-test-key' }),
  })
  const body = (await res.json()) as any
  validApiKey = body.data.key
})

describe('GitHub Connector Routing', () => {
  it('routes GET /v1/github/issues.list to GitHub connector (AUTH_REQUIRED without credential)', async () => {
    const res = await SELF.fetch(
      'http://localhost/v1/github/issues.list?repo=owner/repo',
      { headers: apiKeyHeaders() }
    )

    // Without a stored GitHub credential, the action handler throws AUTH_REQUIRED
    expect(res.status).toBe(401)

    const body = (await res.json()) as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('AUTH_REQUIRED')
    expect(body.error.hint).toBe('auth')
  })

  it('routes GET /v1/github/repos.list to GitHub connector (AUTH_REQUIRED)', async () => {
    const res = await SELF.fetch(
      'http://localhost/v1/github/repos.list',
      { headers: apiKeyHeaders() }
    )

    expect(res.status).toBe(401)

    const body = (await res.json()) as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('AUTH_REQUIRED')
  })

  it('returns ACTION_NOT_FOUND for unknown action on GitHub connector', async () => {
    const res = await SELF.fetch(
      'http://localhost/v1/github/nonexistent.action',
      { headers: apiKeyHeaders() }
    )

    expect(res.status).toBe(404)

    const body = (await res.json()) as any
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('ACTION_NOT_FOUND')
    expect(body.error.message).toContain('nonexistent.action')
    expect(body.error.message).toContain('github')
  })
})

describe('Status Endpoint', () => {
  it('returns empty connectors when no credentials are stored', async () => {
    const res = await SELF.fetch('http://localhost/status', {
      headers: apiKeyHeaders(),
    })

    expect(res.status).toBe(200)

    const body = (await res.json()) as any
    expect(body.ok).toBe(true)
    expect(body.data.gateway.status).toBe('healthy')
    expect(body.data.gateway.version).toBe('1.0.0')
    // No credentials stored, so connectors should be empty
    expect(Object.keys(body.data.connectors)).toHaveLength(0)
  })

  it('returns 401 when no API key is provided', async () => {
    const res = await SELF.fetch('http://localhost/status')

    expect(res.status).toBe(401)

    const body = (await res.json()) as any
    expect(body.ok).toBe(false)
  })
})
