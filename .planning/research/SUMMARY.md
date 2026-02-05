# Project Research Summary

**Project:** Feelr - Agent-Friendly API Simplification Layer
**Domain:** API Gateway + Developer Tools + Integration Platform
**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

Feelr is a hosted API simplification layer designed to address a critical problem in AI agent development: token overhead from bloated API schemas. Research confirms that existing solutions (MCP servers, Composio, Zapier) consume 500-20,000 tokens per tool catalog while Feelr targets ~50-100 tokens through aggressive flattening and progressive discovery. The technical approach is validated: Cloudflare Workers + Hono for edge compute, Go CLI for agent integration, and connector-based architecture for extensibility. However, success depends on avoiding seven critical pitfalls, particularly around OAuth token consistency in distributed edge environments.

The recommended architecture is a hub-and-spoke model with the Edge Gateway (Cloudflare Workers) as the single entry point, connectors as in-process modules (not microservices), and both CLI and Dashboard as thin clients. The stack is pre-selected and validated: all five core technologies (Cloudflare Workers, Hono, TypeScript/Bun, Go, Next.js) are appropriate for this domain. The main technical risk is OAuth token refresh race conditions in distributed edge computing, which requires Durable Objects as token coordinators from day one—this cannot be retrofitted later.

The research identifies a clear MVP scope (GitHub + Slack connectors, CLI, auth vault, response flattening) that can validate the core hypothesis without overbuilding. The key strategic insight: Feelr competes on token efficiency and developer experience, not connector quantity. Launch with 2-4 high-quality connectors rather than rushing to match Composio's 500+ integrations.

## Key Findings

### Recommended Stack

The pre-selected stack is validated across all five core technologies. Cloudflare Workers provides zero cold starts and global edge distribution; Hono is Cloudflare's own choice for internal APIs with sub-12kB footprint; Go's single-binary deployment is the standard for CLI tools (used by Docker, Kubernetes, GitHub CLI); Next.js 16 with Turbopack and React 19 is mature for dashboards; and Stripe has native Cloudflare Workers SDK support for usage-based billing.

**Core technologies:**
- **Cloudflare Workers + Hono**: Edge gateway with zero cold starts, 200+ global PoPs, native KV/D1/Durable Objects bindings. Hono provides JWT/CORS/Bearer auth middleware out of the box.
- **Go + Cobra**: CLI binary with single-file output, cross-compilation to all platforms, zero runtime dependencies. Cobra is the standard CLI framework (173K+ projects).
- **TypeScript/Bun + Drizzle ORM**: Connector development with native TS execution, type-safe D1 queries, first-class Cloudflare Workers integration.
- **Next.js 16 + shadcn/ui**: Dashboard with Turbopack, React 19, and copy-paste components. Deploys to Vercel free tier.
- **Cloudflare D1 + KV + Durable Objects**: D1 for metadata (relational, 10GB limit sufficient), KV for auth tokens (high-read, encrypted at rest + app-level AES-256-GCM), Durable Objects for rate limiting and token refresh coordination.

**Critical dependencies:**
- `jose` for JWT (WebCrypto-native, works in Workers without polyfills)
- `@hono/zod-openapi` for OpenAPI spec generation (critical for agent discoverability)
- `@cloudflare/vitest-pool-workers` for testing (runs tests in actual Workers runtime, currently supports Vitest 3.2.x only, NOT 4.x)

**What NOT to use:**
- Prisma (query engine binary incompatible with Workers runtime)
- jsonwebtoken (requires Node.js crypto, not available in Workers)
- Express/Fastify (not designed for edge runtimes)

### Expected Features

