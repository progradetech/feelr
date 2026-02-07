# Requirements: Feelr

**Defined:** 2026-02-05
**Core Value:** An AI agent can call any supported external API in one line with near-zero context overhead

## v1 Requirements

Requirements for initial launchable release. Each maps to roadmap phases.

### Gateway & Core

- [x] **GATE-01**: Edge gateway on Cloudflare Workers + Hono routes requests to connectors based on URL pattern `/v1/:connector/:action`
- [x] **GATE-02**: Every response follows a consistent envelope format `{ ok, data, error, meta }` regardless of connector
- [x] **GATE-03**: Error responses include machine-parseable error code, human-readable message, and agent-actionable hint (retry, auth, abort)
- [x] **GATE-04**: Response flattening layer transforms nested upstream API responses into flat, predictable JSON with essential fields only
- [x] **GATE-05**: Health check endpoint at `/status` returns service health including upstream connector reachability
- [x] **GATE-06**: Each connector action has an agent-optimized description of ~50-100 tokens that enables accurate tool use

### Connectors

- [x] **CONN-01**: GitHub connector supports at least 8 actions covering issues (list, create, update, close), PRs (list, create, merge), and repos (list)
- [x] **CONN-02**: Slack connector supports at least 3 actions: send message, list channels, search messages
- [x] **CONN-03**: Stripe connector supports at least 3 actions covering payments, customers, and invoices
- [x] **CONN-04**: Discord connector supports at least 5 actions covering send messages, list/manage channels, manage roles, and basic moderation
- [x] **CONN-05**: Connector SDK defines a standard interface (`ConnectorDefinition`, `ActionDefinition`) that all connectors implement
- [x] **CONN-06**: Connector SDK uses only Web Standard APIs (fetch, Request, Response, crypto) — no Cloudflare-specific bindings in connector code

### Authentication & Security

- [x] **AUTH-01**: User can generate, list, and revoke Feelr API keys via API and CLI
- [x] **AUTH-02**: User API tokens are encrypted at rest with AES-256-GCM via Web Crypto API before storage in KV
- [x] **AUTH-03**: OAuth flows work for Slack and Discord with provider-specific adapters handling quirks
- [x] **AUTH-04**: Token refresh uses Durable Objects as single-writer coordinator to prevent race conditions in distributed edge
- [x] **AUTH-05**: `feelr auth <connector>` performs one-time setup that handles the OAuth dance, stores tokens, and confirms success
- [x] **AUTH-06**: Expired tokens are refreshed automatically (5-minute TTL buffer) without user intervention

### CLI

- [x] **CLI-01**: Go binary provides `feelr run <connector> <action>` to execute any connector action
- [x] **CLI-02**: `feelr tools` returns connector list; `feelr tools <connector>` returns action list; `feelr tools <connector>.<action>` returns full schema (progressive 3-level discovery)
- [x] **CLI-03**: `feelr auth <connector>` opens browser for OAuth setup with device code flow fallback for headless/SSH
- [x] **CLI-04**: `feelr status` shows service health and connected connector status
- [x] **CLI-05**: Output defaults to JSON; `--format` flag supports json, minimal, and table modes
- [x] **CLI-06**: Shell completion works for bash, zsh, and fish via `feelr completion`
- [x] **CLI-07**: CLI exit codes are meaningful (0 = success, 1 = error, 2 = auth required) for script consumption

### Dashboard

- [x] **DASH-01**: Web dashboard at feelr.dev provides API key creation, listing, and revocation
- [x] **DASH-02**: Connected services view shows which connectors are authenticated with status (connected / needs re-auth / expired)
- [x] **DASH-03**: Usage stats display requests per key, per connector, and per time window (hour/day/month)
- [x] **DASH-04**: Dashboard communicates only through gateway `/internal/*` API routes — never direct KV/D1 access

### Composable Actions

- [ ] **COMP-01**: Pre-built action chains ship with Feelr for common workflows (e.g., GitHub issue → Slack notification)
- [ ] **COMP-02**: User can create custom action chains via YAML/JSON configuration defining sequential steps
- [ ] **COMP-03**: Chain steps can pass data from step N output to step N+1 input via JSONPath-style selectors
- [ ] **COMP-04**: Chains support one level of conditional logic (if/else based on step output)
- [ ] **COMP-05**: Complexity ceiling enforced: max 10 steps, sequential only, no loops, global retry policy

### Billing & Platform

- [ ] **PLAT-01**: Stripe billing integration with metered subscriptions and plan enforcement, toggleable via config for self-hosted
- [ ] **PLAT-02**: Rate limiting per API key with 429 responses including Retry-After header
- [ ] **PLAT-03**: Usage metering tracks requests per key, per connector, per time window stored in D1
- [ ] **PLAT-04**: Documentation site at feelr.dev/docs with quick-start guide, auth setup, and per-connector action reference

### Self-Hosting

- [ ] **SELF-01**: Docker Compose deployment brings up full Feelr stack (workerd gateway + SQLite + Next.js dashboard) with single `docker compose up`
- [ ] **SELF-02**: Self-hosted version has feature parity with cloud except billing (billing disabled by default)
- [ ] **SELF-03**: Self-hosted uses same codebase as cloud — runtime differences abstracted behind interfaces

