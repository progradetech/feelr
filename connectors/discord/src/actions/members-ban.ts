/**
 * members.ban -- Ban a member from a Discord guild.
 *
 * PUT /guilds/{guild_id}/bans/{user_id}
 * Returns 204 No Content on success -- construct return object manually.
 * Requires Ban Members permission.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { discordFetch } from '../discord-fetch'
import { requireCredential, requireParam } from '../utils'

export const membersBan: ActionDefinition = {
  name: 'members.ban',
  description:
    'Bans a member from a Discord guild. Accepts "guild_id" (required), "user_id" (required, the member to ban), ' +
    'and optional "delete_message_seconds" (number, 0-604800, seconds of message history to delete, default 0). ' +
    'Requires Ban Members permission. Returns {success, guild_id, user_id}.',
  params: [
    { name: 'guild_id', type: 'string', required: true, description: 'ID of the Discord guild (server)' },
    { name: 'user_id', type: 'string', required: true, description: 'ID of the user to ban' },
    { name: 'delete_message_seconds', type: 'number', required: false, description: 'Seconds of messages to delete (0-604800)', default: 0 },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const guildId = requireParam(ctx, 'guild_id')
    const userId = requireParam(ctx, 'user_id')
    const deleteMessageSeconds = ctx.params.delete_message_seconds ?? 0

    await discordFetch({
      path: `/guilds/${guildId}/bans/${userId}`,
      method: 'PUT',
      body: { delete_message_seconds: Number(deleteMessageSeconds) },
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
