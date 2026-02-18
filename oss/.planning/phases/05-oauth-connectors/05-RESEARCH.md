# Phase 5: OAuth Connectors - Research

**Researched:** 2026-02-06
**Domain:** OAuth 2.0 flows (Slack, Discord), API key auth (Stripe), CLI auth UX, connector implementation
**Confidence:** HIGH (verified against official docs and existing codebase patterns)

## Summary

Phase 5 adds three new connectors (Slack, Discord, Stripe) and extends the CLI with `feelr auth <provider>` for OAuth/token setup. The existing codebase has a well-established connector pattern (GitHub connector), auth vault with DO token coordinator, and progressive tools discovery -- all of which are extended, not replaced.

Key insight: **Stripe does NOT use OAuth**. Stripe authenticates via API keys (`sk_live_*` / `sk_test_*`) passed as Bearer tokens. The `feelr auth stripe` command simply collects and stores the API key, identical to how GitHub PATs work today. Only Slack and Discord require actual OAuth 2.0 flows.

The OAuth flow architecture splits cleanly: the **CLI handles the browser dance** (localhost callback server, browser open, code capture) and then **POSTs the token to the gateway's admin API** for encrypted storage. The gateway never participates in OAuth redirects -- it only stores and uses credentials. This keeps the gateway stateless and avoids exposing OAuth client secrets on the edge.

**Primary recommendation:** Build three connector packages following the GitHub connector pattern exactly, implement the CLI `auth` command with Go's localhost HTTP server pattern for OAuth callback, and implement the real token refresh logic in the DO token coordinator (replacing the Phase 2 stub).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Dual auth paths: browser OAuth for interactive use + `--token` flag / env var for agents and CI
- `feelr auth <provider>` prints the auth URL to terminal AND tries to auto-open browser (fallback for headless/SSH environments)
- Callback uses local HTTP server (temporary localhost listener), falls back to manual code paste if port unavailable or headless detected
- When token expires and refresh token is also expired: if running interactively, auto-prompt "Token expired. Re-authenticate now? [Y/n]"; if non-interactive, fail with clear error message and instructions
- Slack connector: ~6 actions (send.message, channels.list, messages.search, users.list, threads.reply, channels.setTopic)
- Stripe connector: Read-heavy ~8 actions (list+get for payments/customers/invoices, create for customers and invoices)
- Discord connector: ~6-8 actions covering messages, channels, roles, and moderation (Claude's discretion on exact selection)
- Agent discovery: Grouped by connector by default (same 3-level pattern as Phase 4) + `--search` flag for cross-connector action search
- `feelr tools` shows connectors, `feelr tools slack` shows Slack actions, `feelr tools --search message` finds across all connectors
- Provider rate limits (429): pass through to caller with provider's Retry-After header -- caller decides retry strategy
- All other error/edge case decisions are Claude's discretion

### Claude's Discretion
- Action naming convention across connectors (consistent entity.verb format vs per-provider natural names)
- Agent-optimized description format (what to include in 50-100 token descriptions)
- Schema depth in discovery (full param constraints vs names+types with detail on drill-down)
- Auth status display in tools discovery vs keeping it in `feelr status`
- Token expiry mid-request handling (auto-retry once vs fail immediately)
- Partial auth state granularity (multi-state vs binary per connector)
- Provider quirk abstraction level (fully abstracted vs transparent defaults with flags)
- Discord specific action selection (~6-8 actions covering messages, channels, roles, moderation)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already in Monorepo)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @feelr/connector-sdk | workspace:* | Connector types (ConnectorDefinition, ActionDefinition) | Established in Phase 1 |
| Hono | ^4.11.7 | Gateway HTTP framework | Established in Phase 1 |
| Cloudflare Workers KV + DO | N/A | Token storage + refresh coordination | Established in Phase 2 |
| Go + Cobra | v1.10.2 | CLI framework | Established in Phase 4 |
| Viper | v1.21.0 | CLI config (TOML + env vars) | Established in Phase 4 |

### New Dependencies Required
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| golang.org/x/oauth2 | latest | OAuth2 token exchange, refresh | CLI OAuth flows for Slack/Discord |
| github.com/pkg/browser | latest | Cross-platform browser open | CLI `auth` command browser launch |
| (none for connectors) | N/A | Connectors use only Web Standard APIs | @feelr/connector-sdk rule |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| golang.org/x/oauth2 | github.com/cli/oauth | cli/oauth is GitHub-specific; x/oauth2 is generic and supports any provider |
| github.com/pkg/browser | os/exec("open"/"xdg-open") | pkg/browser handles Linux/Mac/Windows, headless detection built-in |
| Hand-rolled localhost server | github.com/int128/oauth2cli | oauth2cli adds OIDC complexity we don't need; a simple net/http listener is 30 lines |

