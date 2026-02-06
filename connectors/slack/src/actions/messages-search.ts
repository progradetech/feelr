/**
 * messages.search -- Search for messages across a Slack workspace.
 *
 * Slack API: search.messages
 * Scope: search:read
 *
 * NOTE: search.messages uses page-based pagination (not cursor-based).
 * The cursor field is used to pass the page number.
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { slackFetch } from '../slack-fetch'
import { flattenMessage } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const messagesSearch: ActionDefinition = {
  name: 'messages.search',
  description:
    'Searches for messages across a Slack workspace. Accepts "query" (required, search text), ' +
    'optional "sort" ("score" or "timestamp", default "score"), "count" (results per page, default 20, max 100). ' +
    'Returns array of {ts, text, user, thread_ts, reply_count, type, channel}.',
  params: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: 'Search query string (supports Slack search modifiers)',
    },
    {
      name: 'sort',
      type: 'string',
      required: false,
      description: 'Sort order: "score" (relevance) or "timestamp"',
      default: 'score',
    },
    {
      name: 'count',
      type: 'number',
      required: false,
      description: 'Number of results per page (max 100)',
      default: 20,
    },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const query = requireParam(ctx, 'query')

    const params: Record<string, unknown> = {
      query,
      sort: (ctx.params.sort as string) ?? 'score',
      count: ctx.params.count ?? 20,
    }

    // search.messages uses page-based pagination
    if (ctx.cursor) {
      params.page = Number(ctx.cursor)
    }

    const result = await slackFetch<Record<string, unknown>>({
      method: 'search.messages',
      params,
      credential,
      fetch: ctx.fetch,
    })

    // search.messages returns results in messages.matches
    const messages = result.data.messages as Record<string, unknown> | undefined
    const matches = (messages?.matches ?? []) as Record<string, unknown>[]

    // Pagination: extract paging info
    const paging = messages?.paging as Record<string, unknown> | undefined
    const currentPage = (paging?.page as number) ?? 1
    const totalPages = (paging?.pages as number) ?? 1
    const hasMore = currentPage < totalPages

    return {
      data: matches.map(flattenMessage),
      meta: {
        has_more: hasMore,
        ...(hasMore ? { cursor: String(currentPage + 1) } : {}),
      },
      raw: result.raw,
    }
  },
}
