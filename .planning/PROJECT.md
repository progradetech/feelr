# Feelr

## What This Is

Feelr is an agent-friendly API simplification layer — a hosted service + CLI that sits between complex real-world APIs and AI agents. It transforms bloated, poorly-documented APIs into minimal, predictable, CLI-native endpoints that agents can call with ~50 tokens of context instead of thousands. Open-source and self-hostable, with a managed cloud option at api.feelr.dev.

## Core Value

An AI agent can call any supported external API in one line with near-zero context overhead — no schema parsing, no auth gymnastics, no pagination wrangling.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Edge gateway on Cloudflare Workers + Hono that routes requests to connectors
- [ ] Connector SDK/template for building typed, self-contained API connectors in TypeScript
- [ ] Response flattening layer that normalizes any API response into flat, consistent JSON
- [ ] Standardized error format across all connectors
- [ ] GitHub connector (issues, PRs, repos — 8+ actions)
- [ ] Slack connector (send message, list channels, search)
- [ ] Stripe connector (list payments, customers, create invoice)
- [ ] Discord connector (send messages, manage channels/roles, moderate)
- [ ] Full auth system: API key generation, encrypted vault, OAuth flows, token refresh, team key sharing
- [ ] `feelr auth` one-time setup per connector
- [ ] Go CLI binary: `feelr run`, `feelr tools`, `feelr auth`, `feelr status`
- [ ] Auto-discovery via `feelr tools` with ~100 token agent-optimized descriptions
- [ ] Agent-friendly output modes (JSON, table, minimal)
- [ ] Next.js dashboard at feelr.dev: API key management, connected services, usage stats
- [ ] Stripe billing integration (toggleable — enabled for hosted cloud, disabled for self-hosted)
- [ ] Rate limiting and usage metering
- [ ] Composable actions: pre-built chains + user-defined custom chains with data passing and conditional logic
- [ ] Documentation site at feelr.dev/docs

### Out of Scope

- Python/Node SDKs — CLI + HTTP is sufficient for v1, SDKs deferred
- Mobile app or mobile-specific UI
- Notion connector — deferred to post-launch
- Vercel connector — deferred to post-launch
- Real-time streaming/websocket responses — flat JSON responses only
- MCP-compatible mode — potential future feature, not v1

## Context

- The agentic coding explosion (Claude Code, Codex CLI, Gemini CLI, Aider, Cline) means every developer running agents needs external API access
- MCP is powerful but heavy — server process management, JSON-RPC overhead, 2-5K tokens of tool schemas per server
- Feelr targets the "missing middle" between raw API calls (too complex) and MCP (too heavy)
- Primary audience: solo developers with agents, agent framework builders, AI-powered automation builders
- Brand: lobster/antennae metaphor — "feelers" that sense API capabilities. Lobster Red (#E85D3A), Antenna Purple (#8B5CF6)
- Deployment model: fully open-source and self-hostable (minus billing), plus managed cloud at api.feelr.dev with billing enabled
- Discord connector added to initial set (replacing Notion/Vercel from original strategy) — covers both notification and community management use cases

## Constraints

- **Tech stack (backend)**: Cloudflare Workers + Hono — zero cold starts, global edge, low cost
- **Tech stack (connectors)**: TypeScript / Bun — type-safe, self-contained modules
- **Tech stack (CLI)**: Go — single binary, no runtime deps, fast shell-out for agents
- **Tech stack (dashboard)**: Next.js on Vercel
- **Tech stack (billing)**: Stripe Billing with metered subscriptions
- **Infrastructure budget**: MVP target $10-30/month
- **Launch target**: Launchable quality — could post on HN/Reddit with confidence
- **Open-source**: Full stack is open-source; billing is a toggleable feature for cloud-hosted only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Go for CLI (not Rust/Node) | Fast to write, single binary, great CLI ecosystem (cobra), no runtime deps | — Pending |
| Discord over Notion/Vercel for initial connectors | User preference — covers notification + community management use cases | — Pending |
| Open-source with hosted cloud model | Drives adoption via self-hosting, monetize via managed service | — Pending |
| Full composable actions in v1 | User-defined + pre-built chains with data passing and conditional logic | — Pending |
| Billing as toggleable feature | Keeps open-source clean, only enabled for hosted cloud | — Pending |

---
*Last updated: 2026-02-05 after initialization*
