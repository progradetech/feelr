# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** An AI agent can call any supported external API in one line with near-zero context overhead
**Current focus:** Phase 8 (Composable Actions) -- chain definition types and loader complete.

## Current Position

Phase: 8 of 10 (Composable Actions)
Plan: 1 of 7 in current phase
Status: In progress
Last activity: 2026-02-07 -- Completed 08-01-PLAN.md

Progress: [██████████████████████████████░░░░░░░░░░] ~85% (34/40 plans through Phase 8-01)

## Performance Metrics

**Velocity:**
- Total plans completed: 34
- Average duration: 3 min
- Total execution time: 108 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-edge-gateway-foundation | 3/3 | 14 min | 5 min |
| 02-auth-vault | 5/5 | 16 min | 3 min |
| 03-github-connector | 4/4 | 10 min | 3 min |
| 04-cli-core | 5/5 | 17 min | 3 min |

| 05-oauth-connectors | 6/6 | 20 min | 3 min |
| 06-dashboard | 5/5 | 18 min | 4 min |
| 07-production-hardening | 5/5 | 8 min | 2 min |
| 08-composable-actions | 1/7 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 07-02 (1 min), 07-03 (1 min), 07-04 (3 min), 07-05 (2 min), 08-01 (3 min)
- Trend: stable/fast

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
- [05-05]: Admin client pattern with Bearer token for /admin/* endpoints (separate from API key client)
- [05-05]: OnAuthExpired callback with single-retry in GatewayClient.doRequest
- [05-05]: LoadAdminToken reads admin_token from config file profile section
- [05-06]: Search flag takes precedence over positional args (--search wins if both provided)
- [05-06]: GetToolsSearch as separate method from GetTools for backward compat
- [06-01]: Usage recording is best-effort via waitUntil -- silently catches all D1 errors
- [06-01]: D1 table-not-found errors return empty arrays (graceful pre-migration state)
- [06-01]: strftime-based time bucketing in D1 SQL for hour/day/month windows
- [06-01]: Error responses (action handler throws) are NOT metered -- Phase 7 extends this
- [06-02]: Next.js 15.5 used (plan said 16 but 15.5 is latest stable)
- [06-02]: Manual project scaffold (not create-next-app) for CI reliability
- [06-02]: All pages use 'use client' directive for static export SPA compatibility
- [06-02]: Login validates token via /admin/keys before storing to localStorage
- [06-02]: localStorage key 'feelr_admin_token' with typeof window guards for SSG
- [06-03]: Custom modal dialogs (div-based) instead of shadcn Dialog -- dashboard has no shadcn dependency
- [06-03]: Type-to-confirm uses label if available, falls back to shortToken for unnamed keys
- [06-03]: Key reveal appears inline at top of page (not in dialog) for maximum visibility
- [06-05]: HTML select elements for filter dropdowns (no shadcn dependency needed)
- [06-05]: Static connector list in useAvailableConnectors (no fetch, connectors are known)
- [06-05]: Separate SWR key admin-keys-for-filter to avoid collision with keys page hook
- [06-04]: Dynamic import for Recharts SparklineChart (ssr:false) required for static export compatibility
- [06-04]: 2-state connector status (connected/not_connected) in Phase 6; needs_reauth requires gateway auth_state
- [06-04]: Hardcoded connector list of 4 known connectors (not discovered from gateway)
- [07-01]: New API keys default to 'free' tier; existing keys without tier backward-compat to 'free'
- [07-01]: RateLimitBinding interface declared locally in lib/types.ts (not from @cloudflare/workers-types)
- [07-01]: Worker restructured from re-export to explicit module object with fetch + scheduled
- [07-02]: 429 check before defer resp.Body.Close() with explicit close in retry path
- [07-02]: Missing Retry-After returns immediate error (no default wait)
- [07-02]: isRetry flag shared between 429 retry and auth-expired retry paths
- [07-03]: Conservative 60s Retry-After for per-key 429 (full window period, not remaining time)
- [07-03]: RateLimit-Remaining is approximate (limit-1) since Cloudflare binding only returns success boolean
- [07-03]: IP rate limiter omits Retry-After (pre-auth defense, less guidance for abusers)
- [07-04]: Error status code from FeelrError.status, fallback 500 for unknown errors
- [07-04]: 90-day retention cutoff via JS Date arithmetic (not SQLite datetime) for testability
- [07-04]: Rate limits endpoint returns per-key data (not aggregated) for dashboard granularity
- [07-05]: RateLimitInfo uses api_key_short, usage_1m, throttle_24h matching gateway /internal/rate-limits response
- [08-01]: go.yaml.in/yaml/v3 promoted from indirect to direct dependency for chain loader
- [08-01]: Param.Default is string type (coerced at runtime based on Type field)
- [08-01]: With values are strings supporting ${{ }} interpolation templates
- [08-01]: Forward reference detection parses steps.X tokens from if expressions

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Cloudflare Workers Paid plan ($5/mo) required -- free tier 10ms CPU limit insufficient for gateway
- [Research]: @cloudflare/vitest-pool-workers only supports Vitest 3.2.x (NOT 4.x) -- pin dependency (DONE in 01-01)
- [Research]: workerd self-hosting patterns are emerging, may need fallback plan for Phase 9
- [04-02]: Go 1.25.7 installed to ~/go-sdk/go/ (user-local) -- future agents need PATH=$HOME/go-sdk/go/bin:$PATH

## Session Continuity

Last session: 2026-02-07
Stopped at: Completed 08-01-PLAN.md
Resume file: None
