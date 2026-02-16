# Roadmap: Feelr

## Milestones

- ✅ **v1.0 MVP** — Phases 1-10 (shipped 2026-02-09) | [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deployment & CI/CD** — Phases 11-16 (shipped 2026-02-10) | [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Marketing & Onboarding** — Phases 17-21 (shipped 2026-02-11) | [Archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Staging & Branding** — Phases 22-24 (shipped 2026-02-12) | [Archive](milestones/v1.3-ROADMAP.md)
- 🚧 **v1.4 Open Core** — Phases 25-29 (in progress)

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

<details>
<summary>✅ v1.3 Staging & Branding (Phases 22-24) — SHIPPED 2026-02-12</summary>

- [x] Phase 22: Staging Custom Domains (4/4 plans) — completed 2026-02-12
- [x] Phase 23: Favicon & Manifest (2/2 plans) — completed 2026-02-12
- [x] Phase 24: Logo Integration (1/1 plan) — completed 2026-02-12

</details>

### 🚧 v1.4 Open Core (In Progress)

**Milestone Goal:** Restructure Feelr into an open-core model with a public MIT-licensed repo for community contributions and a private cloud overlay repo for billing and hosted deployment.

**Phases are strictly sequential** -- each gates the next. Cannot split before billing is extracted, cannot migrate CI before repos exist, cannot build community tooling before CI works.

- [x] **Phase 25: Pre-Split Audit & Cleanup** - Verify the codebase is safe to make public — completed 2026-02-13
- [x] **Phase 26: Billing Interface Extraction** - Decouple billing from gateway via provider pattern — completed 2026-02-13
- [x] **Phase 27: Repository Split** - Create public and private repos with subtree integration — completed 2026-02-13
- [x] **Phase 28: CI/CD Migration** - Establish split CI pipelines and cross-repo sync automation — completed 2026-02-16
- [ ] **Phase 29: Community Contribution Infrastructure** - Enable self-service connector development by external contributors

## Phase Details

### Phase 25: Pre-Split Audit & Cleanup
**Goal**: The codebase is verified safe to publish -- no secrets, credentials, or sensitive internal documents would be exposed by making the repository public
**Depends on**: Phase 24 (v1.3 complete)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Success Criteria** (what must be TRUE):
  1. Gitleaks/truffleHog scan produces zero findings against the codebase snapshot intended for the public repo
  2. `git ls-files | grep '\.env'` returns no results -- no .env files are tracked in git
  3. `.gitignore` contains `**/.env` pattern and correctly excludes env files at any depth
  4. A documented secrets inventory exists identifying every credential, token, and sensitive file, with a decision recorded for each (rotate, exclude, or safe-to-publish)
**Plans:** 3 plans
Plans:
- [x] 25-01-PLAN.md -- Install Gitleaks, run initial audit scans, create allowlist config
- [x] 25-02-PLAN.md -- Harden .gitignore with **/.env, update secrets inventory with public release audit
- [x] 25-03-PLAN.md -- Final Gitleaks validation scan, verify all success criteria

### Phase 26: Billing Interface Extraction
**Goal**: Billing logic is decoupled from the gateway behind a pluggable provider interface, so the gateway runs with zero Stripe dependencies when no billing provider is registered
**Depends on**: Phase 25
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05
**Success Criteria** (what must be TRUE):
  1. Gateway starts and serves requests with `NoopBillingProvider` (no Stripe key, no Stripe dependency) -- all existing endpoint tests pass
  2. `StripeBillingProvider` is isolated in its own module with zero imports from gateway core -- can be deleted without breaking the build
  3. `package.json` for the gateway app does not list `stripe` as a dependency (direct or peer)
  4. Dashboard billing UI components (pricing page, subscription management, usage meters) are extracted into a separate package that does not exist in the public codebase
  5. A boundary check script confirms no references to `stripe`, `STRIPE_SECRET_KEY`, or billing-specific imports exist outside the designated provider module and extracted dashboard package
**Plans:** 3 plans
Plans:
- [x] 26-01-PLAN.md -- Create BillingProvider interface, NoopBillingProvider, and billing middleware
- [x] 26-02-PLAN.md -- Extract StripeBillingProvider, remove stripe dependency, clean AppEnv
- [x] 26-03-PLAN.md -- Validate dashboard, create boundary check script, final validation

### Phase 27: Repository Split
**Goal**: Two functional repositories exist -- `progradetech/feelr` (public, MIT) contains the complete open-source product, and `progradetech/feelr-cloud` (private) layers the billing overlay via git subtree
**Depends on**: Phase 26
**Requirements**: SPLIT-01, SPLIT-02, SPLIT-03, SPLIT-04, SPLIT-05, SPLIT-06, SPLIT-07
**Success Criteria** (what must be TRUE):
  1. `progradetech/feelr` is a public GitHub repo with MIT license containing gateway, connectors, CLI, self-host, and docs -- buildable and testable standalone with `pnpm install && pnpm test`
  2. `progradetech/feelr-cloud` is a private GitHub repo with the public repo embedded at `oss/` via `git subtree add --prefix=oss --squash`
  3. Cloud repo's `gateway-entry.ts` imports the OSS Hono app, registers `StripeBillingProvider`, and the combined gateway starts and serves requests with billing enforced
  4. Cloud repo's `pnpm-workspace.yaml` references both `oss/*` and `cloud/*` packages, and `pnpm install && pnpm build` succeeds across the unified workspace
  5. Public repo builds and tests pass independently (no cloud dependency), and cloud repo builds and tests pass with the overlay (no missing imports)
**Plans:** 3 plans
Plans:
- [x] 27-01-PLAN.md -- Prepare public snapshot (rsync exclusions, strip wrangler.toml, fix GoReleaser, public CI)
- [x] 27-02-PLAN.md -- Create GitHub repos, push snapshot, setup git subtree
- [x] 27-03-PLAN.md -- Cloud overlay files (gateway-entry.ts, wrangler.cloud.toml, workspace) + build verification

### Phase 28: CI/CD Migration
**Goal**: Both repositories have working CI/CD -- public repo gives contributors fast test feedback without exposing secrets, private repo handles deployment, and merges to public main automatically sync into the cloud repo
**Depends on**: Phase 27
**Requirements**: CICD-01, CICD-02, CICD-03, CICD-04, CICD-05, CICD-06
**Success Criteria** (what must be TRUE):
  1. A PR opened against `progradetech/feelr` triggers lint, typecheck, and test jobs that pass -- no deployment secrets or deploy workflows exist in the public repo
  2. A merge to `progradetech/feelr` main triggers a `repository_dispatch` event that causes `progradetech/feelr-cloud` to automatically run `git subtree pull --prefix=oss --squash`, build, test, and push to its own main
  3. Cloud repo CI deploys gateway (staging + production), dashboard, and docs via existing workflows -- staging deploy succeeds from cloud repo
  4. GoReleaser builds the CLI binary from `oss/cli/` path in the cloud repo -- `goreleaser build --snapshot` succeeds
  5. Fine-grained PAT scoped to `feelr-cloud` with `contents:write` + `metadata:read` is stored as `CLOUD_REPO_PAT` in the public repo secrets
**Plans:** 3 plans
Plans:
- [x] 28-01-PLAN.md -- Public repo secret cleanup and cross-repo sync dispatch workflow
- [x] 28-02-PLAN.md -- Cloud repo sync, deploy, and release workflows
- [x] 28-03-PLAN.md -- PAT and secrets configuration with end-to-end verification

### Phase 29: Community Contribution Infrastructure
**Goal**: An external contributor can discover available connector work, scaffold a new connector from a template, develop and test it locally, and submit a PR that is automatically validated for SDK compliance
**Depends on**: Phase 28
**Requirements**: COMM-01, COMM-02, COMM-03, COMM-04, COMM-05, COMM-06, COMM-07, COMM-08
**Success Criteria** (what must be TRUE):
  1. Running `pnpm create-connector <name>` in the public repo generates a working connector scaffold with correct directory structure, SDK imports, auth type stubs, and passing placeholder tests
  2. A connector PR triggers a validation CI job that checks SDK contract compliance (correct exports), dependency restrictions (only `@feelr/connector-sdk`), and test coverage -- failing connectors get clear error messages
  3. The public repo has issue templates (connector-request, bug-report, feature-request) and a PR template with SDK compliance checklist -- new issues use structured forms
  4. CONTRIBUTING.md contains a complete connector development guide covering all auth types (API key, OAuth2, token), testing patterns, and response normalization rules
  5. The Nextra docs site has a developer section with SDK reference, "Your First Connector" tutorial, and at least 3 pre-seeded "good first issue" connector requests for well-documented APIs
**Plans**: TBD

## Coverage

**30 requirements mapped across 5 phases -- 100% coverage, zero orphans.**

| Requirement | Phase | Category |
|-------------|-------|----------|
| AUDIT-01 | 25 | Pre-Split Audit |
| AUDIT-02 | 25 | Pre-Split Audit |
| AUDIT-03 | 25 | Pre-Split Audit |
| AUDIT-04 | 25 | Pre-Split Audit |
| BILL-01 | 26 | Billing Extraction |
| BILL-02 | 26 | Billing Extraction |
| BILL-03 | 26 | Billing Extraction |
| BILL-04 | 26 | Billing Extraction |
| BILL-05 | 26 | Billing Extraction |
| SPLIT-01 | 27 | Repository Split |
| SPLIT-02 | 27 | Repository Split |
| SPLIT-03 | 27 | Repository Split |
| SPLIT-04 | 27 | Repository Split |
| SPLIT-05 | 27 | Repository Split |
| SPLIT-06 | 27 | Repository Split |
| SPLIT-07 | 27 | Repository Split |
| CICD-01 | 28 | CI/CD Migration |
| CICD-02 | 28 | CI/CD Migration |
| CICD-03 | 28 | CI/CD Migration |
| CICD-04 | 28 | CI/CD Migration |
| CICD-05 | 28 | CI/CD Migration |
| CICD-06 | 28 | CI/CD Migration |
| COMM-01 | 29 | Community |
| COMM-02 | 29 | Community |
| COMM-03 | 29 | Community |
| COMM-04 | 29 | Community |
| COMM-05 | 29 | Community |
| COMM-06 | 29 | Community |
| COMM-07 | 29 | Community |
| COMM-08 | 29 | Community |

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-10 | v1.0 | 51/51 | Complete | 2026-02-09 |
| 11-16 | v1.1 | 13/13 | Complete | 2026-02-10 |
| 17-21 | v1.2 | 11/11 | Complete | 2026-02-11 |
| 22-24 | v1.3 | 7/7 | Complete | 2026-02-12 |
| 25 | v1.4 | 3/3 | Complete | 2026-02-13 |
| 26 | v1.4 | 3/3 | Complete | 2026-02-13 |
| 27 | v1.4 | 3/3 | Complete | 2026-02-13 |
| 28 | v1.4 | 3/3 | Complete | 2026-02-16 |
| 29 | v1.4 | 0/TBD | Not started | - |

**Total:** 29 phases, 88+ plans across 5 milestones.
