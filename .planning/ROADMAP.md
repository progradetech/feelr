# Roadmap: Feelr

## Milestones

- ✅ **v1.0 MVP** — Phases 1-10 (shipped 2026-02-09) | [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deployment & CI/CD** — Phases 11-16 (shipped 2026-02-10) | [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Marketing & Onboarding** — Phases 17-21 (shipped 2026-02-11) | [Archive](milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Staging & Branding** — Phases 22-24 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-10) — SHIPPED 2026-02-09</summary>

- [x] Phase 1: Edge Gateway Foundation (3/3 plans) — completed 2026-02-05
- [x] Phase 2: Auth Vault (5/5 plans) — completed 2026-02-06
- [x] Phase 3: GitHub Connector (4/4 plans) — completed 2026-02-06
- [x] Phase 4: CLI Core (5/5 plans) — completed 2026-02-06
- [x] Phase 5: OAuth Connectors (6/6 plans) — completed 2026-02-06
- [x] Phase 6: Dashboard (5/5 plans) — completed 2026-02-07
- [x] Phase 7: Production Hardening (5/5 plans) — completed 2026-02-07
- [x] Phase 8: Composable Actions (7/7 plans) — completed 2026-02-07
- [x] Phase 9: Self-Hosting (7/7 plans) — completed 2026-02-09
- [x] Phase 10: Launch Prep (4/4 plans) — completed 2026-02-09

</details>

<details>
<summary>✅ v1.1 Deployment & CI/CD (Phases 11-16) — SHIPPED 2026-02-10</summary>

- [x] Phase 11: DNS & Cloudflare Zone Setup + CI/CD Audit (2/2 plans) — completed 2026-02-09
- [x] Phase 12: Gateway Infrastructure & Environments (2/2 plans) — completed 2026-02-10
- [x] Phase 13: Gateway CI/CD Pipeline (2/2 plans) — completed 2026-02-10
- [x] Phase 14: Azure Static Web Apps Provisioning (2/2 plans) — completed 2026-02-10
- [x] Phase 15: Frontend CI/CD Pipelines (2/2 plans) — completed 2026-02-10
- [x] Phase 16: Deployment Guides & Hardening (3/3 plans) — completed 2026-02-10

</details>

<details>
<summary>✅ v1.2 Marketing & Onboarding (Phases 17-21) — SHIPPED 2026-02-11</summary>

- [x] Phase 17: CI/CD & Homebrew Migration (3/3 plans) — completed 2026-02-10
- [x] Phase 18: Demo Foundation (2/2 plans) — completed 2026-02-10
- [x] Phase 19: Dashboard Demo Mode (2/2 plans) — completed 2026-02-11
- [x] Phase 20: Landing Page (2/2 plans) — completed 2026-02-11
- [x] Phase 21: Interactive Demo & Integration (2/2 plans) — completed 2026-02-11

</details>

### 🚧 v1.3 Staging & Branding (In Progress)

**Milestone Goal:** Add staging custom domains for all three services and integrate Feelr logo/branding assets across dashboard and docs.

- [x] **Phase 22: Staging Custom Domains** — All three services accessible via staging-*.feelr.dev with CI/CD automation — completed 2026-02-12
- [x] **Phase 23: Favicon & Manifest** — Browser tabs, home screens, and web manifest show Feelr branding — completed 2026-02-12
- [ ] **Phase 24: Logo Integration** — Feelr logomark replaces text in dashboard sidebar, docs navbar, and landing page

## Phase Details

### Phase 22: Staging Custom Domains
**Goal**: Developers can access all three staging services via custom subdomains under feelr.dev
**Depends on**: Phase 21 (v1.2 complete — existing CI/CD and Azure SWA infrastructure)
**Requirements**: STAGE-01, STAGE-02, STAGE-03, STAGE-04, STAGE-05, STAGE-06, STAGE-07
**Success Criteria** (what must be TRUE):
  1. Visiting staging-api.feelr.dev returns a response from the staging gateway (not production)
  2. Visiting staging-app.feelr.dev loads the dashboard connected to the staging gateway
  3. Visiting staging-docs.feelr.dev loads the docs site
  4. Pushing to main branch triggers CI/CD that deploys all three services to their staging custom domains
  5. Staging and production services remain fully isolated (different SWA instances, different Worker environments)
**Plans**: 4 plans

Plans:
- [x] 22-01-PLAN.md — Gateway staging custom domain + verbose error responses
- [x] 22-02-PLAN.md — Staging banner + health check pages
- [x] 22-03-PLAN.md — CI/CD workflow updates for staging custom domains
- [x] 22-04-PLAN.md — Infrastructure provisioning + end-to-end verification

### Phase 23: Favicon & Manifest
**Goal**: Both apps display the Feelr logomark in browser tabs, home screens, and metadata
**Depends on**: Phase 22 (staging domains available for verifying branding changes before production)
**Requirements**: ICON-01, ICON-02, ICON-03, ICON-04, ICON-05, LOGO-04
**Success Criteria** (what must be TRUE):
  1. Browser tab shows the Feelr logomark as favicon on both dashboard and docs site
  2. Adding the dashboard or docs to a mobile home screen shows the Feelr apple-touch-icon
  3. SVG favicon renders correctly in both light and dark browser themes
  4. Web manifest at /manifest.webmanifest provides app name "Feelr", Lobster Red theme color, and multiple icon sizes
  5. metadataBase resolves to the correct URL for the current environment (staging-app vs app, staging-docs vs feelr.dev)
**Plans**: 2 plans

Plans:
- [x] 23-01-PLAN.md — Icon asset generation script + adaptive SVG favicon
- [x] 23-02-PLAN.md — Web manifests, metadataBase, viewport themeColor, CI env vars

### Phase 24: Logo Integration
**Goal**: Feelr logomark is visually present in the key navigation and marketing surfaces of both apps
**Depends on**: Phase 23 (icon assets generated and available in the codebase)
**Requirements**: LOGO-01, LOGO-02, LOGO-03
**Success Criteria** (what must be TRUE):
  1. Dashboard sidebar displays the Feelr logomark image instead of the "Feelr" text
  2. Docs site navbar displays the Feelr logo instead of bold "Feelr" text
  3. Landing page hero section includes the Feelr logo above or alongside the headline
**Plans**: TBD

Plans:
- [ ] 24-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 22 → 23 → 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-10 | v1.0 | 51/51 | Complete | 2026-02-09 |
| 11-16 | v1.1 | 13/13 | Complete | 2026-02-10 |
| 17-21 | v1.2 | 11/11 | Complete | 2026-02-11 |
| 22. Staging Custom Domains | v1.3 | 4/4 | Complete | 2026-02-12 |
| 23. Favicon & Manifest | v1.3 | 2/2 | Complete | 2026-02-12 |
| 24. Logo Integration | v1.3 | 0/TBD | Not started | - |

**Total:** 24 phases, 75+ plans across 4 milestones.
