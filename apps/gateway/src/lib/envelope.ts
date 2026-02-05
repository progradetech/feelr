import type { FeelrResponse, FeelrErrorResponse, ResponseMeta } from '@feelr/connector-sdk'
import type { ErrorCode, Hint, FeelrHttpStatus } from './errors'

/**
 * Wraps successful action data in the standard Feelr response envelope.
 */
export function wrapResponse<T>(options: {
  data: T
  meta: ResponseMeta
}): FeelrResponse<T> {
  return {
    ok: true,
    data: options.data,
    meta: options.meta,
  }
}

/**
 * Wraps an error in the standard Feelr error response envelope.
 */
export function wrapError(options: {
  code: ErrorCode
  message: string
  hint: Hint
  status: FeelrHttpStatus
  detail?: string
}): FeelrErrorResponse {
  return {
    ok: false,
    error: {
      code: options.code,
      message: options.message,
      hint: options.hint,
      status: options.status,
      ...(options.detail !== undefined && { detail: options.detail }),
    },
  }
}
