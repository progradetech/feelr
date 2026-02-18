---
phase: 05-oauth-connectors
plan: 05
subsystem: cli-auth
tags: [go, cli, oauth2, cobra, auth, browser-flow, token-input, re-auth]
depends_on:
  requires: ["05-04"]
  provides: ["feelr-auth-command", "oauth-browser-flow", "token-input", "re-auth-prompting"]
  affects: ["06-dashboard", "07-production-hardening"]
tech-stack:
  added: ["github.com/pkg/browser"]
  patterns: ["admin-client-pattern", "callback-server-oauth", "auth-expired-retry-hook"]
key-files:
  created:
    - cli/internal/auth/providers.go
    - cli/internal/auth/oauth.go
    - cli/internal/auth/token.go
    - cli/internal/auth/reauth.go
    - cli/cmd/auth.go
  modified:
    - cli/internal/client/client.go
    - cli/internal/config/config.go
    - cli/cmd/root.go
    - cli/cmd/run.go
    - cli/go.mod
    - cli/go.sum
decisions:
  - id: "05-05-01"
    description: "Admin client pattern with Bearer token for /admin/* endpoints"
  - id: "05-05-02"
    description: "OnAuthExpired callback with single-retry in GatewayClient.doRequest"
  - id: "05-05-03"
    description: "LoadAdminToken reads admin_token from config file profile section"
metrics:
  duration: "5 min"
  completed: "2026-02-06"
---

# Phase 05 Plan 05: CLI Auth Command Summary

CLI `feelr auth <provider>` command with OAuth browser flow for Slack and direct token input for Discord/Stripe, plus interactive re-auth prompting on token expiry.

## One-liner

Cobra auth command with 3 provider subcommands: Slack OAuth browser flow with localhost callback server, Discord/Stripe direct token via flag/env/prompt, plus OnAuthExpired retry hook in HTTP client.

## What Was Built

### Auth Internal Package (`cli/internal/auth/`)

**providers.go** - Provider configuration registry with `ProviderConfig` struct defining auth type (oauth2 vs token), prompt messages, and environment variable names. Three providers registered: Slack (OAuth2), Discord (token), Stripe (token).

**oauth.go** - Full OAuth2 authorization code flow for Slack:
1. Fetches OAuth config from gateway (`GET /admin/oauth/config/slack`)
2. Starts localhost HTTP server on random port (`net.Listen("tcp", "127.0.0.1:0")`)
3. Builds authorize URL with client_id, scopes, redirect_uri, CSRF state
4. Opens browser via `pkg/browser` (ignores error for headless)
5. Prints URL to stderr for manual copy (headless/SSH fallback)
6. Captures callback with state validation, 5-minute timeout
7. Sends code to gateway (`POST /admin/oauth/exchange/slack`) for server-side exchange
8. Manual code paste fallback when `--no-browser` flag set or listener fails

**token.go** - Direct token input for Discord/Stripe with resolution order:
1. `--token` flag value
2. Environment variable (`FEELR_DISCORD_TOKEN`, `FEELR_STRIPE_TOKEN`)
3. Interactive terminal prompt (detected via `golang.org/x/term`)
4. Clear error with instructions for non-interactive sessions

**reauth.go** - Interactive re-authentication prompting:
- `IsInteractive()` detects terminal via `term.IsTerminal`
- `PromptReauth()` shows "Token expired. Re-authenticate now? [Y/n]"
- `ReauthError()` creates CLIError exit code 2 with re-auth instructions

### Auth Command (`cli/cmd/auth.go`)

Parent `authCmd` with three subcommands:
- `feelr auth slack` - OAuth flow with `--no-browser` flag
- `feelr auth discord` - Token input with `--token` flag
- `feelr auth stripe` - Token input with `--token` flag

`loadAdminClient` helper resolves admin token from `FEELR_ADMIN_TOKEN` env var or config file `admin_token` field.

### Client Extensions (`cli/internal/client/client.go`)

- `NewAdminClient()` creates client with Bearer token auth for `/admin/*` routes
- `GetOAuthConfig()` fetches provider OAuth config from gateway
- `PostOAuthExchange()` sends authorization code for server-side token exchange
- `PostAdminCredential()` stores direct tokens for non-OAuth providers
- `OnAuthExpired` callback field with single-retry logic in `doRequest`
- `isTokenExpired()` detects TOKEN_EXPIRED, REFRESH_FAILED, or auth hint with "expired"
- `cloneRequest()` enables request body re-read on retry

### Config Extension (`cli/internal/config/config.go`)

- `LoadAdminToken()` reads `admin_token` from profile section in config file

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Auth internal packages + client methods | d09c8d0 | oauth.go, token.go, providers.go, client.go |
| 2 | Auth command with provider subcommands | 7e1fbbe | auth.go, root.go, config.go |
| 3 | Interactive re-auth prompt on token expiry | 01031d6 | reauth.go, run.go |

## Decisions Made

1. **Admin client pattern** - Separate `NewAdminClient` with Bearer token auth, distinct from `NewGatewayClient` with X-Feelr-Key. Auth commands use admin client; run commands use regular API client.

2. **OnAuthExpired callback in doRequest** - Single-retry pattern: detects expired token errors, calls callback, retries once on success. Wired only in `runAction` (not admin client). Uses `GetBody` for request body re-read.

3. **LoadAdminToken from config** - Admin token resolved from `FEELR_ADMIN_TOKEN` env var first, then config file `profile.admin_token` field. Follows same precedence pattern as API key resolution.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `go build ./...` succeeds
- `feelr auth --help` lists slack, discord, stripe subcommands
- `feelr auth slack --help` shows --no-browser flag
- `feelr auth discord --help` shows --token flag
- Code sends auth code to gateway `/admin/oauth/exchange/:provider`
- Token resolution: --token flag > env var > interactive prompt
- All prompts to stderr
- `GatewayClient.OnAuthExpired` callback field exists
- `reauth.go` uses `golang.org/x/term` for interactive detection
- Non-interactive token expiry returns CLIError exit code 2

## Next Phase Readiness

No blockers. The auth command is ready for end-to-end testing once the gateway is deployed. Phase 6 (Dashboard) can use the same admin client pattern for its backend API calls.

## Self-Check: PASSED
