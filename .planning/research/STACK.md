# Stack Research

**Domain:** API Simplification Layer / Agent-Friendly API Gateway
**Researched:** 2026-02-05
**Confidence:** HIGH (core stack pre-selected and validated; supporting libraries verified via official sources)

## Validation of Pre-Selected Stack

The user pre-selected five core technologies. All five are validated as strong choices for this domain.

| Pre-Selected | Verdict | Rationale |
|-------------|---------|-----------|
| Cloudflare Workers + Hono | VALIDATED | Zero cold starts, global edge, Hono is Cloudflare's own choice for internal APIs (D1, KV, Queues all use Hono internally). Sub-12kB framework with batteries-included middleware. |
| TypeScript / Bun | VALIDATED | Bun runs TS natively with zero transpilation config. Built-in test runner, bundler, and package manager. Fastest JS runtime for connector development. |
| Go for CLI | VALIDATED | Single binary, zero runtime deps, cross-compiles to every platform. The standard choice for CLI tools (Docker, Kubernetes, GitHub CLI all use Go + Cobra). |
| Next.js for Dashboard | VALIDATED | Next.js 16 with Turbopack (now default), React 19, and Cache Components. Vercel deployment is trivial. shadcn/ui ecosystem is mature for dashboards. |
| Stripe for Billing | VALIDATED | Native Cloudflare Workers SDK support (uses Web Fetch + Web Crypto instead of Node.js deps). Usage-based billing via meterEvent API. |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Hono | ^4.11.7 | Edge API framework | Ultrafast (<12kB), zero deps, built-in JWT/CORS/Bearer auth middleware. Cloudflare uses Hono internally for D1, KV, and Queues APIs. Security patches current as of Jan 2026 (CVE-2026-24473 fixed). | HIGH |
| Cloudflare Workers | wrangler ^4.61.1 | Edge compute runtime | Zero cold starts, 200+ PoPs globally, $5/mo paid plan includes 10M requests. Web Crypto API built-in for encryption. Native bindings to KV, D1, Durable Objects, Queues. | HIGH |
| Cloudflare D1 | N/A (platform) | Primary database (SQLite) | 5GB free tier, 25B reads/mo on paid. SQL via SQLite dialect. Perfect for API metadata, connector configs, usage tracking. 10GB max per database. | HIGH |
| Cloudflare KV | N/A (platform) | Key-value cache & config | Session data, API key lookups, cached connector responses. 1 write/sec per key limit -- suitable for config, not high-write. 10M reads/mo on paid plan. | HIGH |
| Cloudflare Durable Objects | N/A (platform) | Rate limiting state & coordination | SQLite-backed storage (recommended for new DOs). Single-threaded per-object for rate limit counters, OAuth token state, composable action coordination. Billing started Jan 2026. | HIGH |
| Bun | ^1.3.x | Connector development runtime | Native TypeScript execution, built-in test runner (`bun test`), fastest package installs. Bun.SQL for local dev database access. Use for local connector development and testing only -- connectors deploy to Workers. | HIGH |
| Go | ^1.22 | CLI binary | Single binary output, excellent cross-compilation, goroutines for concurrent API calls. Standard for modern CLIs. | HIGH |
| Next.js | ^16.1 | Dashboard web app | React 19, Turbopack (now default bundler), Cache Components for explicit caching, incremental prefetching. Deploy to Vercel free tier. | HIGH |
| Stripe SDK | ^20.3.0 | Billing & subscriptions | Native Workers support (no Node.js deps). Usage-based billing via meterEvent. Webhook support for subscription lifecycle. | HIGH |

### Database & Storage Layer

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Drizzle ORM | ^0.45.1 | TypeScript ORM for D1 | Type-safe SQL, first-class D1 support, migration generation via drizzle-kit. Works with both D1 HTTP API (for drizzle-kit) and D1 binding (for Workers). Also supports Durable Objects SQLite storage. | HIGH |
| drizzle-kit | ^0.45.x | Migration tooling | Generates SQL migrations from TypeScript schema, supports D1 HTTP API for remote operations, introspection, and Drizzle Studio for data browsing. | HIGH |
| Cloudflare Secrets Store | N/A (platform) | Encrypted credential vault | Two-level key hierarchy (DEK + KEK), AES-256 encrypted. Account-level secrets with Worker-level binding permissions. Values never readable after creation -- even by CF employees. | HIGH |

