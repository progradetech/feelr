# Milestones

## v1.0 MVP (Shipped: 2026-02-09)

**Phases:** 1-10 | **Plans:** 51 | **Timeline:** 5 days (2026-02-05 to 2026-02-09)
**LOC:** ~18,600 (12,585 TypeScript + 6,021 Go) | **Files:** 401

**Delivered:** Agent-friendly API simplification layer with edge gateway, 4 connectors, Go CLI, web dashboard, composable actions, self-hosting, and launch-ready packaging.

**Key accomplishments:**
- Edge gateway on Cloudflare Workers + Hono with consistent response envelope and connector SDK
- Encrypted auth vault with AES-256-GCM, Durable Objects token coordinator, and auto-refresh
- 4 production connectors: GitHub (10 actions), Slack (6), Stripe (8), Discord (7) with OAuth flows
- Go CLI binary with progressive discovery, 3 output modes, shell completion, and chain execution
- Next.js dashboard for API key management, connector status, and usage visualization
- Composable actions engine with 6 pre-built chains, custom YAML chains, data passing, and conditionals
- Self-hosting via Docker Compose with workerd runtime abstraction and feature parity
- Stripe billing, Nextra docs site, GoReleaser distribution, and open-source packaging (MIT)

**Archive:** [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) | [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) | [v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)

---


## v1.1 Deployment & CI/CD (Shipped: 2026-02-10)

**Phases:** 11-16 | **Plans:** 13 | **Timeline:** 2 days (2026-02-09 to 2026-02-10)
**Commits:** 53 | **Files modified:** 71

**Delivered:** Production deployment infrastructure — DNS, multi-environment Workers, Azure Static Web Apps, 3 independent CI/CD pipelines, deployment runbooks, and safety checks.

**Key accomplishments:**
- Delegated feelr.dev DNS to Cloudflare and validated GoReleaser CLI releases for 6 platforms
- Provisioned multi-environment Cloudflare Workers (staging/production) with isolated KV/D1/DO and custom domain api.feelr.dev
- Created CI/CD pipeline with PR quality gates, staging preview deploys, and production gradual rollout (10% → 100%)
- Deployed dashboard (app.feelr.dev) and docs (feelr.dev) to Azure Static Web Apps with managed SSL
- Built 3 independent CI/CD workflows (gateway.yml, dashboard.yml, docs.yml) with path-based triggers
- Created deployment runbook, 5 executable scripts, secrets inventory, and CI binding isolation checks

**Archive:** [v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) | [v1.1-REQUIREMENTS.md](milestones/v1.1-REQUIREMENTS.md)

---


## v1.2 Marketing & Onboarding (Shipped: 2026-02-11)

**Phases:** 17-21 | **Plans:** 11 | **Tasks:** 25 | **Timeline:** 2 days (2026-02-10 to 2026-02-11)
**Files modified:** 71 | **Lines changed:** +7,877 / -73 | **Total codebase:** ~21,253 LOC

**Delivered:** Marketing and onboarding experience — landing page with brand typography, interactive terminal demo, demo dashboard mode with mock data, Homebrew tap migration, and Cloudflare Web Analytics.

**Key accomplishments:**
- Migrated Homebrew tap to progradetech/homebrew-feelr with deprecation formula in old andrewprograde tap
- Built DemoContext provider + typed mock data fixtures for 5 dashboard data domains
- SWR null-key demo interception across 6 hooks with AuthGuard bypass for zero-auth demo mode
- Landing page with hero, install commands, 4 connector cards, brand typography, and SEO metadata
- Interactive terminal demo with animated typing walkthrough and seamless dashboard transition
- Cloudflare Web Analytics integrated across all pages

**Archive:** [v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) | [v1.2-REQUIREMENTS.md](milestones/v1.2-REQUIREMENTS.md)

---


## v1.3 Staging & Branding (Shipped: 2026-02-12)

**Phases:** 22-24 | **Plans:** 7 | **Tasks:** ~17 | **Timeline:** 2 days (2026-02-11 to 2026-02-12)
**Commits:** 30 | **Files modified:** 54 | **Lines changed:** +4,959 / -71 | **Total codebase:** ~21,442 LOC

**Delivered:** Staging infrastructure with custom domains for all three services, plus full Feelr branding — favicons, web manifests, and logo integration across dashboard, docs, and landing page.

**Key accomplishments:**
- Three staging custom domains (staging-api/app/docs.feelr.dev) with CF Access protection and health check bypasses
- CI/CD workflows updated for staging SWA instances with separate deploy tokens and health checks
- Sharp-based icon build script generating favicon.ico, apple-touch-icon, and manifest PNGs from source SVG
- Adaptive dark/light SVG favicon and web manifests with Lobster Red theme color and env-aware metadataBase
- Feelr logomark integrated in dashboard sidebar, docs navbar, and landing page hero section
- Staging banner component with gateway URL detection for visual environment differentiation

**Archive:** [v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md) | [v1.3-REQUIREMENTS.md](milestones/v1.3-REQUIREMENTS.md)

---

