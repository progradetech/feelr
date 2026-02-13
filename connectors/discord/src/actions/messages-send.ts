/**
 * messages.send -- Send a message to a Discord channel.
 *
 * POST /channels/{channel_id}/messages
 * Requires Send Messages permission.
 */
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { discordFetch } from '../discord-fetch'
import { flattenMessage } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const messagesSend: ActionDefinition = {
  name: 'messages.send',
  description:
    'Sends a message to a Discord channel. Accepts "channel_id" (required, the channel to post in) ' +
    'and "content" (required, message text up to 2000 chars). ' +
    'Requires Send Messages permission. Returns {id, content, author_id, author_username, channel_id, timestamp, type}.',
  params: [
    { name: 'channel_id', type: 'string', required: true, description: 'ID of the channel to send the message to' },
    { name: 'content', type: 'string', required: true, description: 'Message content (max 2000 characters)' },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const channelId = requireParam(ctx, 'channel_id')
    const content = requireParam(ctx, 'content')

    const result = await discordFetch<Record<string, unknown>>({
      path: `/channels/${channelId}/messages`,
      method: 'POST',
      body: { content },
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenMessage(result.data),
      raw: result.raw,
    }
  },
}
