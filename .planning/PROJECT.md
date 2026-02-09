# Feelr

## What This Is

Feelr is an agent-friendly API simplification layer — a hosted service + Go CLI + web dashboard that sits between complex real-world APIs and AI agents. It transforms bloated, poorly-documented APIs into minimal, predictable, CLI-native endpoints that agents can call with ~50 tokens of context instead of thousands. Open-source (MIT) and self-hostable via Docker Compose, with a managed cloud option at api.feelr.dev.

## Core Value

An AI agent can call any supported external API in one line with near-zero context overhead — no schema parsing, no auth gymnastics, no pagination wrangling.

## Current State

**Version:** v1.0 MVP (shipped 2026-02-09)
**Codebase:** ~18,600 LOC (12,585 TypeScript + 6,021 Go) across 401 files
**Tech stack:** Cloudflare Workers + Hono (gateway), Go + Cobra (CLI), Next.js 15.5 (dashboard), Stripe (billing), workerd (self-hosting)

Shipped capabilities:
- Edge gateway with 4 connectors (GitHub 10 actions, Slack 6, Stripe 8, Discord 7)
- Encrypted auth vault with Durable Objects token coordinator
- Go CLI with progressive discovery, 3 output modes, shell completion, composable chains
- Web dashboard for API keys, connector status, usage analytics
- Composable actions engine with 6 pre-built chains
- Self-hosting via Docker Compose with full feature parity (minus billing)
- Stripe billing, Nextra docs site, GoReleaser distribution

## Requirements

### Validated

- Edge gateway on Cloudflare Workers + Hono that routes requests to connectors — v1.0
- Connector SDK/template for building typed, self-contained API connectors in TypeScript — v1.0
- Response flattening layer that normalizes any API response into flat, consistent JSON — v1.0
- Standardized error format across all connectors — v1.0
- GitHub connector (issues, PRs, repos — 10 actions) — v1.0
- Slack connector (send message, list channels, search — 6 actions) — v1.0
- Stripe connector (payments, customers, invoices — 8 actions) — v1.0
- Discord connector (messages, channels, roles, moderation — 7 actions) — v1.0
- Full auth system: API key generation, encrypted vault, OAuth flows, token refresh — v1.0
- `feelr auth` one-time setup per connector — v1.0
- Go CLI binary: `feelr run`, `feelr tools`, `feelr auth`, `feelr status`, `feelr chain` — v1.0
- Auto-discovery via `feelr tools` with ~100 token agent-optimized descriptions — v1.0
- Agent-friendly output modes (JSON, table, minimal) — v1.0
- Next.js dashboard at feelr.dev: API key management, connected services, usage stats — v1.0
- Stripe billing integration (toggleable — enabled for hosted cloud, disabled for self-hosted) — v1.0
- Rate limiting and usage metering — v1.0
- Composable actions: pre-built chains + user-defined custom chains with data passing and conditional logic — v1.0
- Documentation site at feelr.dev/docs — v1.0
- Self-hosting via Docker Compose with feature parity — v1.0
- CLI distribution via GoReleaser + Homebrew — v1.0
- Open-source packaging (MIT license, CONTRIBUTING.md, connector template) — v1.0

### Active

(None yet — define for next milestone)

### Out of Scope

- Python/Node SDKs — CLI + HTTP is sufficient, SDKs deferred to post-launch based on demand
- Mobile app or mobile-specific UI — web dashboard + CLI covers all use cases
- Notion connector — deferred to post-launch
- Vercel connector — deferred to post-launch
- Real-time streaming/websocket responses — flat JSON responses only, use polling for long-running ops
- MCP-compatible mode — potential future feature, thin bridge adapter deferred to v2
- Team key sharing with scoped permissions — deferred to v2 (multi-tenant complexity)
- Visual chain builder / drag-and-drop UI — target audience is developers, not visual builders

## Context

- The agentic coding explosion (Claude Code, Codex CLI, Gemini CLI, Aider, Cline) means every developer running agents needs external API access
- MCP is powerful but heavy — server process management, JSON-RPC overhead, 2-5K tokens of tool schemas per server
- Feelr targets the "missing middle" between raw API calls (too complex) and MCP (too heavy)
- Primary audience: solo developers with agents, agent framework builders, AI-powered automation builders
- Brand: lobster/antennae metaphor — "feelers" that sense API capabilities. Lobster Red (#E85D3A), Antenna Purple (#8B5CF6)
- Deployment model: fully open-source and self-hostable (minus billing), plus managed cloud at api.feelr.dev with billing enabled
- Discord connector in initial set (replacing Notion/Vercel) — covers notification + community management use cases
- v1.0 shipped in 5 days (154 min execution time across 51 plans) — validates that the scope was achievable

## Constraints

- **Tech stack (backend)**: Cloudflare Workers + Hono — zero cold starts, global edge, low cost
- **Tech stack (connectors)**: TypeScript — type-safe, self-contained modules using Web Standard APIs only
- **Tech stack (CLI)**: Go + Cobra — single binary, no runtime deps, fast shell-out for agents
- **Tech stack (dashboard)**: Next.js 15.5 on Vercel (static export SPA)
- **Tech stack (billing)**: Stripe Billing with metered subscriptions
- **Tech stack (self-hosting)**: workerd + s6-overlay + SQLite in Docker
- **Infrastructure budget**: Cloud target $10-30/month (Workers Paid plan required at $5/mo)
- **Open-source**: Full stack is open-source (MIT); billing is a toggleable feature for cloud-hosted only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Go for CLI (not Rust/Node) | Fast to write, single binary, great CLI ecosystem (Cobra), no runtime deps | Good — 6,021 LOC Go, clean Cobra structure, 84 chain tests |
| Discord over Notion/Vercel for initial connectors | User preference — covers notification + community management use cases | Good — 7 Discord actions, rounds out connector coverage |
| Open-source with hosted cloud model | Drives adoption via self-hosting, monetize via managed service | Good — MIT license, Docker Compose self-hosting works |
| Full composable actions in v1 | User-defined + pre-built chains with data passing and conditional logic | Good — 6 pre-built chains, YAML/JSON custom chains, dry-run mode |
| Billing as toggleable feature | Keeps open-source clean, only enabled for hosted cloud | Good — single config flag disables billing for self-hosted |
| Connector SDK uses Web Standard APIs only | Portability between Cloudflare Workers and workerd self-hosting | Good — runtime abstraction layer works cleanly |
| Hub-and-spoke architecture (connectors as in-process modules) | Simpler than microservices, single deployment unit | Good — all 4 connectors register in gateway, shared auth |
| Durable Objects for token coordinator | Prevents OAuth refresh race conditions at the edge | Good — single-writer pattern, alarm-based proactive refresh |
| HKDF for key derivation (not PBKDF2) | Master secret is already high-entropy Worker Secret | Good — simpler, purpose-based domain separation via info param |
| workerd for self-hosting runtime | Same V8 isolate model as Cloudflare Workers | Acceptable — npm install pattern works, some complexity in config |

---
*Last updated: 2026-02-09 after v1.0 milestone*
