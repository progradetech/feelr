/**
 * messages.send -- Send a message to a Slack channel or thread.
 *
 * Slack API: chat.postMessage
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

export const messagesSend: ActionDefinition = {
  name: 'messages.send',
  description:
    'Sends a message to a Slack channel or thread. Accepts "channel" (required, channel ID or #name), ' +
    '"text" (required, message content), optional "thread_ts" to reply in a thread. ' +
    'Returns the posted message as {ts, text, channel, user, thread_ts, reply_count, type}.',
  params: [
    {
      name: 'channel',
      type: 'string',
      required: true,
      description: 'Channel ID (e.g. C1234567890) or channel name (e.g. #general)',
    },
    {
      name: 'text',
      type: 'string',
      required: true,
      description: 'Message text content (supports Slack mrkdwn formatting)',
    },
    {
      name: 'thread_ts',
      type: 'string',
      required: false,
      description: 'Timestamp of parent message to reply in thread',
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const channel = requireParam(ctx, 'channel')
    const text = requireParam(ctx, 'text')

    const params: Record<string, unknown> = { channel, text }

    if (ctx.params.thread_ts) {
      params.thread_ts = ctx.params.thread_ts as string
    }

    const result = await slackFetch<Record<string, unknown>>({
      method: 'chat.postMessage',
      params,
      credential,
      fetch: ctx.fetch,
    })

    // chat.postMessage returns the message in the `message` field
    const message = (result.data.message ?? result.data) as Record<
      string,
      unknown
    >
    // Inject channel into message since Slack doesn't always include it
    message.channel = result.data.channel ?? channel

    return {
      data: flattenMessage(message),
      raw: result.raw,
    }
  },
}
