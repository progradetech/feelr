/**
 * pulls.get -- Get a single pull request by number.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenPullRequest } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const pullsGet: ActionDefinition = {
  name: 'pulls.get',
  description:
    'Gets a single pull request by number. Accepts "repo" (required, "owner/repo") and ' +
    '"pull_number" (required, integer). Returns a flattened PR with ' +
    '{id, number, state, title, body, user_login, head_ref, head_sha, base_ref, merged, mergeable, labels, created_at, updated_at, merged_at}.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'pull_number', type: 'number', required: true, description: 'Pull request number to retrieve' },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const [owner, repo] = parseRepo(ctx.params.repo)

    const pullNumber = ctx.params.pull_number
    if (!pullNumber) {
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'pull_number is required',
        hint: 'abort',
        status: 400,
      })
    }

    const result = await githubFetch<Record<string, unknown>>({
      path: `/repos/${owner}/${repo}/pulls/${pullNumber}`,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenPullRequest(result.data),
      raw: result.data,
    }
  },
}
