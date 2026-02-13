/**
 * Shared Slack API fetch helper.
 *
 * Centralizes auth headers, error mapping, rate limit extraction,
 * and pagination cursor parsing.
 * All Slack action handlers call this instead of raw fetch.
 *
 * CRITICAL: Slack returns HTTP 200 on errors -- the `ok` field in
 * the JSON body determines success/failure. Only 429 (rate limited)
 * uses a real HTTP error status code.
 */
import { FeelrError } from '@feelr/connector-sdk'

const SLACK_API_BASE = 'https://slack.com/api/'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SlackFetchOptions {
  /** Slack Web API method name, e.g. "chat.postMessage" */
  method: string
  /** JSON body parameters for the API call */
  params?: Record<string, unknown>
  /** User's Slack bot token (xoxb-*) */
  credential: string
  /** Web Standard fetch function from ActionContext */
  fetch: typeof globalThis.fetch
}

export interface SlackFetchResult<T = unknown> {
  /** Parsed response data (the full JSON body with ok stripped) */
  data: T
  /** Raw upstream response for debugging */
  raw: unknown
  /** Pagination cursor for next page (if present) */
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Call a Slack Web API method with standard headers and error mapping.
 *
 * All Slack Web API calls use POST with a JSON body.
 * Throws FeelrError for all error responses (detected via json.ok field).
 */
export async function slackFetch<T = unknown>(
  options: SlackFetchOptions
): Promise<SlackFetchResult<T>> {
  const url = `${SLACK_API_BASE}${options.method}`

  const response = await options.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.credential}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(options.params ?? {}),
  })

  // 429 is the only HTTP error status Slack returns
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    throw new FeelrError('RATE_LIMITED', {
      message: 'Slack API rate limit exceeded',
      hint: 'retry',
      status: 429,
      detail: retryAfter
        ? `Retry after ${retryAfter} seconds.`
        : 'Slack returned 429 with no Retry-After header.',
    })
  }

  const json = (await response.json()) as Record<string, unknown>

  // CRITICAL: Slack returns HTTP 200 on errors -- check the `ok` field
  if (!json.ok) {
    mapSlackError(json)
  }

  // Extract pagination cursor from response_metadata.next_cursor
  const responseMeta = json.response_metadata as
    | Record<string, unknown>
    | undefined
  const nextCursor =
    responseMeta?.next_cursor && (responseMeta.next_cursor as string) !== ''
      ? (responseMeta.next_cursor as string)
      : undefined

  return { data: json as T, raw: json, nextCursor }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map Slack error strings (from json.error) to FeelrError.
 * Always throws -- return type is `never`.
 */
function mapSlackError(json: Record<string, unknown>): never {
  const error = json.error as string

  switch (error) {
    case 'not_authed':
    case 'invalid_auth':
    case 'account_inactive':
    case 'token_revoked':
      throw new FeelrError('AUTH_INVALID', {
        message: 'Slack authentication failed',
        hint: 'auth',
        status: 401,
        detail: error,
      })

    case 'token_expired':
      throw new FeelrError('CREDENTIAL_EXPIRED', {
        message:
          'Slack token expired. Re-authenticate with: feelr auth slack',
        hint: 'auth',
        status: 401,
        detail: error,
      })

    case 'channel_not_found':
    case 'user_not_found':
      throw new FeelrError('NOT_FOUND', {
        message: `Slack resource not found: ${error}`,
        hint: 'abort',
        status: 404,
        detail: error,
      })

    case 'ratelimited':
      throw new FeelrError('RATE_LIMITED', {
        message: 'Slack API rate limit exceeded',
        hint: 'retry',
        status: 429,
        detail: `Slack error: ${error}`,
      })

    case 'missing_scope': {
      const neededScope = json.needed as string | undefined
      throw new FeelrError('FORBIDDEN', {
        message: 'Slack bot token lacks required scope',
        hint: 'auth',
        status: 403,
        detail: neededScope
          ? `Missing scope: ${neededScope}. Re-install the Slack app with the required scope.`
          : 'Missing scope. Re-install the Slack app with the required scope.',
      })
    }

    default:
      throw new FeelrError('UPSTREAM_ERROR', {
        message: `Slack API error: ${error}`,
        hint: 'abort',
        status: 502,
        detail: error,
      })
  }
}