**Must have (table stakes):**
- **API key generation and management**: Users assume self-serve key provisioning exists. Missing this makes the product feel incomplete.
- **At least 2-3 working connectors at launch**: GitHub + Slack are the minimum viable pair for developer audiences. A single-connector API gateway has no network value.
- **Consistent response format**: Every connector must return the same envelope structure (`{ ok, data, meta }`) or the entire value proposition fails.
- **OAuth flow for external services**: One-time `feelr auth <connector>` that handles OAuth dance, stores tokens, and auto-refreshes. This is table stakes for any integration platform.
- **CLI that works in shell pipelines**: JSON output by default, `--format` flag for table/minimal, exit codes for scripts. If CLI output cannot be piped, the tool is broken for its primary use case.
- **Rate limiting + usage tracking**: Per-key limits with 429 responses. Dashboard shows usage against limits. Required foundation for eventual billing.

**Should have (competitive advantage):**
- **Ultra-low token overhead (~50-100 tokens per action)**: This is the core differentiator. MCP servers consume 500-1,000 tokens per tool and 10K-20K tokens across a server. Feelr's 10-100x improvement lets agents load the entire tool catalog in fewer tokens than a single MCP server.
- **Response flattening/normalization**: Strip nested objects to key fields. GitHub PR goes from 150+ fields to 10-15 essential fields. Must be configurable so power users can request raw responses.
- **Progressive tool discovery**: `feelr tools` (connector list) → `feelr tools github` (action list) → `feelr tools github.create-issue` (full schema). Three levels of detail; agent picks what it needs.
- **Self-hostable with open-source core**: All code open-source, Docker Compose for local deployment, billing toggleable. Differentiates from Composio/Nango (hosted-only) and Auth0 (significant self-hosting friction).
- **Encrypted credential vault with auto-refresh**: Vault stores encrypted OAuth tokens + refresh tokens, background refresh before expiration. Agents never see raw credentials.

**Defer (v2+):**
- **User-defined custom chains**: Requires a chain definition language (YAML/JSON), validation, error handling, conditional logic. Defer until pre-built chains prove the pattern works.
- **MCP-to-Feelr bridge**: Only if MCP becomes so dominant that users demand compatibility. Build as thin adapter, not native MCP support.
- **Multi-tenant OAuth (per-end-user auth)**: Enterprise feature for SaaS builders. Massive complexity increase.
- **Python/Node SDKs**: Auto-generate from OpenAPI spec only when usage data shows demand beyond CLI + HTTP.

### Architecture Approach

Feelr is a multi-runtime system with four deployment targets (Workers, Go binary, Next.js, Bun for dev) sharing code through a pnpm + Turborepo monorepo. The architecture follows a hub-and-spoke model: Edge Gateway is the central hub, connectors are in-process modules (NOT microservices), CLI and Dashboard are thin clients that communicate exclusively through the gateway API.

**Major components:**
1. **Edge Gateway (Cloudflare Workers + Hono)**: Single entry point for all traffic. Handles routing, API key validation, rate limiting, usage metering, response envelope. Connectors bundle within this Worker, not as separate services.
2. **Connector Registry**: Hosts all connector modules, dispatches actions, maps requests to upstream APIs. Each connector exports a standard interface (`ConnectorDefinition` with typed actions). One file per action for modularity.
3. **Transform Layer**: Response flattening, error normalization, pagination handling. In-process pipeline within the gateway. Ensures every response follows the same envelope format.
4. **Auth Vault**: Encrypted token storage in KV with Durable Objects as token refresh coordinators. Application-level AES-256-GCM encryption (defense in depth: KV encrypts at rest, app layer encrypts before write). Critical: DO prevents token refresh race conditions in distributed edge.
5. **Go CLI**: HTTP client that formats output for agents. No daemon process, no server management, zero config beyond auth credentials.
6. **Next.js Dashboard**: Key management, connector setup, usage visualization. Communicates ONLY through gateway `/internal/*` API routes, never directly to KV/D1.

