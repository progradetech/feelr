/**
 * members.list -- List members in a Discord guild.
 *
 * GET /guilds/{guild_id}/members
 * Paginated via "after" (user ID) query param.
 * Requires Server Members Intent enabled in bot settings.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { discordFetch } from '../discord-fetch'
import { flattenMember } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const membersList: ActionDefinition = {
  name: 'members.list',
  description:
    'Lists members of a Discord guild (server). Accepts "guild_id" (required), ' +
    'optional "limit" (number, default 100, max 1000), uses cursor-based pagination via user ID. ' +
    'Requires Server Members Intent in bot settings. ' +
    'Returns array of {user_id, username, display_name, nick, roles, joined_at, is_bot}.',
  params: [
    { name: 'guild_id', type: 'string', required: true, description: 'ID of the Discord guild (server)' },
    { name: 'limit', type: 'number', required: false, description: 'Max members to return (1-1000)', default: 100 },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const guildId = requireParam(ctx, 'guild_id')
    const limit = ctx.params.limit ?? 100

    const result = await discordFetch<Record<string, unknown>[]>({
      path: `/guilds/${guildId}/members`,
      params: {
        limit: String(limit),
        ...(ctx.cursor ? { after: ctx.cursor } : {}),
      },
      credential,
      fetch: ctx.fetch,
    })

    const members = result.data.map(flattenMember)

    // Cursor-based pagination: if result length equals limit, more may exist
    const hasMore = result.data.length === Number(limit)
    const lastUserId = hasMore && members.length > 0
      ? (members[members.length - 1].user_id as string)
      : undefined

    return {
      data: members,
      meta: {
        has_more: hasMore,
        ...(lastUserId ? { cursor: lastUserId } : {}),
      },
      raw: result.raw,
    }
  },
}
