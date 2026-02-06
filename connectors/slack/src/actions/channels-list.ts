/**
 * channels.list -- List channels in a Slack workspace.
 *
 * Slack API: conversations.list
 * Scope: channels:read
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { slackFetch } from '../slack-fetch'
import { flattenChannel } from '../flatten'
import { requireCredential } from '../utils'

export const channelsList: ActionDefinition = {
  name: 'channels.list',
  description:
    'Lists channels in a Slack workspace with cursor-based pagination. Accepts optional "types" ' +
    '(default "public_channel", can include "private_channel"), "limit" (default 200, max 1000), ' +
    '"exclude_archived" (default true). Returns array of {id, name, topic, purpose, num_members, is_archived, is_private, created}.',
  params: [
    {
      name: 'types',
      type: 'string',
      required: false,
      description:
        'Comma-separated channel types: public_channel, private_channel',
      default: 'public_channel',
    },
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Max channels to return per page (max 1000)',
      default: 200,
    },
    {
      name: 'exclude_archived',
      type: 'boolean',
      required: false,
      description: 'Exclude archived channels from results',
      default: true,
    },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)

    const params: Record<string, unknown> = {
      types: (ctx.params.types as string) ?? 'public_channel',
      limit: ctx.params.limit ?? 200,
      exclude_archived: ctx.params.exclude_archived ?? true,
    }

    // Pass cursor for pagination
    if (ctx.cursor) {
      params.cursor = ctx.cursor
    }

    const result = await slackFetch<Record<string, unknown>>({
      method: 'conversations.list',
      params,
      credential,
      fetch: ctx.fetch,
    })

    const channels = (result.data.channels ?? []) as Record<string, unknown>[]

    return {
      data: channels.map(flattenChannel),
      meta: {
        has_more: !!result.nextCursor,
        ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
      },
      raw: result.raw,
    }
  },
}
