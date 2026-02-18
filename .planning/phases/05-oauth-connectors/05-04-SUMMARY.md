---
phase: 05-oauth-connectors
plan: 04
subsystem: gateway
tags: [gateway, connectors, oauth, dispatch, tools-search, token-refresh]
dependency-graph:
  requires: ["05-01", "05-02", "05-03"]
  provides: ["gateway-connector-wiring", "oauth-endpoints", "tools-search", "token-refresh"]
  affects: ["05-05", "05-06"]
tech-stack:
  added: []
  patterns: ["refresh-adapter-registry", "server-side-token-exchange", "cross-connector-search"]
key-files:
  created:
    - apps/gateway/src/connectors/refresh-adapters.ts
  modified:
    - apps/gateway/src/routes/v1.ts
    - apps/gateway/src/routes/tools.ts
    - apps/gateway/src/routes/status.ts
    - apps/gateway/src/routes/admin.ts
    - apps/gateway/src/durable-objects/token-coordinator.ts
    - apps/gateway/src/lib/types.ts
    - apps/gateway/wrangler.toml
    - apps/gateway/package.json
    - apps/gateway/tsconfig.json
    - pnpm-lock.yaml
decisions:
  - id: "05-04-01"
    decision: "Refresh adapter registry pattern for provider-specific token refresh"
    context: "Token coordinator needs to call different OAuth APIs per provider"
    alternatives: ["Direct provider logic in DO", "Adapter per connector package"]
  - id: "05-04-02"
    decision: "OAuth exchange only for Slack (Discord/Stripe return auth_type guidance)"
    context: "Only Slack uses OAuth, others use direct tokens/API keys"
  - id: "05-04-03"
    decision: "Token rotation detection via expires_in field presence in Slack response"
    context: "Slack workspaces may or may not have token rotation enabled"
metrics:
  duration: 4 min
  completed: 2026-02-06
---

# Phase 5 Plan 4: Gateway Connector Wiring Summary

**Gateway wired with 4 connectors (github+3 new), tools search, OAuth endpoints, and real Slack token refresh replacing Phase 2 stub.**

## What Was Done

### Task 1: Register connectors + tools search + status auth state (22c2c6b)

**v1.ts -- Connector Registration:**
- Added imports for `@feelr/connector-slack`, `@feelr/connector-stripe`, `@feelr/connector-discord`
- Called `registerConnector()` for all 3 new connectors alongside existing github
- Added workspace dependencies in package.json and tsconfig.json path mappings

**tools.ts -- Cross-Connector Search:**
- Added `?search=` query param support to `GET /v1/tools`
- When search is present: iterates all connectors and their actions, matches name or description (case-insensitive)
- Returns flat array of `{ connector, action, description, returns }` with `tools.search` action type
- Without search: existing connector list behavior unchanged

**status.ts -- Auth State Per Connector:**
- Now iterates all registered connectors (not just those with stored credentials)
- Added `auth_state` field to ConnectorStatus: `connected | expired | not_configured`
- Queries DO Token Coordinator via `listCredentials()` to detect `failed` (expired) tokens
- Skips internal `mock` connector
- Per-connector health check with auth state overlay

### Task 2: OAuth endpoints + refresh adapter + env bindings (b26723e)

**admin.ts -- OAuth Endpoints:**
- `GET /admin/oauth/config/:provider` returns OAuth config for CLI auth flow
  - Slack: client_id, authorize_url, scopes
  - Discord: auth_type=token guidance message
  - Stripe: auth_type=api_key guidance message
- `POST /admin/oauth/exchange/:provider` performs server-side token exchange
  - Only Slack supported (only OAuth provider)
  - Exchanges auth code via Slack's `oauth.v2.access` endpoint
  - Detects token rotation via `expires_in` field presence
  - Stores credential with encryption, registers with DO if refreshable

**refresh-adapters.ts -- Token Refresh Registry:**
- `RefreshAdapter` interface with `provider` and `refresh()` method
- Slack adapter: POSTs to `oauth.v2.access` with `grant_type=refresh_token`
- Checks Slack's `json.ok` field (HTTP 200 quirk)
- `getRefreshAdapter(provider)` returns adapter or null

**token-coordinator.ts -- Real Refresh Logic:**
- Replaced Phase 2 stub with adapter-based refresh
- Calls `getRefreshAdapter()` for provider-specific logic
- Skips providers without adapters (GitHub, Discord, Stripe)
- On success: updates SQLite row AND KV with new encrypted credential
- Retains exponential backoff and 3-retry max failure handling
- Added SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to DO Env interface

**types.ts + wrangler.toml:**
- Added `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` to AppEnv bindings
- Documented required Worker Secrets in wrangler.toml comments

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Register connectors + tools search + status auth state | 22c2c6b | v1.ts, tools.ts, status.ts |
| 2 | OAuth endpoints + refresh adapter + env bindings | b26723e | admin.ts, refresh-adapters.ts, token-coordinator.ts |

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Refresh adapter registry pattern** -- Provider-specific refresh logic lives in a central registry (`refresh-adapters.ts`) rather than being embedded in the DO or connector packages. This keeps the DO focused on scheduling/coordination and adapters focused on API specifics.

2. **OAuth exchange only for Slack** -- The `/oauth/config` endpoint returns `auth_type` guidance for Discord (bot tokens) and Stripe (API keys), directing them to use direct credential storage instead. Only Slack goes through the full OAuth exchange flow.

3. **Token rotation detection** -- When Slack returns `expires_in` and `refresh_token` in the exchange response, we treat it as rotation-enabled. When absent, the token is stored with null expiry (never expires, no DO registration needed).

## Verification Results

- Gateway compiles cleanly with `tsc --noEmit`
- All 4 connectors registered (github, slack, stripe, discord) via `registerConnector()`
- Tools search returns matching actions across all connectors via `?search=`
- OAuth config endpoint returns Slack client_id and scopes
- OAuth exchange endpoint handles Slack code exchange with rotation detection
- Token coordinator uses real Slack refresh adapter (Phase 2 stub replaced)
- wrangler.toml documents SLACK_CLIENT_ID and SLACK_CLIENT_SECRET secrets

## Next Phase Readiness

**Ready for:** Plan 05-05 (integration tests) and Plan 05-06 (CLI auth command)
**No blockers.** All gateway wiring complete. OAuth infrastructure ready for CLI to build auth flow.

## Self-Check: PASSED
