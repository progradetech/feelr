# Phase 9: Self-Hosting - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Run the full Feelr stack locally or on user infrastructure with a single command. Docker Compose deploys workerd gateway + SQLite + Next.js dashboard. Feature parity with cloud except billing (disabled by default). Same codebase, runtime differences abstracted.

</domain>

<decisions>
## Implementation Decisions

### Deployment experience
- Init script + compose flow: user runs a setup script that prompts for essentials, generates config, then `docker compose up`
- Single port exposed (e.g., 8080) — internal routing handles gateway API vs dashboard
- Progressive init: collect admin creds + encryption secret first, then offer optional connector setup ("Want to configure connectors now? y/N")
- Optional Caddy sidecar in docker-compose.yml (profile-based) for auto Let's Encrypt TLS — HTTP-only by default

### Runtime abstraction
- workerd standalone as the self-hosted runtime (closest to production Workers)
- Single Docker image for the whole stack (workerd + dashboard) — uses supervisor or multi-process
- Abstraction level: Claude's discretion based on what workerd actually supports (interface+adapters vs thin shims)
- Dev experience (hot-reload vs restart): Claude's discretion based on workerd native capabilities

### Configuration surface
- Billing code present but disabled by default — self-hosters can enable and connect own Stripe for internal chargeback
- YAML config (`feelr.yaml`) for structured settings + `.env` for secrets (tokens, encryption key)
- Rate limit tiers configurable in `feelr.yaml` — self-hosters define their own limits per key tier
- Init script generates `feelr.yaml` from commented template — user gets working config they can also understand and edit

### Storage adaptation
- SQLite files split by concern: separate databases for auth, usage, config (better concurrency, independent backup)
- Token coordination approach: Claude's discretion based on workerd DO support maturity (workerd DO emulation if available, SQLite with locks as fallback)
- Encryption optional: AES-256-GCM on by default, can be disabled for local-only dev instances
- Auto-migrate on startup by default, `FEELR_AUTO_MIGRATE=false` to disable for manual control

### Claude's Discretion
- Runtime abstraction layer design (interface+adapters vs thin shims — depends on workerd API surface)
- Token coordination mechanism (workerd DO vs SQLite locks — depends on workerd maturity)
- Dev experience hot-reload vs restart-on-change
- Single image process supervisor choice
- SQLite file naming and location conventions

</decisions>

<specifics>
## Specific Ideas

- Init script should feel progressive — get running fast with essentials, depth is optional
- Caddy sidecar as a Docker Compose profile (not always-on) for production TLS
- Self-hosters who want billing can enable it — supports internal chargeback use case
- YAML config preserves comments after generation so users can learn by reading

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-self-hosting*
*Context gathered: 2026-02-07*