### Open Source & Distribution

- [ ] **DIST-01**: CLI distributed via GoReleaser with binaries for linux/darwin/windows amd64/arm64 on GitHub Releases
- [ ] **DIST-02**: Homebrew tap available for macOS/Linux CLI installation
- [ ] **DIST-03**: Repository includes LICENSE, CONTRIBUTING.md, README, and connector template for contributors

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### SDKs

- **SDK-01**: Python SDK auto-generated from OpenAPI spec
- **SDK-02**: Node.js SDK auto-generated from OpenAPI spec

### Advanced Auth

- **AAUTH-01**: Multi-tenant OAuth allowing SaaS apps to store per-end-user credentials through Feelr
- **AAUTH-02**: Team key sharing with scoped permissions and audit log

### Connectors (Expansion)

- **CONN-07**: Notion connector
- **CONN-08**: Vercel connector
- **CONN-09**: Linear connector
- **CONN-10**: Community connector SDK with contribution guidelines and review process

### Advanced Composable

- **COMP-06**: Parallel step execution within chains
- **COMP-07**: Nested conditional logic (multi-level if/else)
- **COMP-08**: Loop constructs with iteration limits

### Platform (Advanced)

- **PLAT-05**: MCP-to-Feelr bridge (thin adapter for MCP-compatible mode)
- **PLAT-06**: Webhook callbacks for async action completion notifications

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual chain builder / drag-and-drop UI | Enormous scope (Zapier spent years). Target audience is developers, not visual builders. |
| GraphQL API | REST + response flattening solves "too many fields" problem. Agents are better at calling REST than constructing GraphQL. |
| Real-time streaming / WebSocket responses | Most upstream APIs are request-response. Streaming adds persistent connection complexity. Use polling for long-running ops. |
| Mobile app | Web dashboard + CLI covers all use cases. Mobile is a separate product. |
| Automatic API schema detection / scraping | Unreliable, produces low-quality connectors. Hand-crafted connectors are Feelr's value. |
| Per-user OAuth on behalf of end-users (v1) | Massive auth complexity jump. v1 targets developers connecting their own accounts. |
| Connector marketplace with third-party submissions (v1) | Quality control burden. Curate official connectors tightly. Open contributions after standards established. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GATE-01 | Phase 1: Edge Gateway Foundation | Complete |
| GATE-02 | Phase 1: Edge Gateway Foundation | Complete |
| GATE-03 | Phase 1: Edge Gateway Foundation | Complete |
| GATE-04 | Phase 1: Edge Gateway Foundation | Complete |
| GATE-05 | Phase 3: GitHub Connector | Complete |
| GATE-06 | Phase 5: OAuth Connectors | Complete |
| CONN-01 | Phase 3: GitHub Connector | Complete |
| CONN-02 | Phase 5: OAuth Connectors | Complete |
| CONN-03 | Phase 5: OAuth Connectors | Complete |
| CONN-04 | Phase 5: OAuth Connectors | Complete |
| CONN-05 | Phase 1: Edge Gateway Foundation | Complete |
| CONN-06 | Phase 1: Edge Gateway Foundation | Complete |
| AUTH-01 | Phase 2: Auth Vault | Complete |
| AUTH-02 | Phase 2: Auth Vault | Complete |
| AUTH-03 | Phase 5: OAuth Connectors | Complete |
| AUTH-04 | Phase 2: Auth Vault | Complete |
| AUTH-05 | Phase 5: OAuth Connectors | Complete |
| AUTH-06 | Phase 2: Auth Vault | Complete |
| CLI-01 | Phase 4: CLI Core | Complete |
| CLI-02 | Phase 4: CLI Core | Complete |
| CLI-03 | Phase 5: OAuth Connectors | Complete |
| CLI-04 | Phase 4: CLI Core | Complete |
| CLI-05 | Phase 4: CLI Core | Complete |
| CLI-06 | Phase 4: CLI Core | Complete |
| CLI-07 | Phase 4: CLI Core | Complete |
| DASH-01 | Phase 6: Dashboard | Complete |
| DASH-02 | Phase 6: Dashboard | Complete |
| DASH-03 | Phase 6: Dashboard | Complete |
| DASH-04 | Phase 6: Dashboard | Complete |
| COMP-01 | Phase 8: Composable Actions | Pending |
| COMP-02 | Phase 8: Composable Actions | Pending |
| COMP-03 | Phase 8: Composable Actions | Pending |
| COMP-04 | Phase 8: Composable Actions | Pending |
| COMP-05 | Phase 8: Composable Actions | Pending |
| PLAT-01 | Phase 10: Launch Prep | Pending |
| PLAT-02 | Phase 7: Production Hardening | Pending |
| PLAT-03 | Phase 7: Production Hardening | Pending |
| PLAT-04 | Phase 10: Launch Prep | Pending |
| SELF-01 | Phase 9: Self-Hosting | Pending |
| SELF-02 | Phase 9: Self-Hosting | Pending |
| SELF-03 | Phase 9: Self-Hosting | Pending |
| DIST-01 | Phase 10: Launch Prep | Pending |
| DIST-02 | Phase 10: Launch Prep | Pending |
| DIST-03 | Phase 10: Launch Prep | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 after roadmap creation*
