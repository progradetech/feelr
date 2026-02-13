/**
 * @feelr/connector-discord
 *
 * Discord connector for Feelr. Implements 7 actions covering
 * messages (send), channels (list), members (list, ban, kick),
 * and roles (list, assign).
 *
 * Auth: bearer_token (Discord Bot Token from Developer Portal)
 * Bot tokens use "Bot" prefix in Authorization header, not "Bearer".
 * All actions use the shared discordFetch helper for consistent
 * error mapping and rate limit extraction via Discord API v10.
 */
import type { ConnectorDefinition } from '@feelr/connector-sdk'

import { messagesSend } from './actions/messages-send'
import { channelsList } from './actions/channels-list'
import { membersList } from './actions/members-list'
import { rolesList } from './actions/roles-list'
import { rolesAssign } from './actions/roles-assign'
import { membersBan } from './actions/members-ban'
import { membersKick } from './actions/members-kick'

export const discordConnector: ConnectorDefinition = {
  name: 'discord',
  display_name: 'Discord',
  version: '0.1.0',
  auth_type: 'bearer_token',
  actions: {
    'messages.send': messagesSend,
    'channels.list': channelsList,
    'members.list': membersList,
    'roles.list': rolesList,
    'roles.assign': rolesAssign,
    'members.ban': membersBan,
    'members.kick': membersKick,
  },
}
