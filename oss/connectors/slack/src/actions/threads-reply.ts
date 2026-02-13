/**
 * threads.reply -- Reply to a thread in a Slack channel.
 *
 * Slack API: chat.postMessage (with thread_ts required)
 * Scope: chat:write
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { slackFetch } from '../slack-fetch'
import { flattenMessage } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const threadsReply: ActionDefinition = {
  name: 'threads.reply',
  description:
    'Replies to a specific thread in a Slack channel. Accepts "channel" (required, channel ID), ' +
    '"thread_ts" (required, parent message timestamp), "text" (required, reply content). ' +
    'Returns the posted reply as {ts, text, channel, user, thread_ts, reply_count, type}.',
  params: [
    {
      name: 'channel',
      type: 'string',
      required: true,
      description: 'Channel ID containing the thread (e.g. C1234567890)',
    },
    {
      name: 'thread_ts',
      type: 'string',
      required: true,
      description: 'Timestamp of the parent message to reply to',
    },
    {
      name: 'text',
      type: 'string',
      required: true,
      description: 'Reply text content (supports Slack mrkdwn formatting)',
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const channel = requireParam(ctx, 'channel')
    const threadTs = requireParam(ctx, 'thread_ts')
    const text = requireParam(ctx, 'text')

    const result = await slackFetch<Record<string, unknown>>({
      method: 'chat.postMessage',
      params: {
        channel,
        thread_ts: threadTs,
        text,
      },
      credential,
      fetch: ctx.fetch,
    })

    // chat.postMessage returns the message in the `message` field
    const message = (result.data.message ?? result.data) as Record<
      string,
      unknown
    >
    message.channel = result.data.channel ?? channel

    return {
      data: flattenMessage(message),
      raw: result.raw,
    }
  },
}