**Recommendation:** Use `golang.org/x/oauth2` for the token exchange logic and a hand-rolled localhost HTTP server (the pattern is well-established and trivial in Go). Use `github.com/pkg/browser` for cross-platform browser opening. Do NOT use `github.com/cli/oauth` -- it's GitHub-specific.

**Installation (Go):**
```bash
cd cli && go get golang.org/x/oauth2 github.com/pkg/browser
```

**New connector packages (TypeScript):**
```bash
# Three new connector packages, following the GitHub pattern exactly
# connectors/slack/package.json  -> @feelr/connector-slack
# connectors/discord/package.json -> @feelr/connector-discord
# connectors/stripe/package.json  -> @feelr/connector-stripe
# Each depends only on @feelr/connector-sdk (workspace:*)
```

## Architecture Patterns

### Recommended Project Structure
```
connectors/
  slack/
    src/
      index.ts              # SlackConnector definition
      slack-fetch.ts         # Shared Slack API helper (like github-fetch.ts)
      flatten.ts             # Response flattening
      actions/
        send-message.ts      # send.message
        channels-list.ts     # channels.list
        messages-search.ts   # messages.search
        users-list.ts        # users.list
        threads-reply.ts     # threads.reply
        channels-set-topic.ts # channels.setTopic
      __tests__/
  discord/
    src/
      index.ts              # DiscordConnector definition
      discord-fetch.ts       # Shared Discord API helper
      flatten.ts
      actions/
        messages-send.ts     # messages.send
        channels-list.ts     # channels.list
        members-list.ts      # members.list
        roles-list.ts        # roles.list
        roles-assign.ts      # roles.assign
        members-ban.ts       # members.ban
        members-kick.ts      # members.kick
      __tests__/
  stripe/
    src/
      index.ts              # StripeConnector definition
      stripe-fetch.ts        # Shared Stripe API helper
      flatten.ts
      actions/
        payments-list.ts     # payments.list
        payments-get.ts      # payments.get
        customers-list.ts    # customers.list
        customers-get.ts     # customers.get
        customers-create.ts  # customers.create
        invoices-list.ts     # invoices.list
        invoices-get.ts      # invoices.get
        invoices-create.ts   # invoices.create
      __tests__/

cli/
  cmd/
    auth.go                  # `feelr auth <provider>` command
  internal/
    auth/
      oauth.go               # OAuth2 flow (localhost server + browser)
      token.go               # Token/API key direct input
      providers.go            # Provider-specific OAuth configs (Slack, Discord)

apps/gateway/
  src/
    connectors/
      refresh-adapters.ts    # Provider-specific token refresh logic
    routes/
      tools.ts               # Extended with --search support
```

### Pattern 1: Connector Fetch Helper (Established)
**What:** Each connector has a shared `<provider>-fetch.ts` that centralizes auth headers, error mapping, rate limit extraction, and pagination parsing.
**When to use:** Every connector.
**Example:**
```typescript
// Source: Existing pattern from connectors/github/src/github-fetch.ts
export interface SlackFetchOptions {
  method: string              // Slack Web API method name
  params?: Record<string, string | undefined>
  body?: Record<string, unknown>
  credential: string          // Bot token (xoxb-*) or user token (xoxp-*)
  fetch: typeof globalThis.fetch
}

export interface SlackFetchResult<T = unknown> {
  data: T
  raw: unknown
}

export async function slackFetch<T = unknown>(
  options: SlackFetchOptions
): Promise<SlackFetchResult<T>> {
  const url = 'https://slack.com/api/' + options.method
  const response = await options.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.credential}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(options.body ?? options.params ?? {}),
  })
  const json = await response.json() as Record<string, unknown>

  // Slack returns 200 OK even on errors -- check `ok` field
  if (!json.ok) {
    // Map Slack error to FeelrError
    mapSlackError(json)
  }

  return { data: json as T, raw: json }
}
```

