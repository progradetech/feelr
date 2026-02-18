/**
 * issues.list -- List issues for a GitHub repository.
 *
 * CRITICAL: Filters out pull requests from GitHub's response
 * (items with a `pull_request` key), since GitHub's issues
 * endpoint returns both issues and PRs.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenIssue } from '../flatten'
import { requireCredential, parseRepo } from '../utils'

export const issuesList: ActionDefinition = {
  name: 'issues.list',
  description:
    'Lists issues for a repository (excludes PRs). Accepts "repo" (required, "owner/repo"), ' +
    'optional "state" (open/closed/all), "labels" (comma-separated), "sort" (created/updated/comments), ' +
    '"per_page" (max 100). Returns array of {id, number, state, title, user_login, labels}.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'state', type: 'string', required: false, description: 'Filter by state: open, closed, or all', default: 'open' },
    { name: 'labels', type: 'string', required: false, description: 'Comma-separated label names to filter by' },
    { name: 'sort', type: 'string', required: false, description: 'Sort by: created, updated, or comments', default: 'created' },
    { name: 'per_page', type: 'number', required: false, description: 'Results per page (max 100)', default: 30 },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const [owner, repo] = parseRepo(ctx.params.repo)

    const result = await githubFetch<Record<string, unknown>[]>({
      path: `/repos/${owner}/${repo}/issues`,
      params: {
        state: ctx.params.state as string,
        ...(ctx.params.labels ? { labels: ctx.params.labels as string } : {}),
        sort: ctx.params.sort as string,
        per_page: String(ctx.params.per_page ?? 30),
        ...(ctx.cursor ? { page: ctx.cursor } : {}),
      },
      credential,
      fetch: ctx.fetch,
    })

    // Filter out pull requests -- GitHub's issues endpoint returns both
    const issues = result.data.filter((item) => !item.pull_request)

    return {
      data: issues.map(flattenIssue),
      meta: {
        has_more: result.pagination.hasMore,
        ...(result.pagination.nextPage !== undefined && { cursor: String(result.pagination.nextPage) }),
      },
      raw: result.data,
    }
  },
}
