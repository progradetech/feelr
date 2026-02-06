/**
 * Shared Discord API v10 fetch helper.
 *
 * Centralizes auth headers (Bot token prefix), User-Agent, error mapping,
 * rate limit extraction, and 204 No Content handling.
 * All Discord action handlers call this instead of raw fetch.
 */
import { FeelrError } from '@feelr/connector-sdk'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DiscordFetchOptions {
  /** Discord API path, e.g. "/guilds/{guild_id}/channels" */
  path: string
  /** HTTP method (default: "GET") */
  method?: string
  /** JSON request body for POST/PUT/DELETE */
  body?: Record<string, unknown>
  /** Query parameters (undefined/empty values are skipped) */
  params?: Record<string, string | undefined>
  /** Discord bot token */
  credential: string
  /** Web Standard fetch function from ActionContext */
  fetch: typeof globalThis.fetch
}

export interface DiscordRateLimit {
  /** Requests remaining in current window */
  remaining: number
  /** Max requests per window */
  limit: number
  /** Seconds until the rate limit resets */
  resetAfter: number
}

export interface DiscordFetchResult<T = unknown> {
  /** Parsed response data */
  data: T
  /** Rate limit info extracted from response headers */
  rateLimit: DiscordRateLimit
  /** Raw upstream response for ?raw=true debugging */
  raw: unknown
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Fetch from the Discord REST API v10 with standard headers, error mapping,
 * rate limit extraction, and 204 No Content handling.
 *
 * Auth uses "Bot" prefix (NOT "Bearer") per Discord bot token convention.
 * Throws FeelrError for all non-OK responses.
 */
export async function discordFetch<T = unknown>(
  options: DiscordFetchOptions
): Promise<DiscordFetchResult<T>> {
  const url = new URL(`${DISCORD_API_BASE}${options.path}`)
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value)
      }
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bot ${options.credential}`,
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
  const rateLimit: DiscordRateLimit = {
    remaining: Number(response.headers.get('x-ratelimit-remaining') ?? 0),
    limit: Number(response.headers.get('x-ratelimit-limit') ?? 0),
    resetAfter: Number(response.headers.get('x-ratelimit-reset-after') ?? 0),
  }

  // Error mapping -- throws on non-OK responses
  if (!response.ok) {
    await mapDiscordError(response, rateLimit)
  }

  // Handle 204 No Content (e.g. kick, ban, role assign return 204)
  if (response.status === 204) {
    return { data: {} as T, rateLimit, raw: null }
  }

  const data = (await response.json()) as T
  return { data, rateLimit, raw: data }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map Discord HTTP error responses to FeelrError.
 * Always throws -- return type is `never`.
 */
async function mapDiscordError(
  response: Response,
  _rateLimit: DiscordRateLimit
): Promise<never> {
  let errorBody: Record<string, unknown> = {}
  try {
    errorBody = (await response.json()) as Record<string, unknown>
  } catch {
    // Non-JSON error response -- proceed with empty body
  }

  const message =
    (errorBody.message as string) ?? `Discord API returned ${response.status}`

  switch (response.status) {
    case 400:
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'Discord validation failed',
        hint: 'abort',
        status: 400,
        detail: message,
      })

    case 401:
      throw new FeelrError('AUTH_INVALID', {
        message: 'Discord authentication failed',
        hint: 'auth',
        status: 401,
        detail: message,
      })

    case 403:
      throw new FeelrError('FORBIDDEN', {
        message: 'Discord access denied',
        hint: 'auth',
        status: 403,
        detail: `${message}. Bot may lack required permission.`,
      })

    case 404:
      throw new FeelrError('NOT_FOUND', {
        message: 'Discord resource not found',
        hint: 'abort',
        status: 404,
        detail: message,
      })

    case 429: {
      // Discord returns retry_after in JSON body AND Retry-After header
      const retryAfter =
        (errorBody.retry_after as number) ??
        Number(response.headers.get('retry-after') ?? 0)
      throw new FeelrError('RATE_LIMITED', {
        message: 'Discord API rate limit exceeded',
        hint: 'retry',
        status: 429,
        detail: `Retry after ${retryAfter} seconds.`,
      })
    }

    default:
      throw new FeelrError('UPSTREAM_ERROR', {
        message: `Discord API error: ${response.status}`,
        hint: response.status >= 500 ? 'retry' : 'abort',
        status: 502,
        detail: message,
      })
  }
}
