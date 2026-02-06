/**
 * Shared utility functions for Discord action handlers.
 *
 * Provides credential checking and required param validation
 * with consistent FeelrError throwing.
 */
import type { ActionContext } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'

/**
 * Require a credential in the ActionContext.
 * Throws AUTH_REQUIRED (401) if ctx.credential is missing.
 *
 * @returns The credential string (Discord bot token)
 */
export function requireCredential(ctx: ActionContext): string {
  if (!ctx.credential) {
    throw new FeelrError('AUTH_REQUIRED', {
      message: 'No Discord credential stored. Store a bot token via admin API first.',
      hint: 'auth',
      status: 401,
    })
  }
  return ctx.credential
}

/**
 * Require a parameter to be present and non-empty.
 * Throws VALIDATION_ERROR (400) if the parameter is missing.
 *
 * @returns The parameter value as a string
 */
export function requireParam(ctx: ActionContext, name: string): string {
  const value = ctx.params[name]
  if (value === undefined || value === null || value === '') {
    throw new FeelrError('VALIDATION_ERROR', {
      message: `Missing required parameter: ${name}`,
      hint: 'abort',
      status: 400,
    })
  }
  return String(value)
}
