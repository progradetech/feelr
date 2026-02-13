/**
 * Shared utility functions for GitHub action handlers.
 *
 * Provides credential checking and repo param parsing
 * with consistent FeelrError throwing.
 */
import type { ActionContext } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'

/**
 * Require a credential in the ActionContext.
 * Throws AUTH_REQUIRED (401) if ctx.credential is missing.
 *
 * @returns The credential string
 */
export function requireCredential(ctx: ActionContext): string {
  if (!ctx.credential) {
    throw new FeelrError('AUTH_REQUIRED', {
      message: 'No GitHub credential stored. Store a PAT via admin API first.',
      hint: 'auth',
      status: 401,
    })
  }
  return ctx.credential
}

/**
 * Parse a "owner/repo" string into its two components.
 * Throws VALIDATION_ERROR (400) if the format is invalid.
 *
 * @returns Tuple of [owner, repoName]
 */
export function parseRepo(repo: unknown): [string, string] {
  const str = String(repo ?? '')
  const parts = str.split('/')
  const owner = parts[0]
  const name = parts[1]
  if (!owner || !name || parts.length !== 2) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'repo must be in "owner/repo" format',
      hint: 'abort',
      status: 400,
    })
  }
  return [owner, name]
}