### Authentication & Security

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| jose | ^6.1.3 | JWT signing/verification | Zero deps, tree-shakeable ESM, designed for Web-interoperable runtimes (Workers, Bun, Deno, browsers). WebCrypto-native. The standard for edge JWT operations. | HIGH |
| Web Crypto API | Built-in | Encryption for credential vault | Native to Workers runtime. AES-256-GCM for encrypting stored OAuth tokens and API keys. PBKDF2 for key derivation. No external library needed. | HIGH |
| Hono Bearer Auth | Built-in | API key authentication | Built into Hono, zero additional deps. Validates `Authorization: Bearer {token}` headers. Use for Feelr API key auth. | HIGH |
| Hono JWT Middleware | Built-in | JWT token validation | Built into Hono. Verifies JWT tokens and extracts claims. Use for dashboard session auth. | HIGH |
| Hono CORS | Built-in | Cross-origin requests | Built into Hono. Configure per-route. Essential for dashboard-to-API communication. | HIGH |
| golang.org/x/oauth2 | latest | OAuth2 client (Go CLI) | Official Go OAuth2 package. Automatic token refresh via TokenSource interface. RoundTrip auto-refreshes expired tokens. Supports all major OAuth providers. | HIGH |

### Validation & API Documentation

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Zod | ^4.3.5 | Runtime schema validation | TypeScript-first validation with static type inference. Zod 4 is latest stable (major rewrite from v3). Use for all API input validation and connector response validation. | HIGH |
| @hono/zod-validator | ^0.7.6 | Hono validation middleware | Validates json, query, header, param, cookie, form targets. Integrates with Hono's type system for end-to-end type safety. | HIGH |
| @hono/zod-openapi | ^1.2.0 | OpenAPI spec generation | Generates OpenAPI 3.1 docs from Zod schemas + Hono routes. Serves Swagger UI. Critical for agent discoverability -- agents need machine-readable API specs. | HIGH |

### Rate Limiting

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| @hono-rate-limiter/cloudflare | latest | Per-route rate limiting | Uses Workers KV or Durable Objects as backing store (required -- default memory store does not work in Workers). Supports keyGenerator for per-user/per-key limits. | MEDIUM |
| Cloudflare Rate Limiting API | N/A (platform) | Platform-level rate limits | Open beta. Native Workers binding. Simpler than middleware for basic rate limiting. Use as complement, not replacement, for @hono-rate-limiter. | MEDIUM |

### CLI (Go) Libraries

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| cobra | ^1.10.2 | CLI command framework | Used by Docker, K8s, GitHub CLI, Hugo, 173K+ projects. Subcommand structure, auto-generated help, shell completion. The undisputed standard for Go CLIs. | HIGH |
| viper | latest | Configuration management | Reads JSON, TOML, YAML, env vars. Pairs with Cobra. Use for `~/.feelr/config.yaml` and env-based configuration. | HIGH |
| lipgloss | v2 (charm.land) | Terminal styling | Style definitions for terminal output. Colorful, readable CLI output without ANSI escape code management. Recently moved to charm.land/lipgloss/v2. | MEDIUM |
| bubbletea | v2 (charm.land) | Interactive TUI (optional) | Elm-architecture TUI framework. Use only if interactive flows needed (OAuth browser flow, connector selection). Recently moved to charm.land/bubbletea/v2. | LOW |
| goreleaser | latest | Binary distribution | Automated cross-compilation, GitHub Releases, Homebrew taps, Linux packages, SBOMs. Standard for Go binary distribution. Updated Feb 4, 2026. | HIGH |
| testify | ^1.11.1 | Go test assertions | Assert, require, mock, suite packages. De facto standard for Go testing. Use assert for non-fatal, require for fatal checks. | HIGH |

### Dashboard (Next.js) Libraries

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Tailwind CSS | ^4.0 | Utility-first CSS | v4.0 released Jan 2025. 5x faster full builds, 100x faster incremental. Zero config, automatic content detection. CSS-native with @property and cascade layers. | HIGH |
| shadcn/ui | latest | Component library | Copy-paste components built on Radix UI + Tailwind. Dashboard starters available for Next.js 16. Not an npm dep -- components live in your codebase. | HIGH |
| @stripe/stripe-js | latest | Client-side Stripe | Stripe Elements for payment forms. Required for checkout flows in dashboard. | HIGH |
| @stripe/react-stripe-js | latest | React Stripe components | React wrappers for Stripe Elements. Use for subscription management in dashboard. | HIGH |
| Better Auth | latest | Dashboard authentication | Comprehensive auth framework for Next.js. Social sign-on, 2FA, team/org support. Type-safe. Alternative to NextAuth with better DX. Works with Cloudflare Workers via Service Bindings. | MEDIUM |