### Pattern 2: CLI OAuth Flow (New)
**What:** CLI starts a temporary localhost HTTP server, opens the browser to the provider's authorize URL, captures the callback code, exchanges for token, then stores via gateway admin API.
**When to use:** Slack and Discord auth.
**Example:**
```go
// Simplified pattern for CLI OAuth
func performOAuthFlow(provider ProviderConfig) (*oauth2.Token, error) {
    // 1. Find available port
    listener, err := net.Listen("tcp", "127.0.0.1:0")
    if err != nil {
        return nil, err
    }
    port := listener.Addr().(*net.TCPAddr).Port
    redirectURI := fmt.Sprintf("http://127.0.0.1:%d/callback", port)

    // 2. Build authorize URL
    conf := &oauth2.Config{
        ClientID:     provider.ClientID,
        ClientSecret: provider.ClientSecret,
        Scopes:       provider.Scopes,
        Endpoint:     provider.Endpoint,
        RedirectURL:  redirectURI,
    }
    state := generateState()
    authURL := conf.AuthCodeURL(state)

    // 3. Print URL + try to open browser
    fmt.Fprintf(os.Stderr, "Opening browser to authorize %s...\n", provider.Name)
    fmt.Fprintf(os.Stderr, "If browser doesn't open, visit:\n  %s\n", authURL)
    browser.OpenURL(authURL)

    // 4. Wait for callback (with timeout)
    codeCh := make(chan string, 1)
    srv := &http.Server{Handler: callbackHandler(state, codeCh)}
    go srv.Serve(listener)
    defer srv.Shutdown(context.Background())

    select {
    case code := <-codeCh:
        // 5. Exchange code for token
        token, err := conf.Exchange(context.Background(), code)
        return token, err
    case <-time.After(5 * time.Minute):
        return nil, fmt.Errorf("authorization timed out after 5 minutes")
    }
}
```

### Pattern 3: Manual Code Paste Fallback (New)
**What:** For headless/SSH environments where browser can't open and localhost listener can't receive callbacks.
**When to use:** When `!term.IsTerminal(os.Stdin)` or `--no-browser` flag.
**Example:**
```go
func manualCodeFlow(provider ProviderConfig) (*oauth2.Token, error) {
    // Use "urn:ietf:wg:oauth:2.0:oob" or provider-specific out-of-band URI
    conf := &oauth2.Config{
        ClientID:     provider.ClientID,
        ClientSecret: provider.ClientSecret,
        Scopes:       provider.Scopes,
        Endpoint:     provider.Endpoint,
        RedirectURL:  "urn:ietf:wg:oauth:2.0:oob",
    }
    authURL := conf.AuthCodeURL(generateState())

    fmt.Fprintf(os.Stderr, "Visit this URL to authorize:\n  %s\n\n", authURL)
    fmt.Fprint(os.Stderr, "Paste the authorization code here: ")

    reader := bufio.NewReader(os.Stdin)
    code, _ := reader.ReadString('\n')
    code = strings.TrimSpace(code)

    return conf.Exchange(context.Background(), code)
}
```

### Pattern 4: Token Storage via Gateway Admin API (Established)
**What:** After obtaining tokens, CLI stores them via `POST /admin/credentials/:connector`. The gateway encrypts and stores in KV, registers with DO for refresh.
**When to use:** After every successful auth flow.
**Example:**
```go
// Store token via gateway admin API
func storeToken(gwClient *client.GatewayClient, connector string, token *oauth2.Token) error {
    body := map[string]interface{}{
        "access_token":  token.AccessToken,
        "refresh_token": token.RefreshToken,
        "expires_at":    token.Expiry.UnixMilli(),
    }
    return gwClient.PostAdminCredential(connector, body)
}
```

### Pattern 5: Cross-Connector Search (New for CLI)
**What:** `--search` flag on `feelr tools` searches action names and descriptions across all connectors.
**When to use:** Gateway-side filtering via new `?search=` query param on `/v1/tools`.
**Example:**
```typescript
// Gateway: tools.ts search endpoint
tools.get('/', (c) => {
  const search = c.req.query('search')
  const connectors = listConnectors()

  if (search) {
    // Cross-connector action search
    const results = []
    const query = search.toLowerCase()
    for (const connector of connectors) {
      for (const action of Object.values(connector.actions)) {
        if (action.name.includes(query) || action.description.toLowerCase().includes(query)) {
          results.push({
            connector: connector.name,
            action: action.name,
            description: action.description,
          })
        }
      }
    }
    return c.json(wrapResponse({ data: results, meta: { ... } }))
  }
  // ... existing connector list logic
})
```

