/**
 * Shared GitHub API fetch helper.
 *
 * Centralizes auth headers, API versioning, User-Agent, error mapping,
 * rate limit extraction, and Link header pagination parsing.
 * All GitHub action handlers call this instead of raw fetch.
 */
import { FeelrError } from '@feelr/connector-sdk'

const GITHUB_API_BASE = 'https://api.github.com'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GitHubFetchOptions {
  /** GitHub API path, e.g. "/repos/owner/repo/issues" */
  path: string
  /** HTTP method (default: "GET") */
  method?: string
  /** JSON request body for POST/PATCH/PUT */
  body?: Record<string, unknown>
  /** Query parameters (undefined/empty values are skipped) */
  params?: Record<string, string | undefined>
  /** User's GitHub PAT */
  credential: string
  /** Web Standard fetch function from ActionContext */
  fetch: typeof globalThis.fetch
}

export interface GitHubRateLimit {
  /** Requests remaining in current window */
  remaining: number
  /** Max requests per window */
  limit: number
  /** Requests consumed in current window */
  used: number
  /** Unix epoch seconds when the window resets */
  reset: number
}

export interface GitHubPagination {
  /** Page number for the next page (undefined if no next page) */
  nextPage?: number
  /** Whether more pages are available */
  hasMore: boolean
}

export interface GitHubFetchResult<T = unknown> {
  /** Parsed response data */
  data: T
  /** Rate limit info extracted from response headers */
  rateLimit: GitHubRateLimit
  /** Pagination info extracted from Link header */
  pagination: GitHubPagination
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Fetch from the GitHub REST API with standard headers, error mapping,
 * rate limit extraction, and Link header pagination parsing.
 *
 * Throws FeelrError for all non-OK responses.
 */
export async function githubFetch<T = unknown>(
  options: GitHubFetchOptions
): Promise<GitHubFetchResult<T>> {
  const url = new URL(`${GITHUB_API_BASE}${options.path}`)
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value)
      }
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.credential}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Feelr/1.0',
  }

  if (options.body) {
    headers['Content-Type'] = 'application/json'
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  }

  if (options.body) {
    init.body = JSON.stringify(options.body)
  }

  const response = await options.fetch(url.toString(), init)

  // Extract rate limit headers
  const rateLimit: GitHubRateLimit = {
    remaining: Number(response.headers.get('x-ratelimit-remaining') ?? 0),
    limit: Number(response.headers.get('x-ratelimit-limit') ?? 0),
    used: Number(response.headers.get('x-ratelimit-used') ?? 0),
    reset: Number(response.headers.get('x-ratelimit-reset') ?? 0),
  }

  // Parse Link header for pagination
  const pagination = parseLinkHeader(response.headers.get('link'))

  // Error mapping -- throws on non-OK responses
  if (!response.ok) {
    await mapGitHubError(response, rateLimit)
  }

  // Handle 204 No Content (e.g. merge response)
  if (response.status === 204) {
    return { data: {} as T, rateLimit, pagination }
  }

  const data = (await response.json()) as T
  return { data, rateLimit, pagination }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the Link header to extract pagination info.
 * GitHub returns links like: <url>; rel="next", <url>; rel="last"
 */
function parseLinkHeader(linkHeader: string | null): GitHubPagination {
  if (!linkHeader) return { hasMore: false }

  const links = linkHeader.split(', ')
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    if (match) {
      const url = new URL(match[1])
      const page = url.searchParams.get('page')
      return {
        hasMore: true,
        nextPage: page ? Number(page) : undefined,
      }
    }
  }

  return { hasMore: false }
}

/**
 * Map GitHub HTTP error responses to FeelrError.
 * Always throws -- return type is `never`.
 */
async function mapGitHubError(
  response: Response,
  rateLimit: GitHubRateLimit
): Promise<never> {
  let errorBody: Record<string, unknown> = {}
  try {
    errorBody = (await response.json()) as Record<string, unknown>
  } catch {
    // Non-JSON error response -- proceed with empty body
  }

  const message =
    (errorBody.message as string) ?? `GitHub API returned ${response.status}`
  const validationErrors = errorBody.errors
    ? JSON.stringify(errorBody.errors)
    : undefined

  switch (response.status) {
    case 401:
      throw new FeelrError('AUTH_INVALID', {
        message: 'GitHub authentication failed',
        hint: 'auth',
        status: 401,
        detail: message,
      })

    case 403: {
      // Check if rate limited (secondary rate limit uses 403, not 429)
      if (
        rateLimit.remaining === 0 ||
        message.includes('rate limit') ||
        message.includes('abuse detection')
      ) {
        const resetDate = new Date(rateLimit.reset * 1000).toISOString()
        throw new FeelrError('RATE_LIMITED', {
          message: 'GitHub API rate limit exceeded',
          hint: 'retry',
          status: 429,
          detail: `Resets at ${resetDate}. Limit: ${rateLimit.limit}, Used: ${rateLimit.used}.`,
        })
      }
      throw new FeelrError('FORBIDDEN', {
        message: 'GitHub access denied',
        hint: 'auth',
        status: 403,
        detail: `${message}. PAT may lack required scope (ensure 'repo' scope is enabled).`,
      })
    }

    case 404:
      throw new FeelrError('NOT_FOUND', {
        message: 'GitHub resource not found',
        hint: 'abort',
        status: 404,
        detail: `${message}. Note: GitHub returns 404 for both non-existent and permission-denied resources.`,
      })

    case 422:
      // Forward GitHub's field-level validation errors (locked decision)
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'GitHub validation failed',
        hint: 'abort',
        status: 400,
        detail: validationErrors ?? message,
      })

    case 429: {
      const retryAfter = response.headers.get('retry-after')
      throw new FeelrError('RATE_LIMITED', {
        message: 'GitHub API rate limit exceeded',
        hint: 'retry',
        status: 429,
        detail: retryAfter
          ? `Retry after ${retryAfter} seconds.`
          : `Resets at ${new Date(rateLimit.reset * 1000).toISOString()}.`,
      })
    }

    default:
      throw new FeelrError('UPSTREAM_ERROR', {
        message: `GitHub API error: ${response.status}`,
        hint: response.status >= 500 ? 'retry' : 'abort',
        status: 502,
        detail: message,
      })
  }
}
