import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { wrapError } from '../lib/envelope'

/**
 * Global error handler.
 * Catches all errors and returns a consistent error envelope.
 *
 * Error mapping:
 * - FeelrError: Uses the error's code, message, hint, status, and detail directly
 * - HTTPException: Maps to INTERNAL_ERROR with retry hint
 * - Unknown errors: Logs to console.error, returns INTERNAL_ERROR with 500 status
 */
export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const isStaging = c.env.ENVIRONMENT === 'staging'

  if (err instanceof FeelrError) {
    const body = wrapError({
      code: err.code,
      message: err.message,
      hint: err.hint,
      status: err.status,
      detail: err.detail,
    })
    return c.json(body, err.status)
  }

  if (err instanceof HTTPException) {
    const body = wrapError({
      code: 'INTERNAL_ERROR',
      message: isStaging ? err.message : 'An unexpected error occurred',
      hint: 'retry',
      status: 500,
      detail: isStaging ? `HTTPException: ${err.message}` : undefined,
    })
    return c.json(body, 500)
  }

  // Unknown error -- log and return generic 500
  console.error('Unhandled error:', err)
  const body = wrapError({
    code: 'INTERNAL_ERROR',
    message: isStaging && err instanceof Error ? err.message : 'An unexpected error occurred',
    hint: 'retry',
    status: 500,
    detail: isStaging && err instanceof Error ? err.stack : undefined,
  })
  return c.json(body, 500)
}
