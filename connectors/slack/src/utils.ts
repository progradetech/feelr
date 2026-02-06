/**
 * Shared utility functions for Slack action handlers.
 *
 * Provides credential checking and parameter validation
 * with consistent FeelrError throwing.
 */
import type { ActionContext } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'

/**
 * Require a credential in the ActionContext.
 * Throws AUTH_REQUIRED (401) if ctx.credential is missing.
 *
 * @returns The credential string (xoxb-* bot token)
 */
export function requireCredential(ctx: ActionContext): string {
  if (!ctx.credential) {
    throw new FeelrError('AUTH_REQUIRED', {
      message:
        'No Slack credential stored. Authenticate with: feelr auth slack',
      hint: 'auth',
      status: 401,
    })
  }
  return ctx.credential
}

/**
 * Extract and validate a required string parameter from context.
 * Throws VALIDATION_ERROR (400) if the parameter is missing or empty.
 *
 * @returns The parameter value as a string
 */
export function requireParam(ctx: ActionContext, name: string): string {
  const value = ctx.params[name]
  if (value === undefined || value === null || value === '') {
    throw new FeelrError('VALIDATION_ERROR', {
      message: `${name} is required`,
      hint: 'abort',
      status: 400,
    })
  }
  return String(value)
}
