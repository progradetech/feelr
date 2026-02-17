# Feelr

## What This Is

Feelr is an agent-friendly API simplification layer — a hosted service + Go CLI + web dashboard that sits between complex real-world APIs and AI agents. It transforms bloated, poorly-documented APIs into minimal, predictable, CLI-native endpoints that agents can call with ~50 tokens of context instead of thousands. Open-source (MIT) and self-hostable via Docker Compose, with a managed cloud option at api.feelr.dev.

## Core Value

An AI agent can call any supported external API in one line with near-zero context overhead — no schema parsing, no auth gymnastics, no pagination wrangling.

## Current State

**Version:** v1.4.0 Open Core (shipped 2026-02-17)
**Codebase:** ~21,844 LOC (15,823 TypeScript + 6,021 Go) across 500+ files
**Tech stack:** Cloudflare Workers + Hono (gateway), Go + Cobra (CLI), Next.js 15.5 (dashboard), Stripe (billing, cloud-only), workerd (self-hosting)

**Live services:**
- **api.feelr.dev** — Edge gateway on Cloudflare Workers (staging + production with isolated KV/D1/DO)
- **app.feelr.dev** — Dashboard on Azure Static Web Apps
- **feelr.dev** — Docs/marketing on Azure Static Web Apps
- **staging-api.feelr.dev** — Staging gateway with CF Access protection
- **staging-app.feelr.dev** — Staging dashboard on separate Azure SWA instance
- **staging-docs.feelr.dev** — Staging docs on separate Azure SWA instance
- **CI/CD** — Public repo: 3 workflows (lint, test, sync dispatch). Cloud repo: 5 workflows (sync, gateway, dashboard, docs, release)

**Repositories:**
- **progradetech/feelr** — Public, MIT. Gateway, connectors, CLI, self-host, docs. Community contributions welcome.
- **progradetech/feelr-cloud** — Private. Cloud overlay with StripeBillingProvider, deployment configs. OSS embedded at oss/ via git subtree.

**Shipped capabilities (v1.0 through v1.4):**
- Edge gateway with 4 connectors (GitHub 10 actions, Slack 6, Stripe 8, Discord 7)
- Encrypted auth vault with Durable Objects token coordinator
- Go CLI binary: `feelr run`, `feelr tools`, `feelr auth`, `feelr status`, `feelr chain`
- Web dashboard for API keys, connector status, usage analytics
- Composable actions engine with 6 pre-built chains
- Self-hosting via Docker Compose with full feature parity (minus billing)
- Stripe billing (cloud-only via pluggable BillingProvider interface), Nextra docs site, GoReleaser distribution
- DNS on Cloudflare, multi-environment Workers (staging/production), Azure SWA
- CI/CD with PR quality gates, staging preview deploys, production gradual rollout
- Landing page with brand typography, connector feature cards, SEO metadata
- Interactive terminal demo, demo dashboard mode, Homebrew tap
- Staging custom domains, Feelr branding (favicons, logos, manifests)
- Open-core architecture: public OSS + private cloud overlay with git subtree
- Community contribution infrastructure: scaffolding CLI, SDK test utils, validation CI, developer docs

## Requirements

### Validated

- ✓ Edge gateway on Cloudflare Workers + Hono — v1.0
- ✓ 4 connectors (GitHub, Slack, Stripe, Discord) with 31 total actions — v1.0
- ✓ Encrypted auth vault with DO token coordinator — v1.0
- ✓ Go CLI with progressive discovery, 3 output modes, composable chains — v1.0
- ✓ Next.js dashboard for API key management, connector status, usage — v1.0
- ✓ Self-hosting via Docker Compose — v1.0
- ✓ Stripe billing, Nextra docs, GoReleaser distribution — v1.0
- ✓ Cloudflare DNS, multi-environment Workers, Azure SWA — v1.1
- ✓ CI/CD with PR quality gates, staging deploys, production rollout — v1.1
- ✓ Landing page, interactive demo, demo dashboard mode — v1.2
- ✓ Homebrew tap migration, Cloudflare Web Analytics — v1.2
- ✓ Staging custom domains with CF Access protection — v1.3
- ✓ Full Feelr branding (favicons, logos, manifests) — v1.3
- ✓ Open-core repo split with git subtree — v1.4
- ✓ Pluggable billing (BillingProvider interface) — v1.4
- ✓ Cross-repo CI/CD with auto-sync dispatch — v1.4
- ✓ Community contribution infrastructure — v1.4

### Active

**Current Milestone: v1.5 CI/CD Stabilization**

**Goal:** Make the open-core deployment model fully operational — public repo does lint/test/build only, cloud repo handles all deployments, end-to-end pipeline verified green.

**Target features:**
- Fix public repo workflows to remove deploy jobs (lint/test/build only)
- Fix cloud repo oss-sync pnpm-lock.yaml path resolution
- Ensure cloud repo has complete deploy workflows for all 3 services
- Verify end-to-end deploy chain: public merge → dispatch → cloud sync → build → deploy → smoke test
- All GitHub Actions green across both repos

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
- PWA offline support — web manifest is for branding only, not full PWA
- Dynamic OG images — static metadata sufficient
- Custom 404/error pages with branding — defer to future polish milestone

## Context

- The agentic coding explosion (Claude Code, Codex CLI, Gemini CLI, Aider, Cline) means every developer running agents needs external API access
- MCP is powerful but heavy — server process management, JSON-RPC overhead, 2-5K tokens of tool schemas per server
- Feelr targets the "missing middle" between raw API calls (too complex) and MCP (too heavy)
- Primary audience: solo developers with agents, agent framework builders, AI-powered automation builders
- Brand: lobster/antennae metaphor — "feelers" that sense API capabilities. Lobster Red (#E85D3A), Antenna Purple (#8B5CF6)
- Deployment model: fully open-source and self-hostable (minus billing), plus managed cloud at api.feelr.dev with billing enabled
- v1.4 split into open-core model revealed CI/CD gaps: deploy secrets not on public repo, cloud repo sync broken
- Deferred: CF analytics tokens, CF token fix verification

## Constraints

- **Tech stack (backend)**: Cloudflare Workers + Hono — zero cold starts, global edge, low cost
- **Tech stack (connectors)**: TypeScript — type-safe, self-contained modules using Web Standard APIs only
- **Tech stack (CLI)**: Go + Cobra — single binary, no runtime deps, fast shell-out for agents
- **Tech stack (dashboard)**: Next.js 15.5 on Azure Static Web Apps (static export)
- **Tech stack (billing)**: Stripe Billing with metered subscriptions
- **Tech stack (self-hosting)**: workerd + s6-overlay + SQLite in Docker
- **Infrastructure**: Cloudflare Workers Paid ($5/mo), Azure SWA Standard (2x production + 2x staging), GitHub Actions CI/CD
- **Open-source**: Full stack is open-source (MIT); billing is a toggleable feature for cloud-hosted only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cloud repo handles all deploys | Public repo should only lint/test/build — it has no deploy secrets and shouldn't need them | — Pending (v1.5) |
| Go for CLI (not Rust/Node) | Fast to write, single binary, great CLI ecosystem (Cobra), no runtime deps | ✓ Good |
| Open-core overlay model (git subtree) | Public repo is the product, private repo is thin cloud overlay | ✓ Good |
| Cross-repo dispatch via PAT | Public repo sends repository_dispatch to cloud repo on merge | ✓ Good |
| Provider registry pattern for billing | BillingProvider interface with NoopBillingProvider default | ✓ Good |

---
*Last updated: 2026-02-17 after v1.5 milestone started*
