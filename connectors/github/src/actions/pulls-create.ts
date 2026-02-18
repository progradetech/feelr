/**
 * pulls.create -- Create a new pull request.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenPullRequest } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const pullsCreate: ActionDefinition = {
  name: 'pulls.create',
  description:
    'Creates a new pull request. Accepts "repo" (required, "owner/repo"), "title" (required), ' +
    '"head" (required, source branch), "base" (required, target branch), optional "body" and ' +
    '"draft" (boolean). Returns the created PR with {id, number, state, title, head_ref, base_ref, created_at}.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'title', type: 'string', required: true, description: 'Pull request title' },
    { name: 'head', type: 'string', required: true, description: 'Source branch name' },
    { name: 'base', type: 'string', required: true, description: 'Target branch name' },
    { name: 'body', type: 'string', required: false, description: 'Pull request body (markdown supported)' },
    { name: 'draft', type: 'boolean', required: false, description: 'Create as draft pull request' },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const [owner, repo] = parseRepo(ctx.params.repo)

    if (!ctx.params.title) {
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'title is required',
        hint: 'abort',
        status: 400,
      })
    }
    if (!ctx.params.head) {
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'head (source branch) is required',
        hint: 'abort',
        status: 400,
      })
    }
    if (!ctx.params.base) {
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'base (target branch) is required',
        hint: 'abort',
        status: 400,
      })
    }

    const body: Record<string, unknown> = {
      title: ctx.params.title as string,
      head: ctx.params.head as string,
      base: ctx.params.base as string,
    }

    if (ctx.params.body !== undefined) {
      body.body = ctx.params.body as string
    }

    if (ctx.params.draft !== undefined) {
      body.draft = ctx.params.draft
    }

    const result = await githubFetch<Record<string, unknown>>({
      path: `/repos/${owner}/${repo}/pulls`,
      method: 'POST',
      body,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenPullRequest(result.data),
      raw: result.data,
    }
  },
}
