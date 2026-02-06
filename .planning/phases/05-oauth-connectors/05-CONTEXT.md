# Phase 5: OAuth Connectors - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can connect OAuth-based services (Slack, Discord, Stripe) through browser or CLI, and agents can discover all available actions with minimal token overhead. This phase adds three new connectors with OAuth flows and extends the tools discovery endpoint. The composable actions engine, dashboard integration, and billing are separate phases.

</domain>

<decisions>
## Implementation Decisions

### OAuth flow UX
- Dual auth paths: browser OAuth for interactive use + `--token` flag / env var for agents and CI
- `feelr auth <provider>` prints the auth URL to terminal AND tries to auto-open browser (fallback for headless/SSH environments)
- Callback uses local HTTP server (temporary localhost listener), falls back to manual code paste if port unavailable or headless detected
- When token expires and refresh token is also expired: if running interactively, auto-prompt "Token expired. Re-authenticate now? [Y/n]"; if non-interactive, fail with clear error message and instructions

### Connector action scope — Slack
- ~6 actions (expanded beyond roadmap minimum of 3):
  - send.message, channels.list, messages.search (roadmap requirements)
  - Plus: users.list, threads.reply, channels.setTopic (expanded set)

### Connector action scope — Stripe
- Read-heavy approach (~8 actions):
  - list + get for payments, customers, and invoices (6 read actions)
  - create for customers and invoices (2 write actions)
  - No update/delete in this phase

### Connector action scope — Discord
- Claude's Discretion: Claude picks a balanced set of ~6-8 actions covering messages, channels, roles, and moderation based on common agent workflows

### Agent discovery
- Grouped by connector by default (same 3-level pattern as Phase 4) + `--search` flag for cross-connector action search
- Both: `feelr tools` shows connectors, `feelr tools slack` shows Slack actions, AND `feelr tools --search message` finds across all connectors

### Error handling
- Provider rate limits (429): pass through to caller with provider's Retry-After header — caller decides retry strategy
- All other error/edge case decisions (token expiry retry, auth status granularity, provider quirk abstraction) are Claude's discretion

### Claude's Discretion
- Action naming convention across connectors (consistent entity.verb format vs per-provider natural names)
- Agent-optimized description format (what to include in 50-100 token descriptions)
- Schema depth in discovery (full param constraints vs names+types with detail on drill-down)
- Auth status display in tools discovery vs keeping it in `feelr status`
- Token expiry mid-request handling (auto-retry once vs fail immediately)
- Partial auth state granularity (multi-state vs binary per connector)
- Provider quirk abstraction level (fully abstracted vs transparent defaults with flags)
- Discord specific action selection (~6-8 actions covering messages, channels, roles, moderation)

</decisions>

<specifics>
## Specific Ideas

- Auth should work for both humans (browser OAuth) and agents (token flag / env var) — the dual-path requirement is firm
- User wants the same progressive discovery pattern from Phase 4 extended with cross-connector search
- Slack expanded beyond the 3 roadmap minimums to ~6 actions for practical utility
- Stripe deliberately read-heavy — agents reading payment/customer/invoice data is the primary use case
- Rate limit pass-through: Feelr doesn't retry on provider 429s, surfaces the Retry-After to the caller

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-oauth-connectors*
*Context gathered: 2026-02-06*
