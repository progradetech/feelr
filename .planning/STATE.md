# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** An AI agent can call any supported external API in one line with near-zero context overhead
**Current focus:** Phase 15 - Frontend CI/CD Pipelines

## Current Position

Phase: 15 of 16 (Frontend CI/CD Pipelines)
Plan: 1 of 2 in current phase -- COMPLETE
Status: Plan 15-01 complete. Next: Plan 15-02
Last activity: 2026-02-10 -- Completed 15-01 Gateway Workflow Consolidation

Progress: [##############......] 68% (60/~62 plans across v1.0 + v1.1)

## Milestone History

| Milestone | Phases | Plans | Shipped |
|-----------|--------|-------|---------|
| v1.0 MVP | 1-10 | 51 | 2026-02-09 |
| v1.1 Deployment & CI/CD | 11-16 | TBD | - |

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 51
- Average duration: 3 min
- Total execution time: 154 min
- Timeline: 5 days (2026-02-05 to 2026-02-09)

**v1.1 Velocity:**
- Total plans completed: 8
- Average duration: 3 min
- Total execution time: ~30 min (excludes human checkpoint wait times)

## Accumulated Context

### Decisions

All v1.0 decisions are logged in PROJECT.md Key Decisions table with outcomes.
v1.1 pending decisions (from research):
- Azure Static Web Apps over App Service (static exports, lower cost)
- Cloudflare DNS as sole authority (required for Workers Custom Domains)
- Pre-build strategy for SWA (skip Oryx builder, use pnpm/turbo in CI)

v1.1 confirmed decisions:
- Cloudflare Free plan for DNS zone hosting (braden.ns + ruth.ns assigned)
- SSL/TLS Full mode for .dev HSTS compliance
- DNSSEC left disabled during initial delegation
- [Phase 11]: Keep GoReleaser brews section (not migrate to homebrew_casks) until v3 deprecation
- [Phase 11]: Fix archives deprecations (builds->ids, format->formats) to pass goreleaser check
- [Phase 12]: Placeholder IDs in wrangler.toml for Plan 12-02 to replace with real Cloudflare resource IDs
- [Phase 12]: Top-level wrangler.toml reduced to inheritable settings only; all bindings in per-env sections
- [Phase 12]: Staging uses workers_dev URL; production uses custom_domain for api.feelr.dev
- [Phase 12]: Auto-registered feelr.workers.dev subdomain for Worker deployment
- [Phase 12]: KV isolation verified architecturally (separate namespace IDs) rather than direct write test
- [Phase 12]: Per-environment secrets set interactively; different values for staging vs production
- [Phase 13]: Lint aliases tsc --noEmit (lightweight, no dedicated linter yet)
- [Phase 13]: PR staging comment updates in-place instead of creating duplicates
- [Phase 13]: Shared deploy-staging concurrency group between ci.yml and deploy-staging.yml to prevent staging races
- [Phase 13]: Automatic gradual rollout (10% -> smoke test -> 100%) for production; manual CLI available if needed
- [Phase 13]: versions upload + versions deploy for production (not wrangler deploy) to enable traffic splitting
- [Phase 13]: DO migration releases must bypass gradual rollout and use wrangler deploy directly
- [Phase 14]: Standard plan for both SWAs (required for custom domains)
- [Phase 14]: Microsoft.Web resource provider registered before SWA creation
- [Phase 14]: Fixed Nextra 4.6.1 docs build (strict schema, missing imports, not-found page)
- [Phase 14]: GitHub Actions secrets deferred; tokens retrievable via az CLI
- [Phase 14]: DNS-only mode (gray cloud) mandatory for Azure SWA CNAME records — proxy breaks SSL
- [Phase 14]: CNAME flattening at apex for feelr.dev -> SWA default hostname
- [Phase 14]: _dnsauth TXT records permanent for Azure managed SSL renewal
- [Phase 15]: Consolidated deploy-staging.yml + deploy-production.yml into single gateway.yml with conditional jobs
- [Phase 15]: Preserved deploy-staging concurrency group name (shared with ci.yml gateway-preview)
- [Phase 15]: NEXT_PUBLIC_GATEWAY_URL in turbo.json build env for staging/production cache isolation
- [Phase 15]: GitHub org is progradetech (not andrewprograde) for repository secrets

### Pending Todos

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Remove GIF placeholder in README | 2026-02-09 | 3c8b385 | [1-remove-gif-placeholder-in-readme](./quick/1-remove-gif-placeholder-in-readme/) |

### Blockers/Concerns

- ~~DNS propagation after nameserver change can take up to 24 hours (Phase 11 may gate Phase 12)~~ RESOLVED: Propagation confirmed 2026-02-09
- ~~Cloudflare orange-cloud proxy must be disabled during Azure domain verification (Phase 14-02 sequencing)~~ RESOLVED: CNAME records set to DNS-only (gray cloud) permanently
- ~~Workers gradual rollouts may have limitations with Durable Objects (Phase 13 research needed)~~ RESOLVED: DO migration releases use wrangler deploy directly; normal code changes use gradual rollout path
- ~~GitHub Actions secrets (SWA_DASHBOARD_DEPLOYMENT_TOKEN, SWA_DOCS_DEPLOYMENT_TOKEN) not yet set - needed before Phase 15 CI/CD. Tokens retrievable via `az staticwebapp secrets list`~~ RESOLVED: Secrets set in progradetech/feelr repository via GitHub web UI (Phase 15-01)

## Session Continuity

Last session: 2026-02-10
Stopped at: Completed 15-01-PLAN.md (Gateway Workflow Consolidation). gateway.yml created, SWA secrets set, turbo.json updated. Plan 15-02 next.
Resume file: None
