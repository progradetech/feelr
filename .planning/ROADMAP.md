# Roadmap: Feelr

## Overview

Feelr delivers an agent-friendly API simplification layer in 10 phases, progressing from edge gateway foundation through auth, connectors, CLI, dashboard, production hardening, composable actions, self-hosting, and launch. The critical path runs through the auth vault (must be built before any connector) and the Connector SDK (defines the contract everything else depends on). Each phase delivers a coherent, independently verifiable capability -- from "curl returns flat JSON" in Phase 3 to "docker compose up brings up full self-hosted stack" in Phase 9.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Edge Gateway Foundation** - Hono gateway skeleton with routing, response envelope, error format, and Connector SDK types
- [x] **Phase 2: Auth Vault** - Encrypted credential storage with API key management, Durable Objects token coordinator, and auto-refresh
- [x] **Phase 3: GitHub Connector** - First end-to-end connector validating the entire gateway-to-response pipeline
- [x] **Phase 4: CLI Core** - Go binary providing run, tools, status, output modes, and shell completion for agent consumption
- [x] **Phase 5: OAuth Connectors** - Slack, Discord, and Stripe connectors with OAuth flows and agent-optimized discovery
- [x] **Phase 6: Dashboard** - Next.js web UI for API key management, connector status, and usage visualization
- [x] **Phase 7: Production Hardening** - Rate limiting per API key and usage metering with persistent storage
- [x] **Phase 8: Composable Actions** - Chain engine with pre-built workflows, custom chains, data passing, and conditionals
- [ ] **Phase 9: Self-Hosting** - Docker Compose deployment with workerd, feature parity via runtime abstraction
- [ ] **Phase 10: Launch Prep** - Stripe billing, documentation site, CLI distribution, and open-source packaging

## Phase Details

### Phase 1: Edge Gateway Foundation
**Goal**: A working Cloudflare Workers + Hono gateway that routes requests to connectors and returns normalized responses through a consistent envelope
**Depends on**: Nothing (first phase)
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, CONN-05, CONN-06
**Success Criteria** (what must be TRUE):
  1. A request to `/v1/:connector/:action` routes to the correct connector module and returns a response
  2. Every response from the gateway follows the `{ ok, data, error, meta }` envelope format, including error responses
  3. Error responses include a machine-parseable code, human-readable message, and agent-actionable hint (retry/auth/abort)
  4. Nested upstream API responses are flattened to essential fields with predictable key names
  5. A new connector can be created by implementing the `ConnectorDefinition` and `ActionDefinition` interfaces using only Web Standard APIs
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Monorepo scaffold + Connector SDK types
- [x] 01-02-PLAN.md -- Gateway core: Hono app, routing, middleware, mock connector
- [x] 01-03-PLAN.md -- Integration tests + connector template

### Phase 2: Auth Vault
**Goal**: Users can generate API keys and securely store encrypted credentials, with a Durable Objects coordinator ready for token refresh
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-04, AUTH-06
**Success Criteria** (what must be TRUE):
  1. User can generate, list, and revoke Feelr API keys via the gateway API
  2. All stored tokens are encrypted with AES-256-GCM via Web Crypto API before writing to KV
  3. Token refresh operations are serialized through a Durable Object per user, preventing race conditions across edge locations
  4. Tokens within 5 minutes of expiration are refreshed automatically without user action
**Plans**: 5 plans

Plans:
- [x] 02-01-PLAN.md -- Crypto foundation, auth types, wrangler KV/DO config, AppEnv update
- [x] 02-02-PLAN.md -- API key management (generate, list, revoke) + middleware upgrade
- [x] 02-03-PLAN.md -- Durable Object Token Coordinator with alarm-based proactive refresh
- [x] 02-04-PLAN.md -- Admin auth, encrypted credential storage, dispatch wiring
- [x] 02-05-PLAN.md -- Integration tests for keys, credentials, crypto, and DO coordinator

### Phase 3: GitHub Connector
**Goal**: A complete GitHub connector validates the full pipeline from authenticated request through flattened response
**Depends on**: Phase 2
**Requirements**: CONN-01, GATE-05
**Success Criteria** (what must be TRUE):
  1. User can perform at least 8 GitHub actions covering issues (list, create, update, close), PRs (list, create, merge), and repos (list)
  2. `curl api.feelr.dev/v1/github/issues.list -H "X-Feelr-Key: fk_xxx"` returns flat JSON in the standard envelope
  3. Health check at `/status` returns service health including GitHub API reachability
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md -- SDK cursor support + GitHub connector package scaffold + shared helpers (githubFetch, flatten)
- [x] 03-02-PLAN.md -- All 10 action handlers + ConnectorDefinition + gateway registration
- [x] 03-03-PLAN.md -- /status endpoint with shallow/deep health checks + rate limit info
- [x] 03-04-PLAN.md -- Unit tests (helpers, flatten, error mapping) + integration tests (dispatch, status)

