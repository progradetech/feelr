---
phase: 15-frontend-ci-cd-pipelines
plan: 01
subsystem: infra
tags: [github-actions, turborepo, cloudflare-workers, ci-cd, azure-swa]

# Dependency graph
requires:
  - phase: 13-gateway-cicd-pipeline
    provides: "deploy-staging.yml and deploy-production.yml gateway workflows, ci.yml with shared deploy-staging concurrency group"
  - phase: 14-azure-swa-provisioning
    provides: "SWA deployment tokens for dashboard and docs apps"
provides:
  - "Consolidated gateway.yml workflow (staging + production in one file)"
  - "Turborepo env-aware cache invalidation for NEXT_PUBLIC_GATEWAY_URL"
  - "SWA deployment token secrets in GitHub Actions (SWA_DASHBOARD_DEPLOYMENT_TOKEN, SWA_DOCS_DEPLOYMENT_TOKEN)"
affects: [15-02-PLAN, dashboard.yml, docs.yml]

# Tech tracking
tech-stack:
  added: []
  patterns: [consolidated-workflow-per-service, env-aware-turbo-cache]

key-files:
  created: [".github/workflows/gateway.yml"]
  modified: ["turbo.json"]

key-decisions:
  - "Consolidated deploy-staging.yml + deploy-production.yml into single gateway.yml with conditional jobs"
  - "Preserved deploy-staging concurrency group name (shared with ci.yml gateway-preview)"
  - "NEXT_PUBLIC_GATEWAY_URL added to turbo.json build env for staging/production cache isolation"
  - "GitHub org is progradetech (not andrewprograde) for repository secrets"

patterns-established:
  - "One workflow file per service: gateway.yml handles both staging and production via if-conditions on github.ref"
  - "Turborepo env declarations for build-time environment variables that differ between environments"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 15 Plan 01: Gateway Workflow Consolidation Summary

**Consolidated gateway staging + production deploys into gateway.yml with Turborepo env-aware cache invalidation**

## Performance

- **Duration:** 2 min (excludes checkpoint wait time for human secret setup)
- **Started:** 2026-02-10T16:25:15Z
- **Completed:** 2026-02-10T16:26:50Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 1 modified, 2 deleted)

## Accomplishments
- SWA deployment token secrets configured in GitHub Actions repository (progradetech/feelr) -- unblocks Plan 02 dashboard.yml and docs.yml workflows
- Turborepo build cache now invalidates when NEXT_PUBLIC_GATEWAY_URL changes between staging and production, preventing stale gateway URL in Next.js builds
- Gateway deploy workflows consolidated from two files into one gateway.yml with conditional jobs (staging on push to main, production on tag push)
- Old deploy-staging.yml and deploy-production.yml deleted; workflow directory now contains only ci.yml, gateway.yml, release.yml

## Task Commits

Each task was committed atomically:

1. **Task 1: Set GitHub Actions secrets for SWA deployment tokens** - Human checkpoint (user set secrets via GitHub web UI)
2. **Task 2: Update turbo.json and consolidate gateway workflows** - `0ac90df` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `turbo.json` - Added `env: ["NEXT_PUBLIC_GATEWAY_URL"]` to build task for cache invalidation
- `.github/workflows/gateway.yml` - New consolidated workflow: deploy-staging job (push to main with path filters) + deploy-production job (tag push with gradual rollout)
- `.github/workflows/deploy-staging.yml` - Deleted (consolidated into gateway.yml)
- `.github/workflows/deploy-production.yml` - Deleted (consolidated into gateway.yml)

## Decisions Made
- Consolidated deploy-staging.yml + deploy-production.yml into single gateway.yml with job-level `if:` conditions -- one file per service pattern established for Plan 02 to follow
- Preserved `deploy-staging` concurrency group name exactly (shared with ci.yml gateway-preview per Phase 13 decision)
- GitHub organization confirmed as progradetech (not andrewprograde) for repository secret setup
- NEXT_PUBLIC_GATEWAY_URL declared in turbo.json build env to ensure staging and production builds are never served from same cache entry

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Task 1 required human action: setting SWA_DASHBOARD_DEPLOYMENT_TOKEN and SWA_DOCS_DEPLOYMENT_TOKEN as GitHub Actions repository secrets. User completed this via the GitHub web UI at progradetech/feelr repository settings.

## Next Phase Readiness
- gateway.yml is complete and ready; establishes the one-workflow-per-service pattern
- SWA deployment tokens are set as repository secrets, unblocking Plan 02 (dashboard.yml and docs.yml)
- ci.yml unchanged -- gateway-preview still shares deploy-staging concurrency group with gateway.yml
- Plan 02 can create dashboard.yml and docs.yml following the same consolidated pattern

---
*Phase: 15-frontend-ci-cd-pipelines*
*Completed: 2026-02-10*
