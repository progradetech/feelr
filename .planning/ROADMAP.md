# Roadmap: Feelr

## Milestones

- ✅ **v1.0 MVP** — Phases 1-10 (shipped 2026-02-09) | [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deployment & CI/CD** — Phases 11-16 (shipped 2026-02-10) | [Archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Marketing & Onboarding** — Phases 17-21 (in progress)

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

### 🚧 v1.2 Marketing & Onboarding (In Progress)

**Milestone Goal:** First-time visitors can understand, try, and adopt Feelr without signing up or installing anything -- landing page with interactive demo, demo dashboard mode, correct Homebrew tap, and analytics.

- [x] **Phase 17: CI/CD & Homebrew Migration** (3/3 plans) — completed 2026-02-10
- [x] **Phase 18: Demo Foundation** (2/2 plans) — completed 2026-02-10
- [x] **Phase 19: Dashboard Demo Mode** (2/2 plans) — completed 2026-02-11
- [ ] **Phase 20: Landing Page** — Marketing root page with hero, features, install commands, brand typography, and SEO
- [ ] **Phase 21: Interactive Demo & Integration** — Terminal walkthrough component wired into landing page and transitioning to demo dashboard

## Phase Details

### Phase 17: CI/CD & Homebrew Migration
**Goal**: CI/CD pipeline deploys cleanly and users install Feelr from the correct Homebrew tap
**Depends on**: Nothing (independent ops tasks)
**Requirements**: CICD-01, CICD-02, CICD-03
**Success Criteria** (what must be TRUE):
  1. `wrangler deploy` in staging CI succeeds without KV permission errors
  2. Running `brew install progradetech/feelr/feelr` installs the latest Feelr CLI binary
  3. Running `brew install andrewprograde/feelr/feelr` prints a deprecation message directing users to the new tap
**Plans:** 3 plans

Plans:
- [x] 17-01-PLAN.md — Infrastructure prerequisites: create new tap repo, fix CF token, configure PAT
- [x] 17-02-PLAN.md — GoReleaser config migration and old tap deprecation formula
- [x] 17-03-PLAN.md — Gap closure: fix deprecation formula path (Formula/feelr.rb)

### Phase 18: Demo Foundation
**Goal**: Demo infrastructure exists so that dashboard and terminal features can activate demo mode and receive realistic fake data
**Depends on**: Nothing (uses existing dashboard types)
**Requirements**: DASH-01, DASH-02
**Success Criteria** (what must be TRUE):
  1. A DemoContext React provider is available app-wide, with `isDemo` flag persisted in sessionStorage across page navigations
  2. Mock data fixtures exist for all 4 dashboard data domains (API keys, connectors, usage stats, chain history) and conform to existing TypeScript types
  3. Calling `enterDemo()` from any component sets demo mode; closing the tab or calling `exitDemo()` clears it
**Plans:** 2 plans

Plans:
- [x] 18-01-PLAN.md — DemoContext provider with sessionStorage persistence + Providers wrapper in root layout
- [x] 18-02-PLAN.md — Mock data fixtures for all 5 dashboard data domains + ChainHistoryEntry type

### Phase 19: Dashboard Demo Mode
**Goal**: A visitor in demo mode sees a fully populated, interactive dashboard without any real API keys or backend connection
**Depends on**: Phase 18 (DemoContext + mock data)
**Requirements**: DASH-03, DASH-04, DASH-05, DASH-07
**Success Criteria** (what must be TRUE):
  1. Navigating to the dashboard in demo mode bypasses the AuthGuard login redirect and renders all pages
  2. All 4 dashboard pages (overview, keys, connectors, usage) display realistic mock data from fixtures
  3. A persistent demo banner is visible on every dashboard page indicating the user is in demo mode
  4. Clicking interactive buttons (create key, revoke key) in demo mode shows a toast confirmation and updates local state without API calls
**Plans:** 2 plans

Plans:
- [x] 19-01-PLAN.md — SWR hook demo interception + AuthGuard bypass + navigation redirects
- [x] 19-02-PLAN.md — DemoBanner component + demo mutation interception in key dialogs

### Phase 20: Landing Page
**Goal**: Visitors arriving at app.feelr.dev see a polished marketing page that communicates what Feelr does, how to install it, and what connectors are available
**Depends on**: Phase 17 (correct brew install command needed for install section)
**Requirements**: LAND-01, LAND-02, LAND-03, LAND-04, LAND-05, ANLYT-01
**Success Criteria** (what must be TRUE):
  1. Visiting app.feelr.dev displays a hero section with value proposition and sign-in CTA (not a blank redirect)
  2. Install commands (`brew install progradetech/feelr/feelr` and `feelr init`) are displayed below the sign-in button and copyable
  3. Feature cards for all 4 connectors (GitHub, Slack, Stripe, Discord) and key capabilities are visible on the page
  4. Page uses brand typography (Space Grotesk headings, JetBrains Mono code blocks, Inter body text)
  5. Viewing page source or social share preview shows correct title, description, and Open Graph tags
**Plans:** 2 plans

Plans:
- [ ] 20-01-PLAN.md — Typography, root layout metadata, and Cloudflare Web Analytics integration
- [ ] 20-02-PLAN.md — Landing page content: hero, install commands, connector cards, and SEO metadata

### Phase 21: Interactive Demo & Integration
**Goal**: A visitor can watch an animated terminal demo from the landing page and seamlessly transition into exploring the demo dashboard
**Depends on**: Phase 19 (dashboard demo mode), Phase 20 (landing page)
**Requirements**: DEMO-01, DEMO-02, DEMO-03, DEMO-04, DASH-06
**Success Criteria** (what must be TRUE):
  1. An embedded terminal UI component renders on the landing page with a visible "Try Demo" button
  2. Clicking the demo button plays an animated walkthrough sequence (feelr init, feelr run github.list-repos, JSON response) with realistic typing effects
  3. The terminal walkthrough completes its full sequence in under 30 seconds
  4. After the terminal walkthrough completes, the user is transitioned into the demo dashboard view with demo mode active
**Plans**: TBD

Plans:
- [ ] 21-01: TBD

## Progress

**Execution Order:**
Phases 17-21 execute in numeric order. Phases 18 and 17 have no mutual dependency and could parallelize, but 20 depends on 17 and 19+20 depend on 18.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-10 | v1.0 | 51/51 | Complete | 2026-02-09 |
| 11-16 | v1.1 | 13/13 | Complete | 2026-02-10 |
| 17. CI/CD & Homebrew Migration | v1.2 | 3/3 | Complete | 2026-02-10 |
| 18. Demo Foundation | v1.2 | 2/2 | Complete | 2026-02-10 |
| 19. Dashboard Demo Mode | v1.2 | 2/2 | Complete | 2026-02-11 |
| 20. Landing Page | v1.2 | 0/2 | Not started | - |
| 21. Interactive Demo & Integration | v1.2 | 0/TBD | Not started | - |

**Total:** 21 phases, 68+ plans across 3 milestones.