### Phase 4: CLI Core
**Goal**: Agents and developers can interact with Feelr entirely through a single Go binary with progressive discovery and pipeline-friendly output
**Depends on**: Phase 3
**Requirements**: CLI-01, CLI-02, CLI-04, CLI-05, CLI-06, CLI-07
**Success Criteria** (what must be TRUE):
  1. `feelr run github issues.list --repo owner/repo` executes the action and returns JSON output
  2. `feelr tools` shows connectors, `feelr tools github` shows actions, `feelr tools github.issues.list` shows full schema (3-level progressive discovery)
  3. `feelr status` shows gateway health and connected connector status
  4. Output defaults to JSON; `--format minimal` and `--format table` produce alternative output for humans
  5. Shell completion works for bash, zsh, and fish; exit codes are 0 (success), 1 (error), 2 (auth required)
**Plans**: 5 plans

Plans:
- [x] 04-01-PLAN.md -- Gateway /v1/tools discovery endpoint (TypeScript)
- [x] 04-02-PLAN.md -- Go module scaffold + config + HTTP client + output formatters
- [x] 04-03-PLAN.md -- `run` command with key=value params, dry-run, output formatting
- [x] 04-04-PLAN.md -- `tools` progressive discovery + `status` health check commands
- [x] 04-05-PLAN.md -- `init` wizard + shell completion + exit code wiring

### Phase 5: OAuth Connectors
**Goal**: Users can connect OAuth-based services through browser or CLI, and agents can discover all available actions with minimal token overhead
**Depends on**: Phase 4
**Requirements**: CONN-02, CONN-03, CONN-04, AUTH-03, AUTH-05, CLI-03, GATE-06
**Success Criteria** (what must be TRUE):
  1. Slack connector supports send message, list channels, and search messages
  2. Stripe connector supports actions covering payments, customers, and invoices
  3. Discord connector supports at least 5 actions covering messages, channels, roles, and moderation
  4. `feelr auth slack` opens browser for OAuth, handles provider-specific quirks, stores encrypted tokens, and confirms success
  5. Every connector action has an agent-optimized description of 50-100 tokens accessible through the tools discovery endpoint
**Plans**: 6 plans

Plans:
- [x] 05-01-PLAN.md -- Slack connector package (slackFetch + flatten + 6 actions)
- [x] 05-02-PLAN.md -- Stripe connector package (stripeFetch + flatten + 8 actions)
- [x] 05-03-PLAN.md -- Discord connector package (discordFetch + flatten + 7 actions)
- [x] 05-04-PLAN.md -- Gateway wiring (register connectors, tools search, OAuth endpoints, token refresh)
- [x] 05-05-PLAN.md -- CLI auth command (OAuth flow + token input + admin client)
- [x] 05-06-PLAN.md -- CLI tools --search flag for cross-connector discovery

### Phase 6: Dashboard
**Goal**: Users can manage their Feelr account through a web interface without touching the CLI
**Depends on**: Phase 5
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. User can create, view, and revoke API keys from the web dashboard at feelr.dev
  2. Connected services view shows which connectors are authenticated with their status (connected / needs re-auth / expired)
  3. Usage stats display requests per key, per connector, and per time window (hour/day/month)
  4. Dashboard communicates exclusively through gateway `/internal/*` API routes -- no direct KV or D1 access
**Plans**: 5 plans

