# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** An AI agent can call any supported external API in one line with near-zero context overhead
**Current focus:** Phase 5 in progress (OAuth Connectors). Slack, Stripe, Discord connectors complete (Plans 01-03). Gateway wired with all 4 connectors (Plan 04).

## Current Position

Phase: 5 of 10 (OAuth Connectors)
Plan: 4 of 6 in current phase
Status: In progress
Last activity: 2026-02-06 -- Completed 05-04-PLAN.md (Gateway Connector Wiring)

Progress: [█████████████████████] ~78%

## Performance Metrics

**Velocity:**
- Total plans completed: 21
- Average duration: 3 min
- Total execution time: 70 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-edge-gateway-foundation | 3/3 | 14 min | 5 min |
| 02-auth-vault | 5/5 | 16 min | 3 min |
| 03-github-connector | 4/4 | 10 min | 3 min |
| 04-cli-core | 5/5 | 17 min | 3 min |

| 05-oauth-connectors | 4/6 | 13 min | 3 min |

**Recent Trend:**
- Last 5 plans: 04-05 (4 min), 05-01 (3 min), 05-02 (3 min), 05-03 (3 min), 05-04 (4 min)
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Auth vault with DO token coordinator must be Phase 2 (cannot be retrofitted per research)
- [Roadmap]: GitHub connector first (PAT-based, validates pipeline before OAuth complexity)
- [Roadmap]: Connector SDK uses Web Standard APIs only (portability for self-hosting)
- [Roadmap]: 10-phase comprehensive structure derived from 38 requirements across 9 categories
- [01-01]: @hono/zod-openapi pinned to 0.19.x (not 1.x) for Zod 3 compatibility -- 1.x requires Zod 4 peer dep
- [01-01]: Using Zod 3 (z.object().strict()) throughout, not Zod 4 -- production stability concern
- [01-01]: Connector SDK exports raw TypeScript source (no build step) for monorepo internal consumption
- [01-02]: AppEnv type is gateway-internal, not exported to connector-sdk
- [01-02]: Request ID generated in API key middleware via crypto.randomUUID()
- [01-02]: app.all() for dispatch route -- RPC-style, method-agnostic
- [01-02]: System params (key, raw, cursor) filtered before forwarding to action handlers
- [01-02]: Param defaults applied from ActionDefinition when param is undefined
- [01-03]: @cloudflare/vitest-pool-workers added to gateway tsconfig types for cloudflare:test module resolution
- [02-01]: HKDF over PBKDF2 for key derivation (master secret is already high-entropy Worker Secret)
- [02-01]: Static HKDF salt hardcoded in code (not secret, provides domain separation)
- [02-01]: Purpose-based domain separation via HKDF info parameter
- [02-01]: Packed IV+ciphertext in single base64 string (no separate IV storage)
- [02-01]: SQLite-backed DO migration (new_sqlite_classes, not new_classes)
- [02-01]: Placeholder KV namespace ID (user creates real one with wrangler CLI)
- [02-02]: Admin routes at /admin, separate from /v1 API key scope
- [02-02]: Local validateAdmin function (admin-auth middleware deferred to Plan 04)
- [02-02]: Soft limit of 25 keys via KV list prefix count
- [02-02]: lastUsedAt via waitUntil for non-blocking background write
- [02-03]: TokenRow uses type alias with index signature for SqlStorageValue compatibility
- [02-03]: Refresh stub logs intent and resets to active (real OAuth refresh in Phase 3/5)
- [02-03]: deleteAlarm() on empty token set for clean alarm state
- [02-03]: 100ms delay scheduleRefresh for near-immediate proactive refresh on getCredential
- [02-04]: Reusable adminAuthMiddleware replaces local validateAdmin from Plan 02
- [02-04]: Non-fatal credential retrieval in dispatch (graceful degradation on error)
- [02-04]: KV-direct reads for dispatch latency (no DO round-trip in request path)
- [02-04]: Separate Hono instances for key routes and credential routes, both at /admin
- [02-04]: Local TokenCoordinatorRpc interface for structural typing without DO import
- [02-05]: DO stub RPC calls over runInDurableObject for test stability (avoids storage isolation conflicts)
- [02-05]: miniflare bindings for Worker Secrets in test (vitest.config.ts, not wrangler.toml)
- [02-05]: ProvidedEnv type augmentation via env.d.ts for cloudflare:test type safety
- [03-01]: cursor passed via dedicated ActionContext field (not left in actionParams)
- [04-02]: viper.New() instances (not global singleton) for test isolation
- [04-02]: X-Feelr-Key header for gateway auth (matches middleware)
- [04-02]: cursor as URL query param (not body field) matching gateway convention
- [04-02]: JSON unwrapped data default, full envelope with --verbose
- [04-02]: All data to stdout, all errors to stderr (stream separation)
- [04-03]: Unified CLIError type from client package (removed duplicate in main.go)
- [04-03]: NOT_FOUND error code mapped to exit code 3 in client.doRequest
- [04-03]: Key=value positional args for action params, flags only for system params
- [04-04]: parseToolsArg splits on first dot (connector="github", action="issues.list")
- [04-04]: 404 gateway errors mapped to exit code 3 via NOT_FOUND code detection
- [04-04]: --schema flag bypasses formatter for raw JSON output
- [04-04]: GetStatus accepts deep bool for ?deep=true query
- [04-05]: golang.org/x/term for terminal detection (standard library extension)
- [04-05]: TOML writing via string formatting (not Viper write, preserves comments)
- [04-05]: Config file 0600, directory 0700 (API key security)
- [04-05]: Cobra-native errors wrapped as CLIError exit code 4 in Execute()
- [04-05]: All prompts to stderr (stdout reserved for data)
- [05-01]: slackFetch checks json.ok field for error detection, not HTTP status (only 429 uses real HTTP status)
- [05-01]: search.messages uses page-based pagination (cursor carries page number), other Slack actions use cursor-based
- [05-01]: missing_scope error includes needed scope from json.needed field for actionable error detail
- [05-02]: Stripe uses Bearer token auth with API key (sk_*), not OAuth -- auth_type is api_key
- [05-02]: POST bodies form-encoded via URLSearchParams, not JSON (Stripe API requirement)
- [05-02]: Cursor pagination via starting_after param with last item ID (Stripe's native pattern)
- [05-03]: Discord uses Bot token prefix (not Bearer) in Authorization header
- [05-03]: auth_type is bearer_token since bot tokens are direct tokens like GitHub PATs
- [05-03]: 204 No Content responses handled for roles.assign, members.ban, members.kick
- [05-03]: members.list uses cursor pagination via last user_id (Discord's after param)
- [05-04]: Refresh adapter registry pattern for provider-specific token refresh (getRefreshAdapter)
- [05-04]: OAuth exchange only for Slack (Discord/Stripe return auth_type guidance via /oauth/config)
- [05-04]: Token rotation detection via expires_in field presence in Slack OAuth response

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Cloudflare Workers Paid plan ($5/mo) required -- free tier 10ms CPU limit insufficient for gateway
- [Research]: @cloudflare/vitest-pool-workers only supports Vitest 3.2.x (NOT 4.x) -- pin dependency (DONE in 01-01)
- [Research]: workerd self-hosting patterns are emerging, may need fallback plan for Phase 9
- [04-02]: Go 1.25.7 installed to ~/go-sdk/go/ (user-local) -- future agents need PATH=$HOME/go-sdk/go/bin:$PATH

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 05-04-PLAN.md (Gateway Connector Wiring)
Resume file: None