### Testing

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Vitest | ^4.0.18 | TypeScript test runner | Default test framework for Vite/Hono projects. Fast, ESM-native, Jest-compatible API. | HIGH |
| @cloudflare/vitest-pool-workers | ^0.9.2 | Workers test environment | Runs Vitest tests inside Workers runtime via workerd. Eliminates behavior mismatches between tests and production. Isolated per-test storage, mock outbound requests. Compatible with Vitest 2.0.x-3.2.x. | HIGH |
| Bun test runner | Built-in | Connector unit tests | Built into Bun runtime. Fast, Jest-compatible. Use for connector logic tests that don't need Workers bindings. | HIGH |
| Go testing + testify | ^1.11.1 | CLI tests | Standard Go testing with testify assertions. Cobra commands testable via Execute() with captured stdout. | HIGH |

### Infrastructure & DevOps

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Wrangler | ^4.61.1 | Workers CLI & dev server | Deploy, dev, tail logs, manage secrets, KV, D1, DOs. `wrangler dev` for local development with Miniflare. | HIGH |
| Cloudflare Queues | N/A (platform) | Async task processing | Now on free plan (10K ops/day). Use for webhook delivery, usage metering to Stripe, async connector operations. | MEDIUM |
| GitHub Actions | N/A | CI/CD | Standard. Use for: Workers deploy via wrangler, Go binary release via goreleaser, Next.js deploy via Vercel CLI. | HIGH |
| Vercel | Free tier | Dashboard hosting | Free tier: 100GB bandwidth, serverless functions. Automatic Next.js deployments. Custom domains. | HIGH |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Edge Framework | Hono | Itty Router | Hono has richer middleware ecosystem (JWT, CORS, OpenAPI), better TypeScript DX, Cloudflare internal usage. Itty is smaller but less batteries-included. |
| Edge Framework | Hono | Express (via CF adapter) | Express not designed for edge. Larger bundle, slower cold starts, no native Workers integration. |
| Database | D1 (SQLite) | Planetscale / Neon | D1 is free, colocated with Workers (no network hop), SQLite is simpler for this use case. External DBs add latency and cost. |
| ORM | Drizzle | Prisma | Prisma has poor Workers support (query engine binary), slower, larger bundle. Drizzle is SQL-first and Workers-native. |
| Validation | Zod | TypeBox / Valibot | Zod has the largest ecosystem (Hono integration, OpenAPI generation). Zod 4 addresses previous performance concerns. TypeBox is faster but less ecosystem. |
| JWT | jose | jsonwebtoken | jsonwebtoken requires Node.js crypto. jose uses WebCrypto natively -- works in Workers without polyfills. |
| CLI Framework | Cobra | urfave/cli | Cobra has 10x adoption, better docs, subcommand model matches Feelr's needs (feelr connect, feelr run, etc). |
| Dashboard Auth | Better Auth | NextAuth.js / Auth.js | Better Auth has superior TypeScript DX, simpler setup, built-in team/org support. Auth.js v5 had rocky migration. |
| Dashboard Components | shadcn/ui | Chakra UI / MUI | shadcn gives you the source code (not a dep). Tailwind-native, tree-shakeable, customizable. MUI is heavy. |
| Test Runner (TS) | Vitest | Jest | Vitest is faster (ESM native), has official Cloudflare Workers pool, better DX. Jest requires more config for ESM/TS. |
| Go Tests | testify | gomock | testify is simpler (assert/require), gomock is for complex mocking. Use testify assert for most tests. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Prisma on Workers | Query engine binary doesn't work in Workers runtime. Accelerate proxy adds latency and cost. | Drizzle ORM |
| jsonwebtoken npm package | Requires Node.js crypto module, not available in Workers runtime | jose (WebCrypto native) |
| Express / Fastify | Not designed for edge runtimes. Large bundles, slow cold starts on Workers. | Hono |
| CryptoJS | Outdated, uses legacy crypto patterns. Workers have native Web Crypto API. | Web Crypto API (built-in) |
| Miniflare v2 (standalone) | Deprecated. Replaced by @cloudflare/vitest-pool-workers which uses workerd directly. | Vitest + vitest-pool-workers |
| node-fetch | Workers have native fetch. node-fetch adds unnecessary dep and compatibility issues. | Native fetch (built-in) |
| dotenv | Workers use wrangler secrets and env bindings. Bun reads .env natively. Go uses viper. No need for dotenv anywhere. | Platform-native env handling |
| Redis for rate limiting | External dependency, adds latency, costs money. Workers KV or Durable Objects handle this natively. | Durable Objects or Workers KV |
| MongoDB / DynamoDB | External database adds network latency from Workers edge. D1 is colocated. | Cloudflare D1 |
| Passport.js | Node.js-only authentication middleware. Heavy, callback-based. | Better Auth or Hono built-in middleware |

