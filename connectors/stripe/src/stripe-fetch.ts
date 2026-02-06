/**
 * Shared Stripe API fetch helper.
 *
 * Centralizes auth headers, error mapping, form-encoded body encoding,
 * and list pagination extraction.
 * All Stripe action handlers call this instead of raw fetch.
 *
 * CRITICAL: Stripe uses form-encoded bodies for POST requests (NOT JSON).
 * Auth is Bearer token with API key (sk_live_* or sk_test_*).
 * Stripe returns standard HTTP error status codes (unlike Slack).
 */
import { FeelrError } from '@feelr/connector-sdk'

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StripeFetchOptions {
  /** Stripe API path, e.g. "/payment_intents" (relative to /v1) */
  path: string
  /** HTTP method (default: "GET") */
  method?: string
  /** Query parameters for GET requests (undefined values are skipped) */
  params?: Record<string, string | undefined>
  /** Form-encoded body parameters for POST requests (undefined values are skipped) */
  body?: Record<string, string | undefined>
  /** User's Stripe API key (sk_live_* or sk_test_*) */
  credential: string
  /** Web Standard fetch function from ActionContext */
  fetch: typeof globalThis.fetch
}

export interface StripeFetchResult<T = unknown> {
  /** Parsed response data */
  data: T
  /** Raw upstream response for debugging */
  raw: unknown
  /** Whether more items are available (list endpoints only) */
  hasMore?: boolean
  /** ID of the last item in the list (for cursor pagination) */
  lastId?: string
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Fetch from the Stripe REST API with standard headers, form-encoded body
 * encoding, error mapping, and list pagination extraction.
 *
 * Throws FeelrError for all non-OK responses.
 */
export async function stripeFetch<T = unknown>(
  options: StripeFetchOptions
): Promise<StripeFetchResult<T>> {
  const url = new URL(`${STRIPE_API_BASE}${options.path}`)

  // Add query parameters for GET requests
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value)
      }
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.credential}`,
    'User-Agent': 'Feelr/1.0',
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  }

  // CRITICAL: Stripe uses form-encoded bodies for POST (NOT JSON)
  if (options.body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const formParams = new URLSearchParams()
    for (const [key, value] of Object.entries(options.body)) {
      if (value !== undefined) {
        formParams.set(key, String(value))
      }
    }
    init.body = formParams.toString()
  }

  const response = await options.fetch(url.toString(), init)

  // Error mapping -- throws on non-OK responses
  if (!response.ok) {
    await mapStripeError(response)
  }

  const json = (await response.json()) as Record<string, unknown>

  // Extract pagination info from list responses
  // Stripe list endpoints return { data: T[], has_more: boolean, url: string }
  const hasMore = json.has_more as boolean | undefined
  const dataArray = json.data as Array<Record<string, unknown>> | undefined
  const lastId =
    hasMore && dataArray && dataArray.length > 0
      ? (dataArray[dataArray.length - 1].id as string)
      : undefined

  // For list responses, return the data array; for single resources, return the full object
  const data = (dataArray !== undefined ? json : json) as T

  return { data, raw: json, hasMore, lastId }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map Stripe HTTP error responses to FeelrError.
 * Always throws -- return type is `never`.
 *
 * Stripe error responses have the shape:
 * { error: { type, message, code, param } }
 */
async function mapStripeError(response: Response): Promise<never> {
  let errorBody: Record<string, unknown> = {}
  try {
    const json = (await response.json()) as Record<string, unknown>
    errorBody = (json.error as Record<string, unknown>) ?? {}
  } catch {
    // Non-JSON error response -- proceed with empty body
  }

  const message =
    (errorBody.message as string) ?? `Stripe API returned ${response.status}`

  switch (response.status) {
    case 401:
      throw new FeelrError('AUTH_INVALID', {
        message: 'Stripe authentication failed',
        hint: 'auth',
        status: 401,
        detail: message,
      })

    case 402:
      throw new FeelrError('UPSTREAM_ERROR', {
        message: 'Stripe payment required',
        hint: 'abort',
        status: 502,
        detail: 'Payment required',
      })

    case 404:
      throw new FeelrError('NOT_FOUND', {
        message: 'Stripe resource not found',
        hint: 'abort',
        status: 404,
        detail: message,
      })

    case 429: {
      const rateLimitReason = response.headers.get(
        'Stripe-Rate-Limited-Reason'
      )
      throw new FeelrError('RATE_LIMITED', {
        message: 'Stripe API rate limit exceeded',
        hint: 'retry',
        status: 429,
        detail: rateLimitReason
          ? `Rate limited: ${rateLimitReason}`
          : 'Stripe returned 429 with no rate limit reason.',
      })
    }

    case 400:
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'Stripe validation failed',
        hint: 'abort',
        status: 400,
        detail: message,
      })

    default:
      throw new FeelrError('UPSTREAM_ERROR', {
        message: `Stripe API error: ${response.status}`,
        hint: response.status >= 500 ? 'retry' : 'abort',
        status: 502,
        detail: message,
      })
  }
}