**Critical architectural decisions:**
- **Connectors are in-process modules, not microservices**: Cloudflare Workers have 128MB memory and 30s CPU limits. Inter-service communication would add latency and complexity. Each connector is a TypeScript module imported by the gateway.
- **Durable Objects for token refresh coordination**: OAuth token refresh in distributed edge requires serialization. DO provides single-writer semantics per user, preventing race conditions where two edge locations simultaneously refresh and lose the valid token.
- **Application-level encryption before KV storage**: KV encrypts at rest, but anyone with Workers access can read KV. App-level AES-256-GCM means the encryption key secret must also be compromised.
- **Self-hosting via workerd (Cloudflare's open-source runtime)**: Same API surface as production Workers. Bug-for-bug compatible. Self-hosted = workerd + SQLite + Next.js standalone via Docker Compose.

### Critical Pitfalls

1. **Using Cloudflare KV for OAuth tokens without understanding consistency limits**: KV is eventually consistent with up to 60+ seconds propagation delay. Two concurrent requests from different edge locations can both detect an expired token, both refresh, and one overwrites the other's valid refresh token—causing token loss. **Prevention**: Use Durable Objects as token coordinators. All refreshes route through user's DO (single-writer semantics). Read from KV for speed, write through DO.

2. **OAuth provider quirks treated as standard deviations**: OAuth 2.0 is a framework, not a strict protocol. Slack rejects `http://localhost` redirects, uses separate `user_scopes` parameter. Discord has unique rate limiting on token endpoints. LinkedIn breaks if you include optional PKCE parameters. Notion uses JSON instead of form-encoded token requests. **Prevention**: Design connector auth as provider-specific adapters from day one. Each provider gets its own auth module. Build test harness that exercises full OAuth flow per provider.

3. **Cloudflare Workers free tier is unsuitable for an API gateway**: Free tier has 10ms CPU limit per request. For an API gateway that parses requests, decrypts credentials, constructs upstream calls, and transforms responses, 10ms is insufficient. Worker throws 1102 error and request fails silently. Paid tier has 5 minutes (30,000x increase). **Prevention**: Start development on Workers Paid plan ($5/mo). Monitor CPU time from day one. Design response handling to stream, not buffer.

4. **Response normalization that destroys information agents need**: Aggressively flattening JSON and stripping metadata can remove pagination cursors, rate limit info, error details, and semantic structure agents rely on. **Prevention**: Define normalization as "consistent envelope + predictable schema" not "fewer fields." Never flatten nested objects. Always include pagination metadata in standardized format. Preserve upstream error codes. Build "raw mode" escape hatch.

5. **Connector SDK tightly coupled to Cloudflare Workers runtime**: Embedding KV bindings, `fetch` with CF-specific options, or `ctx.waitUntil` in the connector interface means every connector is a Cloudflare Worker, not a portable module. Self-hosted breaks, community contributors cannot develop without CF account. **Prevention**: Define connector SDK using only Web Standard APIs (fetch, Request, Response, crypto). Abstract platform-specific operations behind interfaces. Test connectors with `vitest` without `wrangler`.

6. **OAuth token refresh race conditions in distributed edge**: Multiple concurrent requests for same user hit different edge locations. Both detect expired token, both refresh. Provider issues new refresh token with each refresh (Slack, Discord do this). Request 1 gets R1, Request 2 gets R2 (invalidating R1). Request 1 writes R1, Request 2 overwrites with R2. R1 is stored but R2 (the only valid one) is lost. All subsequent refreshes fail. **Prevention**: Durable Object per user as single point of serialization. Implement "refresh lock" pattern. Add 5-minute token TTL buffer. Cache refreshed tokens in isolate for 1-2 minutes.

7. **Composable actions becoming a Turing-complete workflow engine**: Feature requests accumulate (conditionals, loops, error handling per step, retry policies, parallel execution). Before long, you've built Temporal competitor inside a Worker with 5-minute CPU limit. Action DSL becomes harder to use than the APIs it simplifies. **Prevention**: Define strict complexity ceiling for v1: sequential steps only, one level of conditional logic, no loops, global retry policy, max 10 steps, max 1,000 subrequests. Document publicly: "Feelr is not a workflow engine."

## Implications for Roadmap

Based on research, suggested phase structure follows dependency chains and risk mitigation patterns. The architecture requires foundation-first building: Gateway + SDK + Auth Vault must be built before any connector can work. OAuth implementation cannot be retrofitted—the Durable Objects token coordinator pattern must be built from day one.

### Phase 1: Foundation (Gateway + Auth + First Connector)
**Rationale:** Everything depends on a working gateway that can authenticate users, decrypt credentials, route to connectors, and return normalized responses. Building one complete connector end-to-end validates the entire pipeline before scaling to multiple connectors.

**Delivers:**
- Edge Gateway skeleton (Hono app with route structure, typed env bindings)
- Connector SDK types (`ConnectorDefinition`, `ActionDefinition`, `ActionContext`)
- Auth Vault (AES-256-GCM encryption, KV storage, Durable Objects token coordinator)
- API key validation middleware (fk_xxx → user lookup)
- Response envelope (standardized `{ ok, data, meta }` wrapper)
- GitHub connector (8+ actions: issues, PRs, repos)
- Health check endpoint (`/status`, `feelr status`)

**Addresses:**
- Table stakes: API key management, consistent response format, encrypted credential storage, at least 1 connector
- Differentiator: Response flattening layer foundation

**Avoids:**
- Pitfall 1: Durable Objects token coordinator built from day one
- Pitfall 2: GitHub uses personal access tokens (simpler than OAuth), validates the connector pattern before tackling OAuth quirks
- Pitfall 3: Workers Paid plan configured in Phase 0
- Pitfall 4: Response envelope design prevents normalization data loss
- Pitfall 5: Connector SDK defined with Web Standard APIs only

**End state:** `curl api.feelr.dev/v1/github/issues.list -H "X-Feelr-Key: fk_test"` returns flat JSON.

### Phase 2: CLI + OAuth Connectors
**Rationale:** With a working gateway, the CLI becomes the primary agent interface. Adding Slack (OAuth-based) validates the auth vault's token refresh logic under real OAuth provider quirks. Stripe adds billing relevance.

**Delivers:**
- Go CLI binary (`feelr run`, `feelr tools`, `feelr auth`, `feelr status`)
- Progressive tool discovery endpoint (`/v1/tools`, `/v1/tools/:connector`, `/v1/tools/:connector/:action`)
- Agent output modes (--format json|minimal|table)
- Slack connector (3-5 actions: send message, list channels, search)
- Stripe connector (payment intents, subscriptions, usage metering)
- Discord connector (messages, channels, webhooks)
- OAuth flows (Slack, Discord) with browser-based auth

**Uses:**
- Go + Cobra for CLI framework
- OAuth2 package (golang.org/x/oauth2) for CLI auth flow
- Hono Bearer Auth middleware for API key validation
- Durable Objects for OAuth token refresh coordination

**Implements:**
- Connector Registry dispatch system
- Provider-specific OAuth adapters (Slack, Discord quirks handled)

**Addresses:**
- Table stakes: 2-3 connectors minimum (now have 4), OAuth flow, CLI pipelines
- Differentiator: Progressive discovery, ultra-low token overhead (~50-100 tokens per action via discovery)

**Avoids:**
- Pitfall 2: OAuth adapter system with provider-specific modules
- Pitfall 6: Durable Objects prevent token refresh race conditions

**End state:** `feelr run github issues.list --repo x/y` works from terminal. `feelr auth slack` opens browser, handles OAuth, stores encrypted tokens.

**Research flags:** Phase 2 likely needs targeted research for Slack/Discord OAuth quirks (provider-specific deviations from standard OAuth 2.0 flow).

### Phase 3: Dashboard + Visual Auth Flows
**Rationale:** CLI auth flow (open browser, poll for completion) requires a web UI to handle OAuth callbacks. Dashboard also provides self-serve key management and usage visualization.

**Delivers:**
- Internal API routes (`/internal/*` for dashboard-specific endpoints)
- Next.js Dashboard (key management, connector status, usage stats)
- OAuth callback handlers (GitHub App, Slack App, Discord App)
- Browser-based `feelr auth` flow (CLI opens browser, dashboard handles OAuth, CLI polls for completion)
- Connected services view (which connectors are authenticated, token status)

**Uses:**
- Next.js 16 + Turbopack + React 19
- shadcn/ui components for dashboard UI
- Better Auth for dashboard session management

**Implements:**
- OAuth authorization endpoint flows
- API key CRUD interface
- Usage metrics visualization

**Addresses:**
- Table stakes: OAuth flow completion (browser-based setup)
- UX improvement: Visual connector status, key management UI

**Avoids:**
- Anti-pattern 4 (dashboard tightly coupled to gateway): Dashboard communicates ONLY through `/internal/*` API routes, never direct KV/D1 access

**End state:** Full auth setup flow works. CLI opens browser, user connects GitHub/Slack/Discord, CLI confirms. Dashboard shows connected services, API keys, usage stats.

### Phase 4: Production Hardening
**Rationale:** Core features work but need production-grade reliability: rate limiting, usage metering, comprehensive error handling, agent-optimized docs.

**Delivers:**
- Rate limiting (Durable Objects or KV-based with TTL)
- Usage metering (D1 or Analytics Engine for per-key, per-connector, per-time-window tracking)
- Error normalization (comprehensive mapping from all upstream API errors)
- Agent-optimized descriptions (~100 tokens per connector, published via `/v1/tools` discovery)
- OpenAPI spec generation (via @hono/zod-openapi, serves Swagger UI)
- Monitoring + alerts (CPU time budget, rate limit thresholds, token refresh failures)

**Uses:**
- @hono-rate-limiter/cloudflare (backed by Durable Objects)
- Cloudflare Analytics Engine or D1 for usage metrics
- @hono/zod-openapi for machine-readable API specs

**Addresses:**
- Table stakes: Rate limiting, usage tracking, documentation with examples
- Differentiator: Agent-optimized tool descriptions (core of token overhead reduction)

**Avoids:**
- Performance trap: Durable Object per user for rate limiting prevents bottleneck (vs. single global DO)

**End state:** Production-ready gateway with rate limiting, comprehensive error handling, full OpenAPI spec for agent consumption, usage metrics in dashboard.

**Research flags:** Phase 4 may need targeted research for agent-optimized description patterns (how to minimize tokens while preserving semantic clarity).

### Phase 5: Composable Actions + Self-Hosting
**Rationale:** With stable connectors, pre-built chains deliver multi-step workflow value. Self-hosting package enables enterprise adoption.

**Delivers:**
- Composable Actions engine (chain definitions, step execution, data passing between steps)
- Pre-built chains (common workflows: "GitHub issue → Slack notification", "Stripe payment → Discord webhook")
- User-defined chains (CRUD for custom chains in D1, YAML/JSON definition format)
- Self-hosting package (Docker Compose with workerd + SQLite + Next.js standalone)
- Complexity ceiling enforcement (max 10 steps, sequential only, one level conditionals, no loops)

**Uses:**
- Durable Objects for chain execution coordination (long-running chains)
- Cloudflare Queues for async chain steps (optional, if chains exceed CPU limits)
- workerd for self-hosted runtime (same API surface as production Workers)

**Addresses:**
- Differentiator: Composable actions (pre-built chains reduce multi-call overhead to single call)
- Differentiator: Self-hostable open-source core

**Avoids:**
- Pitfall 7: Strict complexity ceiling prevents workflow engine creep (max 10 steps, sequential only, no loops)
- Anti-pattern 1: Connectors remain in-process modules even for composable actions (no microservices)

**End state:** `feelr run chain deploy-notify --repo x/y --channel general` executes multi-step workflow. Docker Compose brings up self-hosted Feelr with single `docker compose up`.

**Research flags:** Phase 5 may need research on workerd self-hosting patterns (relatively new, emerging best practices).

### Phase 6: Billing + Launch
**Rationale:** Metering exists from Phase 4, features complete from Phase 5. Final phase adds monetization and public launch prep.

**Delivers:**
- Stripe Billing integration (metered subscriptions via meterEvent API, plan enforcement)
- Documentation site (feelr.dev/docs: quick-start, auth setup, per-connector action reference)
- Open-source preparation (LICENSE, CONTRIBUTING.md, README, connector template for contributors)
- CLI distribution (GoReleaser config, GitHub Releases, Homebrew tap, checksums)

**Uses:**
- Stripe SDK for Workers (usage-based billing, webhook support)
- GoReleaser for automated cross-compilation and release
- GitHub Actions for CI/CD (gateway deploy, dashboard deploy, CLI release)

**Addresses:**
- Table stakes: Documentation with examples
- Monetization: Stripe billing for hosted cloud tier

**End state:** Public launch ready. Documentation live. CLI available via Homebrew. Billing enforcement active for cloud tier.

### Phase Ordering Rationale

- **Foundation-first (Phase 1)**: Auth Vault with Durable Objects token coordinator cannot be retrofitted. Must be built before any OAuth connector.
- **CLI early (Phase 2)**: CLI is the primary agent interface. Must exist before claiming "agent-friendly" positioning.
- **Dashboard later (Phase 3)**: Dashboard enhances UX but CLI + API already provide full functionality. Can delay without blocking core value.
- **Hardening before expansion (Phase 4 before Phase 5)**: Rate limiting and error handling must be stable before adding composable actions complexity.
- **Self-hosting with features (Phase 5)**: Self-hosted package needs complete feature set to be viable. Launching self-hosted without composable actions would disappoint users.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (OAuth Connectors)**: Slack/Discord OAuth quirks are well-documented in research but may need provider-specific API research during implementation.
- **Phase 4 (Agent-Optimized Descriptions)**: Token minimization patterns may need research on agent comprehension (testing how agents interpret ultra-concise descriptions).
- **Phase 5 (Self-Hosting)**: workerd self-hosting patterns are emerging; may need additional research on production deployment, migrations, health checks.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Gateway + Auth)**: Cloudflare Workers + Hono patterns are well-documented. Official docs are comprehensive.
- **Phase 3 (Dashboard)**: Next.js + shadcn/ui is mature and well-documented. OAuth callback handling is standard web dev.
- **Phase 6 (Billing + Docs)**: Stripe integration and documentation site are established patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All five core technologies validated via official docs. Cloudflare Workers + Hono is Cloudflare's own recommendation. Go + Cobra is the standard for CLI tools. Compatibility matrix verified (Vitest 3.2.x limitation noted). |
| Features | MEDIUM-HIGH | Table stakes validated via multiple competitor analyses (MCP, Composio, Nango). Token overhead differentiator confirmed by Anthropic's own engineering blog (134K token overhead in MCP setups). Anti-features identified through Zapier/Make workflow engine cautionary tales. |
| Architecture | HIGH | Hub-and-spoke model verified against official Cloudflare docs. Connector-as-module pattern confirmed via Hono/Workers constraints. Durable Objects for token coordination is the recommended pattern for strong consistency in distributed edge (official CF docs). |
| Pitfalls | HIGH | Seven critical pitfalls verified across official Cloudflare docs (KV consistency, Workers limits), Nango's OAuth research (50+ APIs analyzed), and community references. Durable Objects token coordinator pattern is the documented solution to edge race conditions. |