### Anti-Patterns to Avoid
- **Gateway as OAuth relay:** Do NOT route OAuth callbacks through the Cloudflare Worker. The CLI handles the entire OAuth dance locally and sends only the final token to the gateway.
- **Shared fetch helpers across connectors:** Each connector gets its own `<provider>-fetch.ts`. Do NOT try to create a generic fetch helper -- provider APIs differ too much (Slack returns 200 with `ok: false`, Discord uses standard HTTP status codes, Stripe uses form-encoded bodies).
- **OAuth client secrets in the CLI binary:** Store OAuth client IDs in the binary (they're public). Client secrets should be fetched from the gateway at auth time or use PKCE flow. For Feelr's architecture, the simplest approach is to have the gateway provide a `/admin/oauth/config/:provider` endpoint that returns the client ID and authorize URL.

## Discretionary Decisions (Claude's Recommendations)

### Action Naming Convention
**Recommendation: Consistent `entity.verb` format across all connectors.**

Use `entity.verb` consistently: `send.message` -> `messages.send`, `channels.list`, `members.ban`. This matches the established GitHub pattern (`issues.list`, `pulls.create`). The entity is always plural (matches REST resource naming), the verb is the operation.

Mapped action names:
- **Slack:** `messages.send`, `channels.list`, `messages.search`, `users.list`, `threads.reply`, `channels.setTopic`
- **Stripe:** `payments.list`, `payments.get`, `customers.list`, `customers.get`, `customers.create`, `invoices.list`, `invoices.get`, `invoices.create`
- **Discord:** `messages.send`, `channels.list`, `members.list`, `roles.list`, `roles.assign`, `members.ban`, `members.kick`

Note: The CONTEXT.md uses `send.message` for Slack. This research recommends `messages.send` for consistency with the established `issues.list` / `pulls.create` pattern, but the planner should use whichever the user prefers. The `entity.verb` pattern is more consistent with GitHub.

### Agent-Optimized Description Format
**Recommendation: 3-part structure -- What it does, what it accepts, what it returns.**

```
"Lists all public channels in a Slack workspace with pagination. Accepts optional 'cursor' for
pagination and 'limit' (default 200, max 1000). Returns array of {id, name, topic, purpose,
num_members, is_archived}."
```

This matches the GitHub connector's established description format (see `issues.list`).

### Schema Depth in Discovery
**Recommendation: Full param constraints in the existing tools schema endpoint.**

The current `/v1/tools/:connector/:action` already returns full `ParamDefinition[]` with types, required flags, defaults, and descriptions. Keep this -- it's already the right depth. No changes needed.

### Auth Status in Tools Discovery
**Recommendation: Keep auth status in `feelr status`, NOT in tools discovery.**

The tools discovery endpoint should remain auth-agnostic. Add auth_type to the connector listing (already present: `ConnectorDefinition.auth_type`). The `feelr status` command already shows per-connector health -- extend it with auth state (connected/expired/not_configured).

### Token Expiry Mid-Request Handling
**Recommendation: Fail immediately with `CREDENTIAL_EXPIRED` error (hint: 'auth').**

The DO token coordinator already does proactive refresh 5 minutes before expiry. If a token is still expired when a request arrives, proactive refresh has failed. Auto-retry adds complexity and latency. The error code `CREDENTIAL_EXPIRED` is already defined in the SDK. The CLI can detect `hint: 'auth'` and prompt re-authentication if interactive.

### Partial Auth State Granularity
**Recommendation: Three states per connector: `connected`, `expired`, `not_configured`.**

- `connected`: Credential exists in KV and is active
- `expired`: Credential exists but DO status is 'failed' (refresh exhausted retries)
- `not_configured`: No credential in KV

This maps cleanly to the existing DO `TokenState.status` field.

### Provider Quirk Abstraction
**Recommendation: Fully abstract within the fetch helper, expose via error detail.**

Each connector's `*-fetch.ts` handles all provider quirks internally. Upstream error details are passed through in the `detail` field of FeelrError. No provider-specific flags on the CLI.

### Discord Action Selection (~7 actions)
**Recommendation: 7 actions covering messages, channels, roles, and moderation.**

| Action | Discord API Endpoint | Permission Required |
|--------|---------------------|---------------------|
| messages.send | POST /channels/{id}/messages | Send Messages |
| channels.list | GET /guilds/{id}/channels | View Channels |
| members.list | GET /guilds/{id}/members | Server Members Intent |
| roles.list | GET /guilds/{id}/roles | (none, guild-level) |
| roles.assign | PUT /guilds/{id}/members/{id}/roles/{id} | Manage Roles |
| members.ban | PUT /guilds/{id}/bans/{id} | Ban Members |
| members.kick | DELETE /guilds/{id}/members/{id} | Kick Members |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth2 token exchange | Custom HTTP POST to token endpoint | golang.org/x/oauth2 Config.Exchange() | Handles PKCE, token parsing, error handling |
| Cross-platform browser open | os/exec with platform detection | github.com/pkg/browser | Handles Linux/Mac/Windows/WSL edge cases |
| Encrypted token storage | Custom encryption | Existing gateway admin API + AES-256-GCM crypto | Already built and tested in Phase 2 |
| Token refresh scheduling | Custom cron or interval timer | Existing DO token coordinator with alarms | Already built in Phase 2, just needs real refresh logic |
| Provider-specific API wrappers | Full SDK libraries (slack-go, discordgo, stripe-go) | Hand-rolled fetch helpers with FeelrError mapping | Connectors use only Web Standard APIs (SDK rule), no runtime deps |

**Key insight:** The existing auth vault (KV + DO) is designed exactly for this phase. The DO token coordinator already has proactive refresh with alarms, retry logic, and status tracking. Phase 5 just needs to: (1) implement the real `performRefresh` method, and (2) add provider-specific OAuth refresh adapters.

## Common Pitfalls

### Pitfall 1: Slack Returns 200 OK on Errors
**What goes wrong:** Slack's Web API always returns HTTP 200 -- errors are indicated by `"ok": false` in the JSON body.
**Why it happens:** Slack's API design predates REST conventions.
**How to avoid:** The `slackFetch` helper MUST check `json.ok` field, not HTTP status code. Only `429 Too Many Requests` uses an HTTP error status.
**Warning signs:** Tests passing but actions silently failing; error mapping not triggering.

### Pitfall 2: Slack Token Rotation is Opt-In and Irreversible
**What goes wrong:** If token rotation is enabled, access tokens expire in 12 hours. If NOT enabled, bot tokens never expire.
**Why it happens:** Token rotation is a per-app setting in Slack's configuration.
**How to avoid:** Document clearly: if the user's Slack app has token rotation enabled, Feelr handles refresh automatically. If not, tokens never expire and the DO coordinator simply stores them with `expiresAt: null`.
**Warning signs:** Refresh logic running on non-expiring tokens; storing unnecessary refresh metadata.

### Pitfall 3: Stripe Uses Form-Encoded Bodies, Not JSON
**What goes wrong:** Stripe API expects `application/x-www-form-urlencoded` request bodies, not JSON.
**Why it happens:** Stripe's API conventions differ from Slack/Discord/GitHub.
**How to avoid:** The `stripeFetch` helper must encode body as form data: `new URLSearchParams(params).toString()`.
**Warning signs:** 400 errors from Stripe about malformed requests.

### Pitfall 4: Discord Bot Auth vs User OAuth Are Different Flows
**What goes wrong:** Confusing Discord bot token auth (from Developer Portal) with Discord OAuth2 user auth.
**Why it happens:** Discord has two authentication paths -- bots use a bot token from the portal, while user integrations use OAuth2.
**How to avoid:** For Feelr's use case, use a **bot token** (from the Discord Developer Portal). The `feelr auth discord` command takes the bot token directly (like GitHub PATs), NOT an OAuth flow. Bots interact with the API using the bot token as `Authorization: Bot <token>`.
**Warning signs:** Trying to implement OAuth2 for Discord bot actions; getting "unauthorized" errors with OAuth user tokens for bot-only endpoints.

**IMPORTANT REVISION:** Discord bot actions (send messages, manage channels, roles, moderation) require a **bot token**, not an OAuth2 user token. OAuth2 in Discord is for user-facing apps (reading user profile, guild membership). For Feelr's agent use case, the bot token is the correct auth mechanism -- same as GitHub PAT. This simplifies Phase 5: only Slack needs a true OAuth flow.

### Pitfall 5: Slack search:read Scope Availability
**What goes wrong:** The `search.messages` API may have limited scope support with bot tokens.
**Why it happens:** Slack's search API historically required user tokens. The `search:read` scope exists but its behavior with bot tokens vs user tokens may differ.
**How to avoid:** Request `search:read` as a bot scope in the OAuth flow. Test that bot tokens can actually call `search.messages`. If bot tokens can't search, document that `messages.search` requires a user token (request via `user_scope` in OAuth flow).
**Warning signs:** "missing_scope" errors when calling search.messages with a bot token.

### Pitfall 6: Rate Limit Pass-Through Needs Header Forwarding
**What goes wrong:** The error handler wraps errors in FeelrError envelope but loses the `Retry-After` header from upstream.
**Why it happens:** Current error handler returns JSON body only, no custom headers.
**How to avoid:** When throwing `RATE_LIMITED` FeelrError, include the upstream `Retry-After` value. The error handler must set the `Retry-After` response header on 429 responses in addition to the JSON body.
**Warning signs:** Clients unable to respect rate limits because the header is missing from Feelr's 429 response.

### Pitfall 7: Slack 2025/2026 Rate Limit Changes for Non-Marketplace Apps
**What goes wrong:** Starting March 3, 2026, non-Marketplace Slack apps face severe rate limits on `conversations.history` and `conversations.replies` (1 req/min, max 15 objects).
**Why it happens:** Slack is restricting non-Marketplace distributed apps.
**How to avoid:** This primarily affects `conversations.history`/`conversations.replies` which are not in our action set. However, be aware and document. Our actions (`conversations.list`, `chat.postMessage`, `search.messages`, `users.list`) are on different tiers and not affected.
**Warning signs:** Unexpectedly slow responses or errors on history/replies endpoints.

## Provider-Specific Technical Details

### Slack OAuth 2.0 Flow
| Field | Value |
|-------|-------|
| Authorize URL | `https://slack.com/oauth/v2/authorize` |
| Token URL | `https://slack.com/api/oauth.v2.access` |
| Token exchange params | `client_id`, `client_secret`, `code`, `redirect_uri` |
| Token response | `access_token` (xoxb-*), `scope`, `team`, `authed_user` |
| Token rotation refresh | `oauth.v2.access` with `grant_type=refresh_token` |
| Token expiry (with rotation) | 12 hours (43,200 seconds) |
| Token expiry (without rotation) | Never |
| API base URL | `https://slack.com/api/` |
| Auth header | `Authorization: Bearer <token>` |
| Request format | JSON body (POST) |
| Error format | HTTP 200 with `{"ok": false, "error": "..."}` |
| Rate limits | Per-method tiers (1+, 20+, 50+, 100+/min); `chat.postMessage` special: 1 msg/sec/channel |
| Rate limit response | HTTP 429 with `Retry-After` header (seconds) |

**Required Bot Scopes:**
- `chat:write` -- send messages, reply to threads
- `channels:read` -- list public channels
- `search:read` -- search messages
- `users:read` -- list users
- `channels:write.topic` -- set channel topic (more specific than `channels:manage`)

### Discord Bot Token Auth
| Field | Value |
|-------|-------|
| Auth mechanism | Bot token from Developer Portal (NOT OAuth2) |
| Auth header | `Authorization: Bot <token>` |
| API base URL | `https://discord.com/api/v10` |
| Request format | JSON body |
| Error format | Standard HTTP status codes with JSON body |
| Token expiry | Never (bot tokens don't expire) |
| Rate limits | Per-route, `X-RateLimit-*` headers, global 50 req/sec |
| Rate limit response | HTTP 429 with `Retry-After` header (seconds) and `retry_after` JSON field |

**Required Bot Permissions (integer bitmask):**
- Send Messages (0x800)
- View Channels (0x400)
- Manage Roles (0x10000000)
- Kick Members (0x2)
- Ban Members (0x4)

### Stripe API Key Auth
| Field | Value |
|-------|-------|
| Auth mechanism | API secret key (`sk_live_*` / `sk_test_*`) |
| Auth header | `Authorization: Bearer <key>` |
| API base URL | `https://api.stripe.com/v1` |
| Request format | `application/x-www-form-urlencoded` (NOT JSON) |
| Response format | JSON |
| Token expiry | Never (API keys don't expire) |
| Rate limits | 100 ops/sec live mode, 25 ops/sec sandbox; per-endpoint limits vary |
| Rate limit response | HTTP 429 with `Stripe-Rate-Limited-Reason` header (no Retry-After) |

**Stripe Endpoints:**
| Action | Method | Endpoint |
|--------|--------|----------|
| payments.list | GET | /v1/payment_intents |
| payments.get | GET | /v1/payment_intents/:id |
| customers.list | GET | /v1/customers |
| customers.get | GET | /v1/customers/:id |
| customers.create | POST | /v1/customers |
| invoices.list | GET | /v1/invoices |
| invoices.get | GET | /v1/invoices/:id |
| invoices.create | POST | /v1/invoices |

## Code Examples

### Slack Fetch Helper with Error Mapping
```typescript
// Source: Verified against Slack API docs
const SLACK_API_BASE = 'https://slack.com/api/'

async function mapSlackError(json: Record<string, unknown>): never {
  const error = json.error as string

  switch (error) {
    case 'not_authed':
    case 'invalid_auth':
    case 'account_inactive':
    case 'token_revoked':
      throw new FeelrError('AUTH_INVALID', {
        message: 'Slack authentication failed',
        hint: 'auth',
        status: 401,
        detail: error,
      })
    case 'token_expired':
      throw new FeelrError('CREDENTIAL_EXPIRED', {
        message: 'Slack token expired. Re-authenticate with: feelr auth slack',
        hint: 'auth',
        status: 401,
        detail: error,
      })
    case 'channel_not_found':
    case 'user_not_found':
      throw new FeelrError('NOT_FOUND', {
        message: `Slack resource not found: ${error}`,
        hint: 'abort',
        status: 404,
        detail: error,
      })
    case 'ratelimited':
      throw new FeelrError('RATE_LIMITED', {
        message: 'Slack API rate limit exceeded',
        hint: 'retry',
        status: 429,
        detail: `Slack error: ${error}`,
      })
    default:
      throw new FeelrError('UPSTREAM_ERROR', {
        message: `Slack API error: ${error}`,
        hint: 'abort',
        status: 502,
        detail: error,
      })
  }
}
```

### Discord Fetch Helper with Rate Limit Headers
```typescript
// Source: Verified against Discord API docs
const DISCORD_API_BASE = 'https://discord.com/api/v10'

export interface DiscordFetchOptions {
  path: string         // e.g. "/guilds/{id}/channels"
  method?: string
  body?: Record<string, unknown>
  credential: string   // Bot token
  fetch: typeof globalThis.fetch
}

export async function discordFetch<T = unknown>(
  options: DiscordFetchOptions
): Promise<{ data: T; rateLimit: DiscordRateLimit }> {
  const url = `${DISCORD_API_BASE}${options.path}`
  const headers: Record<string, string> = {
    'Authorization': `Bot ${options.credential}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Feelr/1.0',
  }

  const response = await options.fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  const rateLimit: DiscordRateLimit = {
    remaining: Number(response.headers.get('x-ratelimit-remaining') ?? -1),
    limit: Number(response.headers.get('x-ratelimit-limit') ?? -1),
    resetAfter: Number(response.headers.get('x-ratelimit-reset-after') ?? 0),
  }

  if (!response.ok) {
    await mapDiscordError(response, rateLimit)
  }

  if (response.status === 204) return { data: {} as T, rateLimit }
  const data = await response.json() as T
  return { data, rateLimit }
}
```

### Stripe Fetch Helper with Form-Encoded Bodies
```typescript
// Source: Verified against Stripe API docs
const STRIPE_API_BASE = 'https://api.stripe.com/v1'

export async function stripeFetch<T = unknown>(
  options: StripeFetchOptions
): Promise<{ data: T }> {
  const url = `${STRIPE_API_BASE}${options.path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.credential}`,
    'User-Agent': 'Feelr/1.0',
  }

  let init: RequestInit
  if (options.method === 'POST' && options.body) {
    // Stripe uses form-encoded bodies, NOT JSON
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    init = {
      method: 'POST',
      headers,
      body: new URLSearchParams(
        Object.fromEntries(
          Object.entries(options.body).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
        )
      ).toString(),
    }
  } else {
    // GET requests: params as query string
    const queryUrl = new URL(url)
    if (options.params) {
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined) queryUrl.searchParams.set(k, v)
      }
    }
    init = { method: 'GET', headers }
  }

  const response = await options.fetch(url, init)
  if (!response.ok) await mapStripeError(response)
  const data = await response.json() as T
  return { data }
}
```

### Token Refresh Adapter Pattern
```typescript
// Source: Architecture design for DO token coordinator
// Replaces the Phase 2 stub in token-coordinator.ts

