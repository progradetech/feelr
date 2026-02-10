# Feelr

## What This Is

Feelr is an agent-friendly API simplification layer — a hosted service + Go CLI + web dashboard that sits between complex real-world APIs and AI agents. It transforms bloated, poorly-documented APIs into minimal, predictable, CLI-native endpoints that agents can call with ~50 tokens of context instead of thousands. Open-source (MIT) and self-hostable via Docker Compose, with a managed cloud option at api.feelr.dev.

## Core Value

An AI agent can call any supported external API in one line with near-zero context overhead — no schema parsing, no auth gymnastics, no pagination wrangling.

## Current State

**Version:** v1.2.0 Marketing & Onboarding (in progress)
**Codebase:** ~19,600 LOC (13,580 TypeScript + 6,021 Go) across 400+ files
**Tech stack:** Cloudflare Workers + Hono (gateway), Go + Cobra (CLI), Next.js 15.5 (dashboard), Stripe (billing), workerd (self-hosting)

**Live services:**
- **api.feelr.dev** — Edge gateway on Cloudflare Workers (staging + production with isolated KV/D1/DO)
- **app.feelr.dev** — Dashboard on Azure Static Web Apps
- **feelr.dev** — Docs/marketing on Azure Static Web Apps
- **CI/CD** — 3 independent GitHub Actions workflows (gateway.yml, dashboard.yml, docs.yml)

**Shipped capabilities (v1.0 + v1.1):**
- Edge gateway with 4 connectors (GitHub 10 actions, Slack 6, Stripe 8, Discord 7)
- Encrypted auth vault with Durable Objects token coordinator
- Go CLI with progressive discovery, 3 output modes, shell completion, composable chains
- Web dashboard for API keys, connector status, usage analytics
- Composable actions engine with 6 pre-built chains
- Self-hosting via Docker Compose with full feature parity (minus billing)
- Stripe billing, Nextra docs site, GoReleaser distribution
- DNS on Cloudflare, multi-environment Workers (staging/production), Azure SWA
- CI/CD with PR quality gates, staging preview deploys, production gradual rollout
- Deployment runbook, scripts, secrets inventory, binding isolation checks

## Requirements

### Validated

- ✓ Edge gateway on Cloudflare Workers + Hono that routes requests to connectors — v1.0
- ✓ Connector SDK/template for building typed, self-contained API connectors in TypeScript — v1.0
- ✓ Response flattening layer that normalizes any API response into flat, consistent JSON — v1.0
- ✓ Standardized error format across all connectors — v1.0
- ✓ GitHub connector (issues, PRs, repos — 10 actions) — v1.0
- ✓ Slack connector (send message, list channels, search — 6 actions) — v1.0
- ✓ Stripe connector (payments, customers, invoices — 8 actions) — v1.0
- ✓ Discord connector (messages, channels, roles, moderation — 7 actions) — v1.0
- ✓ Full auth system: API key generation, encrypted vault, OAuth flows, token refresh — v1.0
- ✓ `feelr auth` one-time setup per connector — v1.0
- ✓ Go CLI binary: `feelr run`, `feelr tools`, `feelr auth`, `feelr status`, `feelr chain` — v1.0
- ✓ Auto-discovery via `feelr tools` with ~100 token agent-optimized descriptions — v1.0
- ✓ Agent-friendly output modes (JSON, table, minimal) — v1.0
- ✓ Next.js dashboard at feelr.dev: API key management, connected services, usage stats — v1.0
- ✓ Stripe billing integration (toggleable — enabled for hosted cloud, disabled for self-hosted) — v1.0
- ✓ Rate limiting and usage metering — v1.0
- ✓ Composable actions: pre-built chains + user-defined custom chains with data passing and conditional logic — v1.0
- ✓ Documentation site at feelr.dev/docs — v1.0
- ✓ Self-hosting via Docker Compose with feature parity — v1.0
- ✓ CLI distribution via GoReleaser + Homebrew — v1.0
- ✓ Open-source packaging (MIT license, CONTRIBUTING.md, connector template) — v1.0
- ✓ Cloudflare DNS as sole authority for feelr.dev — v1.1
- ✓ Multi-environment Workers deployment (staging/production) with isolated bindings — v1.1
- ✓ Custom domain api.feelr.dev with SSL on Cloudflare Workers — v1.1
- ✓ Dashboard deployed to Azure SWA at app.feelr.dev with managed SSL — v1.1
- ✓ Docs/marketing deployed to Azure SWA at feelr.dev with managed SSL — v1.1
- ✓ CI/CD: PR quality gates, staging deploy on merge, production deploy on tag — v1.1
- ✓ 3 independent CI/CD workflows with path-based triggers — v1.1
- ✓ Production gradual rollout (10% → 100%) for gateway — v1.1
- ✓ Deployment runbook, scripts, secrets inventory — v1.1
- ✓ CI binding isolation checks (staging/production resource separation) — v1.1

### Active

<!-- v1.2.0 — Marketing & Onboarding -->

- [ ] Homebrew tap moved to progradetech/homebrew-feelr with correct brew install command
- [ ] Landing page on app.feelr.dev shows install commands below sign-in button
- [ ] Interactive demo walkthrough with embedded terminal UI and animated typing
- [ ] Demo dashboard mode showing actual dashboard UI with fake data

### Out of Scope

