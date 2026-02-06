/**
 * Response flattening functions for Discord resources.
 *
 * Each function takes a raw Discord API response object and extracts
 * only the essential fields, eliminating nested objects and reducing
 * token overhead for agent consumption.
 *
 * Field counts: Channel (8), Member (7), Role (7), Message (7).
 * All dates are ISO 8601 (Discord's native format, no conversion needed).
 */

/**
 * Flatten a Discord channel response to 8 essential fields.
 *
 * Extracts: id, name, type, topic, position, nsfw, parent_id, guild_id
 */
export function flattenChannel(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    topic: raw.topic ?? null,
    position: raw.position ?? null,
    nsfw: raw.nsfw ?? false,
    parent_id: raw.parent_id ?? null,
    guild_id: raw.guild_id ?? null,
  }
}

/**
 * Flatten a Discord guild member response to 7 essential fields.
 *
 * Extracts: user_id, username, display_name, nick, roles, joined_at, is_bot
 *
 * Note: Discord nests user info under a "user" object within the member.
 */
export function flattenMember(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const user = (raw.user as Record<string, unknown>) ?? {}
  return {
    user_id: user.id ?? null,
    username: user.username ?? null,
    display_name: user.global_name ?? null,
    nick: raw.nick ?? null,
    roles: raw.roles ?? [],
    joined_at: raw.joined_at ?? null,
    is_bot: user.bot ?? false,
  }
}

/**
 * Flatten a Discord role response to 7 essential fields.
 *
 * Extracts: id, name, color, position, permissions, mentionable, managed
 */
export function flattenRole(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color,
    position: raw.position,
    permissions: raw.permissions,
    mentionable: raw.mentionable ?? false,
    managed: raw.managed ?? false,
  }
}

/**
 * Flatten a Discord message response to 7 essential fields.
 *
 * Extracts: id, content, author_id, author_username, channel_id, timestamp, type
 *
 * Note: Discord nests author info under an "author" object within the message.
 */
export function flattenMessage(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const author = (raw.author as Record<string, unknown>) ?? {}
  return {
    id: raw.id,
    content: raw.content ?? '',
    author_id: author.id ?? null,
    author_username: author.username ?? null,
    channel_id: raw.channel_id,
    timestamp: raw.timestamp,
    type: raw.type,
  }
}
