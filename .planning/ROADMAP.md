# Roadmap: Feelr

## Milestones

- [x] **v1.0 MVP** - Phases 1-10 (shipped 2026-02-09) | [Archive](milestones/v1.0-ROADMAP.md)
- [ ] **v1.1 Deployment & CI/CD** - Phases 11-16 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-10) - SHIPPED 2026-02-09</summary>

- [x] Phase 1: Edge Gateway Foundation (3/3 plans) - completed 2026-02-05
- [x] Phase 2: Auth Vault (5/5 plans) - completed 2026-02-06
- [x] Phase 3: GitHub Connector (4/4 plans) - completed 2026-02-06
- [x] Phase 4: CLI Core (5/5 plans) - completed 2026-02-06
- [x] Phase 5: OAuth Connectors (6/6 plans) - completed 2026-02-06
- [x] Phase 6: Dashboard (5/5 plans) - completed 2026-02-07
- [x] Phase 7: Production Hardening (5/5 plans) - completed 2026-02-07
- [x] Phase 8: Composable Actions (7/7 plans) - completed 2026-02-07
- [x] Phase 9: Self-Hosting (7/7 plans) - completed 2026-02-09
- [x] Phase 10: Launch Prep (4/4 plans) - completed 2026-02-09

</details>

### v1.1 Deployment & CI/CD

**Milestone Goal:** Take Feelr from local development to production -- deploy all services, configure DNS, set up CI/CD pipelines, and create internal deployment guides.

