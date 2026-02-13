/**
 * users.list -- List users in a Slack workspace.
 *
 * Slack API: users.list
 * Scope: users:read
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { slackFetch } from '../slack-fetch'
import { flattenUser } from '../flatten'
import { requireCredential } from '../utils'

export const usersList: ActionDefinition = {
  name: 'users.list',
  description:
    'Lists all users in a Slack workspace with cursor-based pagination. Accepts optional "limit" ' +
    '(default 200, max 1000). Returns array of {id, name, real_name, display_name, is_bot, is_admin, ' +
    'status_text, status_emoji}.',
  params: [
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Max users to return per page (max 1000)',
      default: 200,
    },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)

    const params: Record<string, unknown> = {
      limit: ctx.params.limit ?? 200,
    }

    // Pass cursor for pagination
    if (ctx.cursor) {
      params.cursor = ctx.cursor
    }

    const result = await slackFetch<Record<string, unknown>>({
      method: 'users.list',
      params,
      credential,
      fetch: ctx.fetch,
    })

    const members = (result.data.members ?? []) as Record<string, unknown>[]

    return {
      data: members.map(flattenUser),
      meta: {
        has_more: !!result.nextCursor,
        ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
      },
      raw: result.raw,
    }
  },
}
