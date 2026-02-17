# Roadmap: Feelr

## Milestones

- v1.0 MVP - Phases 1-10 (shipped 2026-02-09)
- v1.1 Deployment & CI/CD - Phases 11-16 (shipped 2026-02-10)
- v1.2 Marketing & Onboarding - Phases 17-21 (shipped 2026-02-11)
- v1.3 Staging & Branding - Phases 22-24 (shipped 2026-02-12)
- v1.4 Open Core - Phases 25-29 (shipped 2026-02-17)
- v1.5 CI/CD Stabilization - Phases 30-32 (in progress)

## v1.5 CI/CD Stabilization

**Milestone Goal:** Make the open-core deployment model fully operational -- public repo does lint/test/build only, cloud repo handles all deployments, end-to-end pipeline verified green.

### Phase 30: Pipeline Foundations
**Goal**: Public repo is clean (CI-only) and cloud repo sync is functional
**Depends on**: Nothing (first phase of v1.5)
**Requirements**: PIPE-01, PIPE-02
**Success Criteria** (what must be TRUE):
  1. Public repo contains only ci.yml and release.yml in .github/workflows/ (no dashboard.yml, docs.yml, gateway.yml)
  2. Pushing to public repo main does NOT trigger any deploy jobs
  3. Running cloud repo sync workflow completes without pnpm-lock.yaml errors
  4. Cloud repo oss/ directory stays in sync with public repo content after sync
**Plans**: 2 plans

Plans:
- [x] 30-01-PLAN.md -- Remove deploy workflows from public repo and strip gateway-preview from ci.yml
- [x] 30-02-PLAN.md -- Generate root pnpm-lock.yaml and fix cloud repo sync workflow

### Phase 31: Cloud Deploy Workflows
**Goal**: All three cloud services deploy successfully from cloud repo
**Depends on**: Phase 30 (sync must work before deploys can use synced code)
**Requirements**: PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. Cloud repo gateway deploy workflow builds and deploys to Cloudflare Workers without errors
  2. Cloud repo dashboard deploy workflow builds and deploys to Azure SWA without errors
  3. Cloud repo docs deploy workflow builds and deploys to Azure SWA without errors
  4. All deploy workflows use secrets that exist only on the cloud repo (no public repo secret dependencies)
**Plans**: TBD

Plans:
- [ ] 31-01: Fix gateway deploy workflow (pnpm/wrangler build chain)
- [ ] 31-02: Fix dashboard deploy workflow (SWA token and build)
- [ ] 31-03: Fix docs deploy workflow (SWA token and build)

### Phase 32: End-to-End Chain Verification
**Goal**: The full public-merge-to-production-deploy chain works and both repos show green
**Depends on**: Phase 30, Phase 31 (all individual workflows must work before chain can be verified)
**Requirements**: CHAIN-01, CHAIN-02, CHAIN-03, CHAIN-04
**Success Criteria** (what must be TRUE):
  1. Merging a PR to public repo main triggers a repository_dispatch event that cloud repo receives
  2. Cloud repo oss-sync workflow runs automatically on dispatch, pulls subtree, generates lockfile, and passes validation
  3. Pushing a tag on cloud repo triggers all 3 service deploys to production and smoke tests pass
  4. GitHub Actions tab on public repo shows all workflows green (no failed or stale runs)
  5. GitHub Actions tab on cloud repo shows all workflows green (no failed or stale runs)
**Plans**: TBD

Plans:
- [ ] 32-01: Verify dispatch and sync chain (public merge triggers cloud sync)
- [ ] 32-02: Verify tag-triggered production deploy with smoke tests
- [ ] 32-03: Clean up stale workflow runs and confirm green boards on both repos

## Progress

**Execution Order:** 30 -> 31 -> 32

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 30. Pipeline Foundations | v1.5 | 2/2 | Complete | 2026-02-17 |
| 31. Cloud Deploy Workflows | v1.5 | 0/3 | Not started | - |
| 32. End-to-End Chain Verification | v1.5 | 0/3 | Not started | - |
