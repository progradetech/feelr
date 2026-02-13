/**
 * roles.assign -- Assign a role to a guild member.
 *
 * PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}
 * Returns 204 No Content on success -- construct return object manually.
 * Requires Manage Roles permission.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { discordFetch } from '../discord-fetch'
import { requireCredential, requireParam } from '../utils'

export const rolesAssign: ActionDefinition = {
  name: 'roles.assign',
  description:
    'Assigns a role to a member in a Discord guild. Accepts "guild_id" (required), ' +
    '"user_id" (required, the member to assign the role to), and "role_id" (required, the role to assign). ' +
    'Requires Manage Roles permission. Returns {success, guild_id, user_id, role_id}.',
  params: [
    { name: 'guild_id', type: 'string', required: true, description: 'ID of the Discord guild (server)' },
    { name: 'user_id', type: 'string', required: true, description: 'ID of the user to assign the role to' },
    { name: 'role_id', type: 'string', required: true, description: 'ID of the role to assign' },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const guildId = requireParam(ctx, 'guild_id')
    const userId = requireParam(ctx, 'user_id')
    const roleId = requireParam(ctx, 'role_id')

    await discordFetch({
      path: `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      method: 'PUT',
      credential,
      fetch: ctx.fetch,
    })

    // 204 No Content -- construct response manually
    return {
      data: {
        success: true,
        guild_id: guildId,
        user_id: userId,
        role_id: roleId,
      },
    }
  },
}