**Overall confidence:** HIGH

The research is grounded in official documentation (Cloudflare, Hono, Go, Next.js) and validated architectural patterns (API gateway, OAuth token management, CLI design). The main uncertainty is execution complexity (OAuth provider quirks, agent description optimization) rather than architectural viability.

### Gaps to Address

**Gap 1: Agent comprehension of ultra-concise descriptions**
- **Issue:** Token reduction from 500 to 50 per tool requires aggressive description minimization. Unclear how agents interpret minimal descriptions vs. verbose ones.
- **How to handle:** Phase 4 should include A/B testing with actual agents (Claude, GPT-4). Test 50-token vs. 100-token vs. 200-token descriptions for same action. Measure agent task success rate and error recovery.

**Gap 2: workerd self-hosting production maturity**
- **Issue:** workerd is Cloudflare's open-source runtime, but self-hosting patterns are emerging (not mature). Limited production deployment examples beyond Cloudflare's own infrastructure.
- **How to handle:** Phase 5 should budget extra time for workerd deployment testing. Consider fallback to Node.js + Hono for self-hosted if workerd proves unstable. Abstract runtime behind interfaces to enable swapping.

**Gap 3: Composable action complexity ceiling validation**
- **Issue:** Research recommends max 10 steps, sequential only, no loops. Unclear if this ceiling is too restrictive or too permissive until real usage data exists.
- **How to handle:** Phase 5 should ship with strict ceiling, then instrument which compositions hit limits. If 80% of compositions use <5 steps, ceiling is correct. If 80% hit 10-step limit, re-evaluate based on actual use cases (not speculation).

