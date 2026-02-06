/**
 * Feelr error codes using SCREAMING_SNAKE_CASE.
 * Each code maps to a specific failure category.
 */
export type ErrorCode =
  | 'CONNECTOR_NOT_FOUND'
  | 'ACTION_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'FORBIDDEN'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'CREDENTIAL_EXPIRED'     // Credential refresh failed, user needs to re-authenticate
  | 'ADMIN_AUTH_REQUIRED'     // Admin token not provided
  | 'ADMIN_AUTH_INVALID'      // Admin token invalid

/**
 * Actionable hints that tell agents what to do about an error.
 * - retry: Transient failure, try again
 * - auth: Re-authenticate and retry
 * - abort: Permanent failure, do not retry
 */
export type Hint = 'retry' | 'auth' | 'abort'

/**
 * Allowed HTTP status codes for Feelr responses.
 * Feelr normalizes all upstream codes to this set.
 */
export type FeelrHttpStatus = 400 | 401 | 403 | 404 | 429 | 500 | 502

/**
 * Options for constructing a FeelrError.
 */
export interface FeelrErrorOptions {
  /** Feelr-authored human-readable message */
  message: string
  /** Actionable hint for agents */
  hint: Hint
  /** HTTP status code from the normalized set */
  status: FeelrHttpStatus
  /** Upstream error message or additional context */
  detail?: string
}

/**
 * Custom error class for all Feelr errors.
 * Includes structured fields for consistent error envelope generation.
 */
export class FeelrError extends Error {
  public readonly code: ErrorCode
  private readonly _hint: Hint
  private readonly _status: FeelrHttpStatus
  private readonly _detail?: string

  constructor(code: ErrorCode, options: FeelrErrorOptions) {
    super(options.message)
    this.name = 'FeelrError'
    this.code = code
    this._hint = options.hint
    this._status = options.status
    this._detail = options.detail
  }

  /** Actionable hint for agents: retry, auth, or abort */
  get hint(): Hint {
    return this._hint
  }

  /** Normalized HTTP status code */
  get status(): FeelrHttpStatus {
    return this._status
  }

  /** Upstream error message or additional context */
  get detail(): string | undefined {
    return this._detail
  }
}