interface RefreshAdapter {
  /** Provider name this adapter handles */
  provider: string
  /** Perform token refresh, return new credentials */
  refresh(refreshToken: string, env: Env): Promise<{
    accessToken: string
    refreshToken: string
    expiresAt: number
  }>
}

const slackRefreshAdapter: RefreshAdapter = {
  provider: 'slack',
  async refresh(refreshToken, env) {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    })
    const json = await response.json() as Record<string, unknown>
    if (!json.ok) throw new Error(`Slack refresh failed: ${json.error}`)
    return {
      accessToken: json.access_token as string,
      refreshToken: json.refresh_token as string,
      expiresAt: Date.now() + ((json.expires_in as number) * 1000),
    }
  },
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Slack classic OAuth | Slack OAuth V2 (`/oauth/v2/authorize`) | 2020 | Must use V2 endpoints, not legacy |
| Slack non-expiring tokens | Token rotation (opt-in, 12hr expiry) | 2022 | Must handle both cases |
| Discord API v9 | Discord API v10 | 2022 | Use `discord.com/api/v10` base URL |
| Stripe `charges` API | Stripe Payment Intents API | 2019 | Use `/v1/payment_intents` not `/v1/charges` |
| Slack `channels.*` methods | Slack `conversations.*` methods | 2018 | Use `conversations.list` not `channels.list` |