---

## Stack Patterns by Variant

**If self-hosted (non-Cloudflare):**
- Replace D1 with SQLite (same dialect, Drizzle works with both)
- Replace KV with Redis or in-memory cache
- Replace Workers with Node.js + Hono (Hono runs on Node.js too)
- Replace Durable Objects with Redis for rate limiting state
- Hono middleware (JWT, CORS, Bearer) works unchanged

**If open-source distribution:**
- Stripe billing must be toggleable (env flag)
- Better Auth must support self-hosted identity provider
- D1 migrations must work with plain SQLite
- CLI must work with configurable API base URL

**If adding more connectors rapidly:**
- Use @hono/zod-openapi for auto-documenting connector endpoints
- Connector SDK pattern: base class with typed methods, Zod schemas for I/O
- Bun for local connector development, Vitest for testing, wrangler for deploy

---

## Version Compatibility Matrix

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| hono ^4.11.7 | wrangler ^4.x | Hono is Cloudflare's recommended framework |
| drizzle-orm ^0.45.1 | D1 (binding + HTTP) | Use `drizzle(env.DB)` in Workers, HTTP API for migrations |
| @cloudflare/vitest-pool-workers ^0.9.2 | vitest 2.0.x - 3.2.x | Does NOT yet support Vitest 4.x (GitHub issue #11064 open) |
| vitest ^3.2.x (for Workers tests) | @cloudflare/vitest-pool-workers | Pin to 3.2.x until pool-workers supports v4 |
| vitest ^4.0.18 (for non-Workers tests) | Standard Vitest | Use for dashboard tests, connector unit tests without Workers bindings |
| zod ^4.3.5 | @hono/zod-validator ^0.7.6 | Zod 4 compatibility confirmed via honojs/middleware issue #1148 |
| next ^16.1 | react ^19, tailwindcss ^4.0 | Next.js 16 requires React 19 |
| stripe ^20.3.0 | Cloudflare Workers | Native Workers support via Web Fetch client |

**CRITICAL COMPATIBILITY NOTE:** `@cloudflare/vitest-pool-workers` does NOT support Vitest 4.x yet. For Workers integration tests, pin Vitest to ^3.2.x. You can use Vitest 4.x for non-Workers tests (dashboard, connector unit tests) in a separate test config.

---

## Installation

### Edge Gateway (Cloudflare Workers + Hono)

```bash
# Core
npm install hono@^4.11.7 drizzle-orm@^0.45.1 zod@^4.3.5 jose@^6.1.3 stripe@^20.3.0

# Hono middleware
npm install @hono/zod-validator@^0.7.6 @hono/zod-openapi@^1.2.0 @hono-rate-limiter/cloudflare

# Dev dependencies
npm install -D wrangler@^4.61.1 drizzle-kit@^0.45 typescript
npm install -D vitest@^3.2 @cloudflare/vitest-pool-workers@^0.9.2
```

### Dashboard (Next.js)

```bash
# Core
npx create-next-app@latest dashboard --typescript --tailwind --app

# Auth & Billing
npm install better-auth stripe @stripe/stripe-js @stripe/react-stripe-js

# UI (shadcn is not installed via npm -- use the CLI)
npx shadcn@latest init
npx shadcn@latest add button card table dialog input form toast

# Dev dependencies
npm install -D vitest@^4.0.18
```

### CLI (Go)

```bash
# Initialize module
go mod init github.com/andrewprograde/feelr-cli

# Core deps
go get github.com/spf13/cobra@v1.10.2
go get github.com/spf13/viper
go get golang.org/x/oauth2
go get github.com/stretchr/testify@v1.11.1

# Optional: TUI styling
go get charm.land/lipgloss/v2

# Build & release
go install github.com/goreleaser/goreleaser@latest
```

### Connector SDK (TypeScript / Bun)

```bash
# Initialize with Bun
bun init feelr-connectors

# Core deps (shared with gateway)
bun add zod@^4.3.5 hono@^4.11.7

# Dev
bun add -d typescript @types/bun
```

---

## Cloudflare Platform Budget Estimate

For $10-30/month MVP target:

| Service | Free Tier | Paid ($5/mo plan) | Est. MVP Usage | Est. Cost |
|---------|-----------|-------------------|----------------|-----------|
| Workers | 100K req/day | 10M req/mo | ~500K req/mo | $5 (base) |
| KV | 100K reads/day | 10M reads/mo | ~1M reads/mo | $0 (included) |
| D1 | 5M reads/day | 25B reads/mo | ~10M reads/mo | $0 (included) |
| Durable Objects | 100K req/day | 1M req/mo | ~200K req/mo | $0 (included) |
| Queues | 10K ops/day | 1M ops/mo | ~100K ops/mo | $0 (included) |
| **Total** | | | | **~$5/mo** |

The $5/mo Workers Paid plan includes generous allowances for all services. MVP usage will likely stay well within included limits, keeping total infrastructure cost at $5/mo for the edge gateway. Add Vercel free tier for dashboard = $5/mo total.

---

## Sources

### Official Documentation (HIGH confidence)
- [Hono Official Docs](https://hono.dev/docs/) -- framework docs, middleware reference
- [Hono GitHub Releases](https://github.com/honojs/hono/releases) -- v4.11.7 (Jan 27, 2025)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/) -- pricing, limits, bindings
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) -- detailed pricing verified
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/platform/limits/) -- 10GB limit, capabilities
- [Cloudflare Secrets Store](https://developers.cloudflare.com/secrets-store/) -- beta, AES-256 encryption
- [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) -- AES-GCM, PBKDF2
- [Cloudflare Vitest Integration](https://developers.cloudflare.com/workers/testing/vitest-integration/) -- testing setup
- [Cobra GitHub](https://github.com/spf13/cobra) -- v1.10.2 (Dec 2025)
- [jose GitHub](https://github.com/panva/jose) -- v6.1.3, WebCrypto native
- [Drizzle ORM D1 Docs](https://orm.drizzle.team/docs/connect-cloudflare-d1) -- D1 integration
- [Next.js 16 Blog](https://nextjs.org/blog/next-16) -- Turbopack, Cache Components, React 19
- [Stripe Cloudflare Blog](https://blog.cloudflare.com/announcing-stripe-support-in-workers/) -- native SDK support
- [Go oauth2 Package](https://pkg.go.dev/golang.org/x/oauth2) -- automatic token refresh
- [Testify GitHub Releases](https://github.com/stretchr/testify/releases) -- v1.11.1 (Aug 2024)

### Verified via Multiple Sources (MEDIUM confidence)
- [Better Auth](https://www.better-auth.com/) -- Next.js auth, team support, type-safe
- [@hono-rate-limiter/cloudflare](https://www.npmjs.com/package/@hono-rate-limiter/cloudflare) -- KV/DO-backed rate limiting
- [Goreleaser](https://goreleaser.com/) -- cross-compilation, updated Feb 4, 2026
- [Bubbletea v2](https://github.com/charmbracelet/bubbletea) -- moved to charm.land, updated Feb 5, 2026
- [Cloudflare workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider) -- OAuth provider on Workers
- [Hono Stripe Webhook Example](https://hono.dev/examples/stripe-webhook) -- verified pattern

### WebSearch Only (LOW confidence -- verify before implementing)
- @cloudflare/vitest-pool-workers Vitest 4.x support timeline -- check [Issue #11064](https://github.com/cloudflare/workers-sdk/issues/11064)
- Zod 4 full compatibility with @hono/zod-validator -- check [Issue #1148](https://github.com/honojs/middleware/issues/1148)
- Better Auth Cloudflare Workers integration via Service Bindings -- verify with official docs

---
*Stack research for: Feelr -- Agent-Friendly API Simplification Layer*
*Researched: 2026-02-05*
