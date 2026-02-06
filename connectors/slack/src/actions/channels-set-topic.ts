/**
 * channels.setTopic -- Set the topic for a Slack channel.
 *
 * Slack API: conversations.setTopic
 * Scope: channels:write.topic
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { slackFetch } from '../slack-fetch'
import { flattenChannel } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const channelsSetTopic: ActionDefinition = {
  name: 'channels.setTopic',
  description:
    'Sets the topic for a Slack channel. Accepts "channel" (required, channel ID) and "topic" ' +
    '(required, new topic text, max 250 characters). Returns the updated channel as ' +
    '{id, name, topic, purpose, num_members, is_archived, is_private, created}.',
  params: [
    {
      name: 'channel',
      type: 'string',
      required: true,
      description: 'Channel ID to set topic for (e.g. C1234567890)',
    },
    {
      name: 'topic',
      type: 'string',
      required: true,
      description: 'New topic text for the channel (max 250 characters)',
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const channel = requireParam(ctx, 'channel')
    const topic = requireParam(ctx, 'topic')

    const result = await slackFetch<Record<string, unknown>>({
      method: 'conversations.setTopic',
      params: {
        channel,
        topic,
      },
      credential,
      fetch: ctx.fetch,
    })

    // conversations.setTopic returns the channel in the `channel` field
    const channelData = (result.data.channel ?? result.data) as Record<
      string,
      unknown
    >

    return {
      data: flattenChannel(channelData),
      raw: result.raw,
    }
  },
}
