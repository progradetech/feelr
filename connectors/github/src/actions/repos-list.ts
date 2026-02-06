/**
 * repos.list -- List repositories for the authenticated user.
 *
 * No "repo" param -- lists the authenticated user's repositories.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenRepository } from '../flatten'
import { requireCredential } from '../utils'

export const reposList: ActionDefinition = {
  name: 'repos.list',
  description:
    'Lists repositories for the authenticated user. Accepts optional "type" (all/owner/public/private/member, ' +
    'default: all), "sort" (created/updated/pushed/full_name, default: created), "per_page" (max 100). ' +
    'Returns array of {id, name, full_name, private, description, language, default_branch, stargazers_count}.',
  params: [
    { name: 'type', type: 'string', required: false, description: 'Filter by type: all, owner, public, private, or member', default: 'all' },
    { name: 'sort', type: 'string', required: false, description: 'Sort by: created, updated, pushed, or full_name', default: 'created' },
    { name: 'per_page', type: 'number', required: false, description: 'Results per page (max 100)', default: 30 },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)

    const result = await githubFetch<Record<string, unknown>[]>({
      path: '/user/repos',
      params: {
        type: ctx.params.type as string,
        sort: ctx.params.sort as string,
        per_page: String(ctx.params.per_page ?? 30),
        ...(ctx.cursor ? { page: ctx.cursor } : {}),
      },
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: result.data.map(flattenRepository),
      meta: {
        has_more: result.pagination.hasMore,
        ...(result.pagination.nextPage !== undefined && { cursor: String(result.pagination.nextPage) }),
      },
      raw: result.data,
    }
  },
}
