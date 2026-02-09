# Requirements: Feelr

**Defined:** 2026-02-09
**Core Value:** An AI agent can call any supported external API in one line with near-zero context overhead

## v1.1 Requirements

Requirements for deployment & CI/CD milestone. Each maps to roadmap phases.

### DNS & Domain Configuration

- [ ] **DNS-01**: Developer can transfer feelr.dev nameservers from Namecheap to Cloudflare
- [ ] **DNS-02**: Developer can access all feelr.dev DNS records from Cloudflare dashboard (single source of truth)
- [ ] **DNS-03**: api.feelr.dev resolves to Cloudflare Workers gateway with auto-provisioned SSL
- [ ] **DNS-04**: app.feelr.dev resolves to Azure Static Web Apps dashboard with managed SSL
- [ ] **DNS-05**: feelr.dev (apex) resolves to Azure Static Web Apps docs/marketing site with managed SSL via CNAME flattening

### Gateway Deployment

- [ ] **GW-01**: Developer can deploy gateway to staging via `wrangler deploy --env staging` with isolated KV/D1/DO bindings
- [ ] **GW-02**: Developer can deploy gateway to production via `wrangler deploy --env production` with isolated KV/D1/DO bindings
- [ ] **GW-03**: Staging and production use completely separate KV namespaces, D1 databases, and DO namespaces (no data sharing)
- [ ] **GW-04**: Gateway secrets (ENCRYPTION_KEY, OAuth credentials) are set per-environment and preserved across deploys (`keep_vars = true`)
- [ ] **GW-05**: Developer can perform gradual rollouts (10%→100%) for gateway deployments via `wrangler versions`
- [ ] **GW-06**: Gateway PRs generate unique preview URLs for testing before merge

### Frontend Deployment

- [ ] **FE-01**: Dashboard is deployed as a static export to Azure Static Web Apps (app.feelr.dev)
- [ ] **FE-02**: Docs/marketing site is deployed as a static export to Azure Static Web Apps (feelr.dev)
- [ ] **FE-03**: Both SWA apps use pre-built output from pnpm/turbo (skip SWA's Oryx builder)
- [ ] **FE-04**: Dashboard build injects correct `NEXT_PUBLIC_GATEWAY_URL` for the target environment

### CI/CD Pipeline

- [ ] **CI-01**: Every PR runs lint, typecheck, and tests for affected packages via Turborepo
- [ ] **CI-02**: Push to main triggers staging deployment for changed services (path-filtered)
- [ ] **CI-03**: Version tag push triggers production deployment for all services
- [ ] **CI-04**: Gateway, dashboard, and docs each have separate workflow files with path-based triggers
- [ ] **CI-05**: Post-deploy smoke tests verify health endpoints after each deployment
- [ ] **CI-06**: Concurrency controls prevent deployment races within the same environment
- [ ] **CI-07**: Production deployments require approval via GitHub environment protection rules
- [ ] **CI-08**: All deployment secrets are documented in a secrets inventory

### Deployment Guides

- [ ] **DOC-01**: Internal deployment runbook covers first-time setup sequence end-to-end
- [ ] **DOC-02**: Internal deployment runbook covers routine deployment procedures per service
- [ ] **DOC-03**: Internal deployment runbook covers rollback procedures per service (wrangler rollback, SWA revert)
- [ ] **DOC-04**: Internal deployment runbook includes troubleshooting guide for common errors
- [ ] **DOC-05**: Automated deployment scripts with inline comments for repeatable operations
- [ ] **DOC-06**: CI includes automated verification that staging/production wrangler bindings don't overlap

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Operational Improvements

- **OPS-01**: Turborepo remote cache for CI (reuse build artifacts across runs)
- **OPS-02**: Environment variable drift detection between staging and production
- **OPS-03**: Azure SWA staging environments per PR (preview deployments for frontend)
- **OPS-04**: Automated D1 migration verification in staging before production apply

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Kubernetes / container orchestration | Massive overhead for 3 services and a solo developer |
| Multi-region Azure deployment | Workers are already globally distributed; Azure single-region is sufficient |
| Infrastructure as Code (Terraform/Pulumi) | State management burden exceeds benefit for 3 services |
| Automated canary analysis (Kayenta/Flagger) | Requires SRE-level metrics infrastructure |
| Auto-apply production D1 migrations | Production data safety requires manual review |
| Separate CI/CD tool (ArgoCD, Jenkins) | GitHub Actions handles all CI/CD needs |
| Blue-green deployment infrastructure | Workers and SWA already provide zero-downtime deploys natively |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DNS-01 | — | Pending |
| DNS-02 | — | Pending |
| DNS-03 | — | Pending |
| DNS-04 | — | Pending |
| DNS-05 | — | Pending |
| GW-01 | — | Pending |
| GW-02 | — | Pending |
| GW-03 | — | Pending |
| GW-04 | — | Pending |
| GW-05 | — | Pending |
| GW-06 | — | Pending |
| FE-01 | — | Pending |
| FE-02 | — | Pending |
| FE-03 | — | Pending |
| FE-04 | — | Pending |
| CI-01 | — | Pending |
| CI-02 | — | Pending |
| CI-03 | — | Pending |
| CI-04 | — | Pending |
| CI-05 | — | Pending |
| CI-06 | — | Pending |
| CI-07 | — | Pending |
| CI-08 | — | Pending |
| DOC-01 | — | Pending |
| DOC-02 | — | Pending |
| DOC-03 | — | Pending |
| DOC-04 | — | Pending |
| DOC-05 | — | Pending |
| DOC-06 | — | Pending |

**Coverage:**
- v1.1 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29 (pending roadmap creation)

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after initial definition*
