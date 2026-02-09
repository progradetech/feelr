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

