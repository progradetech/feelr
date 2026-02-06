/**
 * pulls.merge -- Merge a pull request.
 *
 * Returns the merge result (not a flattened PR) since
 * GitHub's merge endpoint returns a different shape.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { requireCredential, parseRepo } from '../utils'

export const pullsMerge: ActionDefinition = {
  name: 'pulls.merge',
  description:
    'Merges a pull request. Accepts "repo" (required, "owner/repo"), "pull_number" (required), ' +
    'optional "merge_method" (merge/squash/rebase, default: merge), "commit_title", "commit_message". ' +
    'Returns {merged, sha, message} on success.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'pull_number', type: 'number', required: true, description: 'Pull request number to merge' },
    { name: 'merge_method', type: 'string', required: false, description: 'Merge method: merge, squash, or rebase', default: 'merge' },
    { name: 'commit_title', type: 'string', required: false, description: 'Custom merge commit title' },
    { name: 'commit_message', type: 'string', required: false, description: 'Custom merge commit message' },
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

    const body: Record<string, unknown> = {
      merge_method: (ctx.params.merge_method as string) ?? 'merge',
    }

    if (ctx.params.commit_title !== undefined) {
      body.commit_title = ctx.params.commit_title as string
    }

    if (ctx.params.commit_message !== undefined) {
      body.commit_message = ctx.params.commit_message as string
    }

    const result = await githubFetch<Record<string, unknown>>({
      path: `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      method: 'PUT',
      body,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: {
        merged: result.data.merged ?? true,
        sha: result.data.sha,
        message: result.data.message,
      },
      raw: result.data,
    }
  },
}
