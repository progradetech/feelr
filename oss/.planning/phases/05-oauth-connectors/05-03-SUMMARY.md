---
phase: 05-oauth-connectors
plan: 03
subsystem: connectors
tags: [discord, bot-token, api-v10, moderation, actions]
dependency-graph:
  requires: [03-github-connector]
  provides: [discord-connector-7-actions, discord-fetch-helper, discord-flatten]
  affects: [05-04-connector-registration, 06-dashboard]
tech-stack:
  added: []
  patterns: [bot-token-auth, 204-no-content-handling, cursor-pagination-by-user-id]
key-files:
  created:
    - connectors/discord/package.json
    - connectors/discord/tsconfig.json
    - connectors/discord/src/index.ts
    - connectors/discord/src/discord-fetch.ts
    - connectors/discord/src/flatten.ts
    - connectors/discord/src/utils.ts
    - connectors/discord/src/actions/messages-send.ts
    - connectors/discord/src/actions/channels-list.ts
    - connectors/discord/src/actions/members-list.ts
    - connectors/discord/src/actions/roles-list.ts
    - connectors/discord/src/actions/roles-assign.ts
    - connectors/discord/src/actions/members-ban.ts
    - connectors/discord/src/actions/members-kick.ts
  modified: []
decisions:
  - "Discord uses Bot token prefix (not Bearer) in Authorization header"
  - "auth_type is bearer_token since bot tokens are direct tokens like GitHub PATs"
  - "204 No Content responses handled for roles.assign, members.ban, members.kick"
  - "members.list uses cursor pagination via last user_id (Discord's after param)"
metrics:
  duration: 3 min
  completed: 2026-02-06
---

# Phase 05 Plan 03: Discord Connector Package Summary

Discord connector with 7 actions using Bot token auth (not OAuth), discordFetch helper targeting API v10, and flatten functions for channel/member/role/message resources.

## What Was Built

### Task 1: Discord package scaffold + discordFetch helper + flatten + utils

**discordFetch** (`connectors/discord/src/discord-fetch.ts`):
- Base URL: `https://discord.com/api/v10`
- Auth header: `Authorization: Bot <token>` (not Bearer)
- User-Agent: `Feelr/1.0` (required by Discord)
- Rate limit extraction: `X-RateLimit-Remaining`, `X-RateLimit-Limit`, `X-RateLimit-Reset-After`
- Error mapping: 400->VALIDATION_ERROR, 401->AUTH_INVALID, 403->FORBIDDEN, 404->NOT_FOUND, 429->RATE_LIMITED (with retry_after), 5xx->UPSTREAM_ERROR
- 204 No Content handling for moderation endpoints (kick, ban, role assign)

**flatten.ts**: 4 flattening functions:
- `flattenChannel`: 8 fields (id, name, type, topic, position, nsfw, parent_id, guild_id)
- `flattenMember`: 7 fields (user_id, username, display_name, nick, roles, joined_at, is_bot)
- `flattenRole`: 7 fields (id, name, color, position, permissions, mentionable, managed)
- `flattenMessage`: 7 fields (id, content, author_id, author_username, channel_id, timestamp, type)

**utils.ts**: `requireCredential` + `requireParam` with FeelrError throwing.

### Task 2: All 7 Discord action handlers + ConnectorDefinition

| Action | Endpoint | Method | Returns | Special |
|--------|----------|--------|---------|---------|
| messages.send | /channels/{id}/messages | POST | single | flattenMessage |
| channels.list | /guilds/{id}/channels | GET | list | No pagination |
| members.list | /guilds/{id}/members | GET | list | Cursor via user_id |
| roles.list | /guilds/{id}/roles | GET | list | No pagination |
| roles.assign | /guilds/{id}/members/{uid}/roles/{rid} | PUT | single | 204 response |
| members.ban | /guilds/{id}/bans/{uid} | PUT | single | 204 response |
| members.kick | /guilds/{id}/members/{uid} | DELETE | single | 204 response |

**ConnectorDefinition**: `discordConnector` with name='discord', auth_type='bearer_token', 7 actions.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Discord package scaffold + discordFetch helper + flatten + utils | 0a541a5 | discord-fetch.ts, flatten.ts, utils.ts |
| 2 | All 7 Discord action handlers + ConnectorDefinition | 5f085a5 | actions/*.ts, index.ts |

Note: Task 2 files were committed as part of 5f085a5 (05-01 docs commit) due to parallel agent execution picking up untracked files. All files are correctly committed and verified.

## Decisions Made

1. **Bot token auth prefix**: Discord bot tokens use `Authorization: Bot <token>`, not `Bearer <token>`. This is a Discord-specific convention.
2. **auth_type = bearer_token**: Despite using "Bot" prefix internally, bot tokens function like GitHub PATs (direct, non-expiring tokens from Developer Portal), so bearer_token is the correct ConnectorDefinition auth_type.
3. **204 No Content handling**: Three moderation actions (roles.assign, members.ban, members.kick) return 204 with no body. Handler constructs `{success: true, ...params}` response.
4. **Cursor pagination via user_id**: members.list uses Discord's `after` param (last user ID) for pagination, matching Discord's native pattern.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `pnpm --filter @feelr/connector-discord typecheck` passes
- discordConnector.actions has exactly 7 entries
- auth_type is 'bearer_token'
- Auth header uses "Bot" prefix in discordFetch
- 204 No Content responses handled for moderation actions
- API v10 base URL used

## Next Phase Readiness

No blockers. Discord connector is ready for registration in Plan 04 (connector registration).

## Self-Check: PASSED
