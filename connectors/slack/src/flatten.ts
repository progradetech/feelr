/**
 * Response flattening functions for Slack resources.
 *
 * Each function takes a raw Slack API response object and extracts
 * only the essential fields, eliminating nested objects and reducing
 * token overhead for agent consumption.
 *
 * Field counts: Channel (8), Message (7), User (8).
 */

/**
 * Flatten a Slack channel (conversation) response to 8 essential fields.
 *
 * Extracts: id, name, topic, purpose, num_members, is_archived, is_private, created
 */
export function flattenChannel(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const topic = raw.topic as Record<string, unknown> | undefined
  const purpose = raw.purpose as Record<string, unknown> | undefined

  return {
    id: raw.id,
    name: raw.name,
    topic: topic?.value ?? null,
    purpose: purpose?.value ?? null,
    num_members: raw.num_members ?? null,
    is_archived: raw.is_archived ?? false,
    is_private: raw.is_private ?? false,
    created: raw.created,
  }
}

/**
 * Flatten a Slack message response to 7 essential fields.
 *
 * Extracts: ts, text, user, thread_ts, reply_count, type, channel
 */
export function flattenMessage(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    ts: raw.ts,
    text: raw.text,
    user: raw.user ?? null,
    thread_ts: raw.thread_ts ?? null,
    reply_count: raw.reply_count ?? null,
    type: raw.type ?? 'message',
    channel: raw.channel ?? null,
  }
}

/**
 * Flatten a Slack user response to 8 essential fields.
 *
 * Extracts: id, name, real_name, display_name, is_bot, is_admin, status_text, status_emoji
 */
export function flattenUser(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const profile = raw.profile as Record<string, unknown> | undefined

  return {
    id: raw.id,
    name: raw.name,
    real_name: raw.real_name ?? profile?.real_name ?? null,
    display_name: profile?.display_name ?? null,
    is_bot: raw.is_bot ?? false,
    is_admin: raw.is_admin ?? false,
    status_text: profile?.status_text ?? null,
    status_emoji: profile?.status_emoji ?? null,
  }
}
