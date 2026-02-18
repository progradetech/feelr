/**
 * roles.list -- List all roles in a Discord guild.
 *
 * GET /guilds/{guild_id}/roles
 * Discord returns all roles at once (no pagination needed).
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { discordFetch } from '../discord-fetch'
import { flattenRole } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const rolesList: ActionDefinition = {
  name: 'roles.list',
  description:
    'Lists all roles in a Discord guild (server). Accepts "guild_id" (required, the server ID). ' +
    'Returns all roles at once with no pagination. ' +
    'Returns array of {id, name, color, position, permissions, mentionable, managed}.',
  params: [
    { name: 'guild_id', type: 'string', required: true, description: 'ID of the Discord guild (server)' },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const guildId = requireParam(ctx, 'guild_id')

    const result = await discordFetch<Record<string, unknown>[]>({
      path: `/guilds/${guildId}/roles`,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: result.data.map(flattenRole),
      meta: { has_more: false },
      raw: result.raw,
    }
  },
}