**Phase Numbering:**
- Integer phases (11, 12, ...): Planned milestone work
- Decimal phases (12.1, 12.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 11: DNS & Cloudflare Zone Setup + CI/CD Audit** - Establish Cloudflare as DNS authority for feelr.dev and fix existing pipelines
- [ ] **Phase 12: Gateway Infrastructure & Environments** - Configure wrangler staging/production environments with full resource isolation
- [ ] **Phase 13: Gateway CI/CD Pipeline** - Automate gateway deployment with quality gates, rollouts, and environment protection
- [ ] **Phase 14: Azure Static Web Apps Provisioning** - Deploy dashboard and docs to Azure SWA with custom domains and managed SSL
- [ ] **Phase 15: Frontend CI/CD Pipelines** - Automate dashboard and docs deployment with environment-aware builds
- [ ] **Phase 16: Deployment Guides & Hardening** - Document operational procedures and add deployment safety checks

## Phase Details

### Phase 11: DNS & Cloudflare Zone Setup + CI/CD Audit
**Goal**: Establish Cloudflare as DNS authority for feelr.dev and audit/fix the existing GitHub Actions release pipeline
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: DNS-01, DNS-02, CI-00
**Success Criteria** (what must be TRUE):
  1. Developer can log into Cloudflare dashboard and see the feelr.dev zone as active with all DNS records visible
  2. `dig feelr.dev NS` returns Cloudflare nameservers (not Namecheap defaults)
  3. Namecheap domain settings show custom nameservers pointing to Cloudflare
  4. Existing release.yml workflow (GoReleaser CLI release) is audited, tested, and any issues are fixed
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

### Phase 12: Gateway Infrastructure & Environments
**Goal**: Developer can manually deploy the gateway to isolated staging and production environments where each has its own data stores, secrets, and custom domain
**Depends on**: Phase 11
**Requirements**: GW-01, GW-02, GW-03, GW-04, DNS-03
**Success Criteria** (what must be TRUE):
  1. Running `wrangler deploy --env staging` deploys the gateway with staging-specific KV, D1, and DO bindings
  2. Running `wrangler deploy --env production` deploys the gateway with production-specific KV, D1, and DO bindings
  3. Writing data in staging (KV entries, D1 rows, DO state) does not appear in production and vice versa
  4. `curl https://api.feelr.dev/health` returns a successful response with a valid SSL certificate
  5. Redeploying the gateway preserves previously set secrets (ENCRYPTION_KEY, OAuth credentials) without re-entry
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD

### Phase 13: Gateway CI/CD Pipeline
**Goal**: Gateway deployment is fully automated with quality checks on every PR, staging deploys on merge, production deploys on tag, and safety controls preventing bad deploys
**Depends on**: Phase 12
**Requirements**: GW-05, GW-06, CI-01, CI-02, CI-03, CI-05, CI-06, CI-07
**Success Criteria** (what must be TRUE):
  1. Opening a PR that changes gateway code triggers lint, typecheck, and tests -- and the PR gets a unique preview URL for manual verification
  2. Merging a PR to main automatically deploys the gateway to staging, and a post-deploy smoke test verifies the health endpoint
  3. Pushing a version tag automatically deploys the gateway to production after passing a GitHub environment approval gate
  4. Developer can perform a gradual rollout (10% then 100%) for production gateway deployments
  5. Two simultaneous pushes to main do not cause deployment races (one waits or cancels)
**Plans**: TBD

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD

### Phase 14: Azure Static Web Apps Provisioning
**Goal**: Dashboard and docs/marketing site are deployed to Azure Static Web Apps with custom domains and managed SSL, accessible at their public URLs
**Depends on**: Phase 11
**Requirements**: FE-01, FE-02, FE-03, DNS-04, DNS-05
**Success Criteria** (what must be TRUE):
  1. `curl https://app.feelr.dev` loads the Feelr dashboard with a valid SSL certificate
  2. `curl https://feelr.dev` loads the Feelr docs/marketing site with a valid SSL certificate
  3. Both apps are deployed from pre-built static output (pnpm/turbo build), not using Azure's built-in Oryx builder
  4. Azure SWA dashboard shows both apps on the Standard plan with custom domains verified and SSL certificates active
**Plans**: TBD

Plans:
- [ ] 14-01: TBD
- [ ] 14-02: TBD

### Phase 15: Frontend CI/CD Pipelines
**Goal**: Dashboard and docs deployments are automated with environment-aware builds, and all three services (gateway, dashboard, docs) have independent CI/CD workflows
**Depends on**: Phase 13, Phase 14
**Requirements**: FE-04, CI-04
**Success Criteria** (what must be TRUE):
  1. Merging a PR that changes only dashboard code deploys the dashboard to staging without triggering gateway or docs deploys
  2. Merging a PR that changes only docs code deploys the docs site to staging without triggering gateway or dashboard deploys
  3. Dashboard build uses the correct `NEXT_PUBLIC_GATEWAY_URL` for the target environment (staging vs production gateway endpoint)
  4. Three separate workflow files exist (gateway.yml, dashboard.yml, docs.yml) each with path-based triggers scoped to their service
**Plans**: TBD

Plans:
- [ ] 15-01: TBD

### Phase 16: Deployment Guides & Hardening
**Goal**: All deployment knowledge is captured in runbooks and scripts so the developer can set up, deploy, roll back, and troubleshoot any service without tribal knowledge
**Depends on**: Phase 13, Phase 14, Phase 15
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, CI-08
**Success Criteria** (what must be TRUE):
  1. A developer can follow the first-time setup runbook end-to-end to get all services deployed from scratch without external guidance
  2. Routine deployments, rollbacks, and common troubleshooting scenarios each have step-by-step procedures in the runbook
  3. Automated deployment scripts exist with inline comments explaining each step, and can be run for repeatable operations
  4. CI includes a check that verifies staging and production wrangler bindings do not overlap (no shared KV/D1/DO IDs)
  5. All deployment secrets are documented in a secrets inventory listing what exists, where it is stored, and how to rotate it
**Plans**: TBD

Plans:
- [ ] 16-01: TBD
- [ ] 16-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 11 -> 12 -> 13 -> 14 -> 15 -> 16
Note: Phase 14 depends on Phase 11 (not 13), so phases 12/13 and 14 could theoretically run in parallel, but serial execution is simpler for a solo developer.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-10 | v1.0 | 51/51 | Complete | 2026-02-09 |
| 11. DNS & Cloudflare Zone Setup + CI/CD Audit | v1.1 | 0/TBD | Not started | - |
| 12. Gateway Infrastructure & Environments | v1.1 | 0/TBD | Not started | - |
| 13. Gateway CI/CD Pipeline | v1.1 | 0/TBD | Not started | - |
| 14. Azure Static Web Apps Provisioning | v1.1 | 0/TBD | Not started | - |
| 15. Frontend CI/CD Pipelines | v1.1 | 0/TBD | Not started | - |
| 16. Deployment Guides & Hardening | v1.1 | 0/TBD | Not started | - |
