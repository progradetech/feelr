import { describe, it, expect, vi } from 'vitest'
import { githubFetch } from '../github-fetch'
import { FeelrError } from '@feelr/connector-sdk'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Default rate limit headers for mock responses */
const rateLimitHeaders = (
  remaining = 4999,
  limit = 5000,
  used = 1,
  reset = 1700000000
): Record<string, string> => ({
  'x-ratelimit-remaining': String(remaining),
  'x-ratelimit-limit': String(limit),
  'x-ratelimit-used': String(used),
  'x-ratelimit-reset': String(reset),
})

/** Create a mock Response with JSON body, status, and optional headers */
function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const allHeaders = { ...rateLimitHeaders(), ...headers }
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers(allHeaders),
  })
}

/** Create a mock fetch function that returns a single response */
function mockFetch(response: Response): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue(response) as unknown as typeof globalThis.fetch
}

/** Standard options for most tests */
function baseOptions(fetchFn: typeof globalThis.fetch) {
  return {
    path: '/repos/owner/repo/issues',
    credential: 'ghp_test123',
    fetch: fetchFn,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('githubFetch', () => {
  it('successful GET -- correct URL, headers, data, and rate limit', async () => {
    const data = [{ id: 1, title: 'Test issue' }]
    const fetchFn = mockFetch(mockResponse(data))

    const result = await githubFetch({
      ...baseOptions(fetchFn),
    })

    // Verify URL
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues',
      expect.objectContaining({ method: 'GET' })
    )

    // Verify headers
    const callArgs = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    const init = callArgs[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer ghp_test123')
    expect(headers['Accept']).toBe('application/vnd.github+json')
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    expect(headers['User-Agent']).toBe('Feelr/1.0')

    // Verify data
    expect(result.data).toEqual(data)

    // Verify rate limit extraction
    expect(result.rateLimit).toEqual({
      remaining: 4999,
      limit: 5000,
      used: 1,
      reset: 1700000000,
    })
  })

  it('pagination -- parses Link header with rel="next"', async () => {
    const fetchFn = mockFetch(
      mockResponse([], 200, {
        ...rateLimitHeaders(),
        'link': '<https://api.github.com/repos/owner/repo/issues?page=3>; rel="next", <https://api.github.com/repos/owner/repo/issues?page=10>; rel="last"',
      })
    )

    const result = await githubFetch({
      ...baseOptions(fetchFn),
    })

    expect(result.pagination).toEqual({
      hasMore: true,
      nextPage: 3,
    })
  })

  it('pagination -- no Link header means no more pages', async () => {
    const fetchFn = mockFetch(mockResponse([]))

    const result = await githubFetch({
      ...baseOptions(fetchFn),
    })

    expect(result.pagination).toEqual({ hasMore: false })
  })

  it('POST with body -- correct method, Content-Type, and JSON body', async () => {
    const responseData = { id: 42, title: 'New issue' }
    const fetchFn = mockFetch(mockResponse(responseData))

    await githubFetch({
      ...baseOptions(fetchFn),
      method: 'POST',
      body: { title: 'New issue', body: 'Description' },
    })

    const callArgs = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    const init = callArgs[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ title: 'New issue', body: 'Description' }))
  })

  it('204 No Content -- returns empty object', async () => {
    const fetchFn = mockFetch(
      new Response(null, {
        status: 204,
        headers: new Headers(rateLimitHeaders()),
      })
    )

    const result = await githubFetch({
      ...baseOptions(fetchFn),
    })

    expect(result.data).toEqual({})
  })

  it('error 401 -- AUTH_INVALID with hint: auth', async () => {
    const fetchFn = mockFetch(
      mockResponse({ message: 'Bad credentials' }, 401)
    )

    try {
      await githubFetch({ ...baseOptions(fetchFn) })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('AUTH_INVALID')
      expect(fe.hint).toBe('auth')
      expect(fe.status).toBe(401)
    }
  })

  it('error 403 with ratelimit-remaining: 0 -- RATE_LIMITED', async () => {
    const fetchFn = mockFetch(
      mockResponse(
        { message: 'API rate limit exceeded' },
        403,
        rateLimitHeaders(0, 5000, 5000, 1700003600)
      )
    )

    try {
      await githubFetch({ ...baseOptions(fetchFn) })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('RATE_LIMITED')
      expect(fe.hint).toBe('retry')
      expect(fe.status).toBe(429)
    }
  })

  it('error 403 with remaining > 0 -- FORBIDDEN', async () => {
    const fetchFn = mockFetch(
      mockResponse(
        { message: 'Resource not accessible by integration' },
        403,
        rateLimitHeaders(4999, 5000, 1, 1700000000)
      )
    )

    try {
      await githubFetch({ ...baseOptions(fetchFn) })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('FORBIDDEN')
      expect(fe.hint).toBe('auth')
      expect(fe.status).toBe(403)
    }
  })

  it('error 404 -- NOT_FOUND with hint: abort', async () => {
    const fetchFn = mockFetch(
      mockResponse({ message: 'Not Found' }, 404)
    )

    try {
      await githubFetch({ ...baseOptions(fetchFn) })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('NOT_FOUND')
      expect(fe.hint).toBe('abort')
      expect(fe.status).toBe(404)
    }
  })

  it('error 422 -- VALIDATION_ERROR with forwarded errors array', async () => {
    const fetchFn = mockFetch(
      mockResponse(
        {
          message: 'Validation Failed',
          errors: [{ resource: 'Issue', field: 'title', code: 'missing' }],
        },
        422
      )
    )

    try {
      await githubFetch({ ...baseOptions(fetchFn) })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('VALIDATION_ERROR')
      expect(fe.hint).toBe('abort')
      expect(fe.status).toBe(400)
      expect(fe.detail).toContain('missing')
    }
  })

  it('error 429 -- RATE_LIMITED with retry hint', async () => {
    const fetchFn = mockFetch(
      mockResponse(
        { message: 'You have exceeded a secondary rate limit' },
        429,
        {
          ...rateLimitHeaders(0),
          'retry-after': '60',
        }
      )
    )

    try {
      await githubFetch({ ...baseOptions(fetchFn) })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('RATE_LIMITED')
      expect(fe.hint).toBe('retry')
      expect(fe.status).toBe(429)
      expect(fe.detail).toContain('60')
    }
  })

  it('error 500 -- UPSTREAM_ERROR with hint: retry', async () => {
    const fetchFn = mockFetch(
      mockResponse({ message: 'Internal Server Error' }, 500)
    )

    try {
      await githubFetch({ ...baseOptions(fetchFn) })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeelrError)
      const fe = err as FeelrError
      expect(fe.code).toBe('UPSTREAM_ERROR')
      expect(fe.hint).toBe('retry')
      expect(fe.status).toBe(502)
    }
  })

  it('query params -- skips undefined and empty values', async () => {
    const fetchFn = mockFetch(mockResponse([]))

    await githubFetch({
      ...baseOptions(fetchFn),
      params: {
        state: 'open',
        labels: undefined,
        sort: '',
        per_page: '30',
      },
    })

    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('state=open')
    expect(url).toContain('per_page=30')
    expect(url).not.toContain('labels')
    expect(url).not.toContain('sort')
  })
})
