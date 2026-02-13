/**
 * pulls.list -- List pull requests for a repository.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenPullRequest } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const pullsList: ActionDefinition = {
  name: 'pulls.list',
  description:
    'Lists pull requests for a repository. Accepts "repo" (required, "owner/repo"), ' +
    'optional "state" (open/closed/all, default: open), "sort" (created/updated/popularity/long-running), ' +
    '"per_page" (max 100). Returns array of {id, number, state, title, user_login, head_ref, base_ref, merged, created_at}.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'state', type: 'string', required: false, description: 'Filter by state: open, closed, or all', default: 'open' },
    { name: 'sort', type: 'string', required: false, description: 'Sort by: created, updated, popularity, or long-running', default: 'created' },
    { name: 'per_page', type: 'number', required: false, description: 'Results per page (max 100)', default: 30 },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const [owner, repo] = parseRepo(ctx.params.repo)

    const result = await githubFetch<Record<string, unknown>[]>({
      path: `/repos/${owner}/${repo}/pulls`,
      params: {
        state: ctx.params.state as string,
        sort: ctx.params.sort as string,
        per_page: String(ctx.params.per_page ?? 30),
        ...(ctx.cursor ? { page: ctx.cursor } : {}),
      },
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: result.data.map(flattenPullRequest),
      meta: {
        has_more: result.pagination.hasMore,
        ...(result.pagination.nextPage !== undefined && { cursor: String(result.pagination.nextPage) }),
      },
      raw: result.data,
    }
  },
}
