/**
 * @feelr/connector-slack
 *
 * Slack connector for Feelr. Implements 6 actions covering
 * messages (send, search), channels (list, set topic),
 * users (list), and threads (reply).
 *
 * Auth: oauth2 (Slack bot token, xoxb-*)
 * All actions use the shared slackFetch helper for consistent
 * error mapping (HTTP 200 with ok=false), pagination, and
 * rate limit extraction.
 */
import type { ConnectorDefinition } from '@feelr/connector-sdk'

import { messagesSend } from './actions/messages-send'
import { channelsList } from './actions/channels-list'
import { messagesSearch } from './actions/messages-search'
import { usersList } from './actions/users-list'
import { threadsReply } from './actions/threads-reply'
import { channelsSetTopic } from './actions/channels-set-topic'

export const slackConnector: ConnectorDefinition = {
  name: 'slack',
  display_name: 'Slack',
  version: '0.1.0',
  auth_type: 'oauth2',
  actions: {
    'messages.send': messagesSend,
    'channels.list': channelsList,
    'messages.search': messagesSearch,
    'users.list': usersList,
    'threads.reply': threadsReply,
    'channels.setTopic': channelsSetTopic,
  },
}