Plans:
- [x] 06-01-PLAN.md -- Gateway D1 usage recording + /internal/* aggregation routes
- [x] 06-02-PLAN.md -- Next.js 15.5 dashboard scaffold + auth + sidebar layout
- [x] 06-03-PLAN.md -- API keys page (create, one-time reveal, list, type-to-confirm revoke)
- [x] 06-04-PLAN.md -- Connectors status cards + Overview landing page with sparkline
- [x] 06-05-PLAN.md -- Usage visualization page with charts, filters, and time presets

### Phase 7: Production Hardening
**Goal**: The gateway enforces usage limits and tracks consumption for every API key
**Depends on**: Phase 6
**Requirements**: PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. Requests exceeding per-key rate limits receive 429 responses with a Retry-After header
  2. Usage data is stored in D1 and queryable per key, per connector, and per time window
  3. Rate limiting and metering do not add perceptible latency to normal requests
**Plans**: 5 plans

Plans:
- [x] 07-01-PLAN.md -- Rate limit types, tier field, wrangler config, Worker export restructure
- [x] 07-02-PLAN.md -- CLI 429 retry with Retry-After header
- [x] 07-03-PLAN.md -- Rate-limiter middleware + headers middleware + app wiring
- [x] 07-04-PLAN.md -- Error metering, rate_limit_events table, cron retention, internal endpoints
- [x] 07-05-PLAN.md -- Dashboard rate limit info display

### Phase 8: Composable Actions
**Goal**: Users can execute multi-step workflows as a single command, with pre-built chains for common patterns and custom chains for their own needs
**Depends on**: Phase 7
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05
**Success Criteria** (what must be TRUE):
  1. Pre-built chains ship with Feelr for common workflows (e.g., GitHub issue created then Slack notification sent)
  2. User can define custom action chains via YAML/JSON configuration with sequential steps
  3. Chain steps can pass output from step N to step N+1 input via JSONPath-style selectors
  4. Chains support one level of conditional logic (if/else based on step output)
  5. Complexity ceiling is enforced: max 10 steps, sequential only, no loops, global retry policy
**Plans**: 7 plans

Plans:
- [x] 08-01-PLAN.md -- Chain types, YAML/JSON loader, validation
- [x] 08-02-PLAN.md -- Selector/template interpolation engine (TDD)
- [x] 08-03-PLAN.md -- Condition evaluator + sequential chain executor
- [x] 08-04-PLAN.md -- CLI `chain` subcommand group (run, list, validate, show)
- [x] 08-05-PLAN.md -- Gateway server-side chain execution endpoint
- [x] 08-06-PLAN.md -- Pre-built chains (6 YAML files covering all connectors)
- [x] 08-07-PLAN.md -- Dry-run mode + built-in chain discovery

### Phase 9: Self-Hosting
**Goal**: Anyone can run the full Feelr stack locally or on their own infrastructure with a single command
**Depends on**: Phase 8
**Requirements**: SELF-01, SELF-02, SELF-03
**Success Criteria** (what must be TRUE):
  1. `docker compose up` brings up the complete Feelr stack (workerd gateway + SQLite + Next.js dashboard)
  2. Self-hosted version has feature parity with cloud except billing (billing disabled by default)
  3. Self-hosted and cloud use the same codebase with runtime differences abstracted behind interfaces
**Plans**: 7 plans

Plans:
- [ ] 09-01-PLAN.md -- Runtime abstraction interfaces + Cloudflare cloud adapters
- [ ] 09-02-PLAN.md -- Config system (feelr.yaml template, .env template, config loader)
- [ ] 09-03-PLAN.md -- Self-hosted adapters (KvStoreDO, UsageDbDO, InMemoryRateLimiter)
- [ ] 09-04-PLAN.md -- Gateway refactoring (AppEnv + all files to abstract interfaces)
- [ ] 09-05-PLAN.md -- Adapter factory, self-hosted entry point, workerd capnp config
- [ ] 09-06-PLAN.md -- Dockerfile, s6-overlay, docker-compose.yml, Caddy profile
- [ ] 09-07-PLAN.md -- Init script, README, end-to-end verification

### Phase 10: Launch Prep
**Goal**: Feelr is publicly launchable with documentation, distribution, billing, and open-source packaging
**Depends on**: Phase 9
**Requirements**: PLAT-01, PLAT-04, DIST-01, DIST-02, DIST-03
**Success Criteria** (what must be TRUE):
  1. Stripe billing with metered subscriptions enforces plan limits on cloud; billing is disabled when self-hosted
  2. Documentation site at feelr.dev/docs has quick-start guide, auth setup instructions, and per-connector action reference
  3. CLI is downloadable via GoReleaser binaries (linux/darwin/windows, amd64/arm64) on GitHub Releases
  4. Homebrew tap installs the CLI on macOS and Linux
  5. Repository includes LICENSE, CONTRIBUTING.md, README, and a connector template for contributors
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD
- [ ] 10-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Edge Gateway Foundation | 3/3 | Complete | 2026-02-05 |
| 2. Auth Vault | 5/5 | Complete | 2026-02-06 |
| 3. GitHub Connector | 4/4 | Complete | 2026-02-06 |
| 4. CLI Core | 5/5 | Complete | 2026-02-06 |
| 5. OAuth Connectors | 6/6 | Complete | 2026-02-06 |
| 6. Dashboard | 5/5 | Complete | 2026-02-07 |
| 7. Production Hardening | 5/5 | Complete | 2026-02-07 |
| 8. Composable Actions | 7/7 | Complete | 2026-02-07 |
| 9. Self-Hosting | 0/7 | Not started | - |
| 10. Launch Prep | 0/TBD | Not started | - |