**Gap 4: Multi-tenant OAuth (deferred to v2+)**
- **Issue:** Research identifies multi-tenant OAuth (each SaaS end-user's credentials stored separately) as enterprise feature, but architectural decisions in Phase 1 may complicate later addition.
- **How to handle:** Phase 1 auth vault should use user-scoped encryption keys (not global key) to enable per-tenant isolation later. Document this as future-proofing. Actual multi-tenant auth is v2+ scope.

## Sources

### Primary (HIGH confidence)
- Cloudflare Workers Official Documentation (platform limits, storage options, KV consistency model, Web Crypto API, Durable Objects)
- Hono Official Documentation (middleware, routing, OpenAPI integration)
- Anthropic Engineering Blog: Code Execution with MCP (134K token overhead documented)
- MCP Token Bloat Issue (SEP-1576, official GitHub issue documenting token overhead problem)
- Go Cobra Framework (official source, 173K+ projects)
- Next.js 16 Release Blog (Turbopack, React 19, Cache Components)
- Stripe Cloudflare Workers SDK (official Cloudflare + Stripe joint announcement)
- OAuth 2.0 RFC 6749 (standard specification)

### Secondary (MEDIUM confidence)
- Nango OAuth Quirks Research (50+ API provider-specific deviations documented)
- Nango OAuth Token Refresh Concurrency Patterns (distributed token refresh race conditions)
- Auth0 Token Vault Documentation (credential vault architecture patterns)
- Composio Unified API Platform Analysis (feature landscape, competitor positioning)
- Speakeasy: Reducing MCP Token Usage by 100x (dynamic toolset benchmarks)
- Klavis AI: 4 MCP Design Patterns (progressive discovery as best practice)
- TypeScript Monorepo Setup: Sharing Types Between Workers and Next.js (verified pattern)
- API Gateway Architecture Deep Dive (industry reference, api7.ai)

### Tertiary (LOW confidence, needs validation)
- @cloudflare/vitest-pool-workers Vitest 4.x support timeline (GitHub issue #11064 open, no official timeline)
- Better Auth Cloudflare Workers integration via Service Bindings (verify with official docs during implementation)
- Cloudflare Rate Limiting API open beta status (verify current status, API may have changed)

---
*Research completed: 2026-02-05*
*Ready for roadmap: yes*
