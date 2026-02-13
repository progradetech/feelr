/**
 * channels.list -- List all channels in a Discord guild.
 *
 * GET /guilds/{guild_id}/channels
 * Discord returns all channels at once (no pagination needed).
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { discordFetch } from '../discord-fetch'
import { flattenChannel } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const channelsList: ActionDefinition = {
  name: 'channels.list',
  description:
    'Lists all channels in a Discord guild (server). Accepts "guild_id" (required, the server ID). ' +
    'Returns all channels at once with no pagination. ' +
    'Returns array of {id, name, type, topic, position, nsfw, parent_id, guild_id}.',
  params: [
    { name: 'guild_id', type: 'string', required: true, description: 'ID of the Discord guild (server)' },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const guildId = requireParam(ctx, 'guild_id')

    const result = await discordFetch<Record<string, unknown>[]>({
      path: `/guilds/${guildId}/channels`,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: result.data.map(flattenChannel),
      meta: { has_more: false },
      raw: result.raw,
    }
  },
}
