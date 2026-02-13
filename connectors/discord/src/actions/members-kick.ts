/**
 * members.kick -- Kick a member from a Discord guild.
 *
 * DELETE /guilds/{guild_id}/members/{user_id}
 * Returns 204 No Content on success -- construct return object manually.
 * Requires Kick Members permission.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { discordFetch } from '../discord-fetch'
import { requireCredential, requireParam } from '../utils'

export const membersKick: ActionDefinition = {
  name: 'members.kick',
  description:
    'Kicks a member from a Discord guild. Accepts "guild_id" (required) and "user_id" (required, the member to kick). ' +
    'Requires Kick Members permission. Unlike ban, kicked members can rejoin via invite. ' +
    'Returns {success, guild_id, user_id}.',
  params: [
    { name: 'guild_id', type: 'string', required: true, description: 'ID of the Discord guild (server)' },
    { name: 'user_id', type: 'string', required: true, description: 'ID of the user to kick' },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const guildId = requireParam(ctx, 'guild_id')
    const userId = requireParam(ctx, 'user_id')

    await discordFetch({
      path: `/guilds/${guildId}/members/${userId}`,
      method: 'DELETE',
      credential,
      fetch: ctx.fetch,
    })

    // 204 No Content -- construct response manually
    return {
      data: {
        success: true,
        guild_id: guildId,
        user_id: userId,
      },
    }
  },
}