**Deprecated/outdated:**
- Slack `channels.list` / `groups.list` / `im.list` / `mpim.list` -- replaced by `conversations.list` with `types` param
- Slack classic OAuth (`/oauth/authorize`) -- replaced by V2 (`/oauth/v2/authorize`)
- Stripe Charges API -- replaced by Payment Intents
- Discord API v6-v9 -- use v10

## Open Questions

1. **Slack search:read with bot tokens**
   - What we know: `search:read` scope exists; `search.messages` method exists. The official docs are ambiguous about bot token support for search.
   - What's unclear: Whether bot tokens can actually call `search.messages` or if a user token is required.
   - Recommendation: Attempt with bot token first. If it fails, either (a) require user_scope in the OAuth flow for search, or (b) document the limitation and suggest the user adds a user token.

2. **OAuth client secrets distribution**
   - What we know: The CLI needs OAuth client secrets for Slack token exchange. Client secrets should not be embedded in binaries.
   - What's unclear: Best approach for distributing client secrets to CLI.
   - Recommendation: The gateway should expose a pre-auth endpoint (e.g., `GET /admin/oauth/config/:provider`) that returns `{ client_id, authorize_url, scopes }`. The CLI uses this to build the auth URL. For token exchange, the CLI sends the authorization code to a gateway endpoint (e.g., `POST /admin/oauth/exchange/:provider`) which performs the exchange server-side. This keeps secrets on the gateway only.