- Python/Node SDKs — CLI + HTTP is sufficient, SDKs deferred to post-launch based on demand
- Mobile app or mobile-specific UI — web dashboard + CLI covers all use cases
- Notion connector — deferred to post-launch
- Vercel connector — deferred to post-launch
- Real-time streaming/websocket responses — flat JSON responses only, use polling for long-running ops
- MCP-compatible mode — potential future feature, thin bridge adapter deferred to v2
- Team key sharing with scoped permissions — deferred to v2 (multi-tenant complexity)
- Visual chain builder / drag-and-drop UI — target audience is developers, not visual builders
- Kubernetes / container orchestration — massive overhead for 3 services
- Infrastructure as Code (Terraform/Pulumi) — state management burden exceeds benefit
- Automated canary analysis — requires SRE-level metrics infrastructure

## Context

- The agentic coding explosion (Claude Code, Codex CLI, Gemini CLI, Aider, Cline) means every developer running agents needs external API access
- MCP is powerful but heavy — server process management, JSON-RPC overhead, 2-5K tokens of tool schemas per server
- Feelr targets the "missing middle" between raw API calls (too complex) and MCP (too heavy)
- Primary audience: solo developers with agents, agent framework builders, AI-powered automation builders
- Brand: lobster/antennae metaphor — "feelers" that sense API capabilities. Lobster Red (#E85D3A), Antenna Purple (#8B5CF6)
- Deployment model: fully open-source and self-hostable (minus billing), plus managed cloud at api.feelr.dev with billing enabled
- v1.0 shipped in 5 days (154 min execution time across 51 plans)
- v1.1 shipped in 2 days (13 plans) — all services now live and deployed with CI/CD
- Deferred operational improvements: Turborepo remote cache, env drift detection, SWA preview environments, automated D1 migration verification

## Constraints

- **Tech stack (backend)**: Cloudflare Workers + Hono — zero cold starts, global edge, low cost
- **Tech stack (connectors)**: TypeScript — type-safe, self-contained modules using Web Standard APIs only
- **Tech stack (CLI)**: Go + Cobra — single binary, no runtime deps, fast shell-out for agents
- **Tech stack (dashboard)**: Next.js 15.5 on Azure Static Web Apps (static export)
- **Tech stack (billing)**: Stripe Billing with metered subscriptions
- **Tech stack (self-hosting)**: workerd + s6-overlay + SQLite in Docker
- **Infrastructure**: Cloudflare Workers Paid ($5/mo), Azure SWA Standard (2x), GitHub Actions CI/CD
- **Open-source**: Full stack is open-source (MIT); billing is a toggleable feature for cloud-hosted only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Go for CLI (not Rust/Node) | Fast to write, single binary, great CLI ecosystem (Cobra), no runtime deps | ✓ Good — 6,021 LOC Go, clean Cobra structure, 84 chain tests |
| Discord over Notion/Vercel for initial connectors | User preference — covers notification + community management use cases | ✓ Good — 7 Discord actions, rounds out connector coverage |
| Open-source with hosted cloud model | Drives adoption via self-hosting, monetize via managed service | ✓ Good — MIT license, Docker Compose self-hosting works |
| Full composable actions in v1 | User-defined + pre-built chains with data passing and conditional logic | ✓ Good — 6 pre-built chains, YAML/JSON custom chains, dry-run mode |
| Billing as toggleable feature | Keeps open-source clean, only enabled for hosted cloud | ✓ Good — single config flag disables billing for self-hosted |
| Connector SDK uses Web Standard APIs only | Portability between Cloudflare Workers and workerd self-hosting | ✓ Good — runtime abstraction layer works cleanly |
| Hub-and-spoke architecture (connectors as in-process modules) | Simpler than microservices, single deployment unit | ✓ Good — all 4 connectors register in gateway, shared auth |
| Durable Objects for token coordinator | Prevents OAuth refresh race conditions at the edge | ✓ Good — single-writer pattern, alarm-based proactive refresh |
| HKDF for key derivation (not PBKDF2) | Master secret is already high-entropy Worker Secret | ✓ Good — simpler, purpose-based domain separation via info param |
| workerd for self-hosting runtime | Same V8 isolate model as Cloudflare Workers | ⚠️ Acceptable — npm install pattern works, some complexity in config |
| Azure Static Web Apps for dashboard + docs | Static exports, managed SSL, lower cost than App Service containers | ✓ Good — both deployed with custom domains and managed SSL |
| Cloudflare DNS as sole authority | Required for Workers Custom Domains; single source of truth | ✓ Good — zone active, all records managed in Cloudflare |
| GitHub Actions for CI/CD | Tags → production, main → staging, path-filtered triggers | ✓ Good — 3 independent workflows, concurrency controls, approval gates |
| Pre-build strategy for SWA | Skip Oryx builder, use pnpm/turbo in CI for control | ✓ Good — faster builds, consistent with local dev |
| Gradual rollout for production gateway | 10% canary → smoke test → 100% via wrangler versions | ✓ Good — safety net for production deploys; DO migrations bypass |
| DNS-only (gray cloud) for Azure CNAME records | Cloudflare proxy breaks Azure SWA SSL verification | ✓ Good — permanent setting, managed SSL renewal works |
| Consolidated gateway.yml workflow | Single file with conditional staging/production jobs | ✓ Good — cleaner than separate deploy-staging + deploy-production files |

| Embedded terminal demo (not real sandboxed terminal) | Controlled experience, zero backend infra, purely frontend with animated typing | — Pending |
| Mocked API responses for demo | Predictable, no token management, works offline, zero maintenance | — Pending |
| Demo mode in actual dashboard (not separate page) | User sees exactly what they'd get, reuses existing UI components | — Pending |
| Move Homebrew tap to progradetech org | Matches public org, cleaner brew install command | — Pending |

---
*Last updated: 2026-02-10 after v1.2.0 milestone start*