3. **Slack token rotation opt-in status detection**
   - What we know: Token rotation is a per-app setting. With rotation ON, tokens expire in 12 hours. With rotation OFF, they never expire.
   - What's unclear: Whether we can detect at auth time if the app has rotation enabled.
   - Recommendation: Check the token response for `expires_in` field. If present, register with DO for refresh. If absent, store with `expiresAt: null` and `refreshToken: null`.

## Sources

### Primary (HIGH confidence)
- Existing codebase: connectors/github/src/* (connector pattern), apps/gateway/src/* (auth vault, tools, dispatch)
- [Slack OAuth V2 docs](https://docs.slack.dev/authentication/installing-with-oauth/) - OAuth flow
- [Slack token rotation](https://docs.slack.dev/authentication/using-token-rotation) - 12hr expiry, refresh
- [Slack rate limits](https://docs.slack.dev/apis/web-api/rate-limits/) - Per-method tiers
- [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage) - Scopes, threading
- [Discord OAuth2](https://discord.com/developers/docs/topics/oauth2) - Flow details
- [Discord Rate Limits](https://discord.com/developers/docs/topics/rate-limits) - Header format
- [Stripe Authentication](https://docs.stripe.com/api/authentication) - API key auth
- [Stripe Rate Limits](https://docs.stripe.com/rate-limits) - 100 ops/sec, 429 response

### Secondary (MEDIUM confidence)
- [Discord API endpoints gist](https://gist.github.com/hackermondev/5c928ca12b4f4e6320100b11f798c23b) - REST endpoints
- [Discord OAuth2 Flow gist](https://gist.github.com/Vap0r1ze/776b0f841ce01fc2b0801933b79960df) - Token exchange
- [github.com/cli/oauth](https://pkg.go.dev/github.com/cli/oauth) - Go OAuth pattern reference
- [Slack 2025 rate limit changes](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/) - Non-marketplace restrictions

### Tertiary (LOW confidence)
- Discord token expiry duration (7 days / 604800 seconds) -- from GitHub issues, not official docs
- Stripe per-endpoint rate limits (varies by endpoint) -- extracted from docs.stripe.com/rate-limits

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Established patterns from Phases 1-4, official API docs verified
- Architecture: HIGH - Follows existing connector pattern exactly, auth vault already built
- Provider APIs: HIGH for Slack and Stripe (official docs), MEDIUM for Discord (some endpoints from gists)
- Pitfalls: HIGH - Based on official docs and known API quirks
- CLI OAuth flow: HIGH - Well-established pattern, x/oauth2 is Go standard library

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days -- stable APIs, no breaking changes expected)
