---
phase: 13-gateway-cicd-pipeline
plan: 02
subsystem: infra
tags: [github-actions, cloudflare-workers, wrangler, gradual-rollout, ci-cd, smoke-test]

# Dependency graph
requires:
  - phase: 12-gateway-infrastructure-environments
    provides: "Multi-environment wrangler.toml with staging (workers_dev) and production (api.feelr.dev)"
  - phase: 13-gateway-cicd-pipeline (plan 01)
    provides: "ci.yml PR workflow sharing deploy-staging concurrency group"
provides:
  - "Staging deployment workflow triggered on push to main with smoke test"
  - "Production deployment workflow triggered on v* tags with gradual rollout (10% -> 100%)"
  - "GitHub environment approval gate for production deployments"
  - "Concurrency controls preventing staging and production deployment races"
affects: [dashboard-cicd, self-hosting]

# Tech tracking
tech-stack:
  added: [cloudflare/wrangler-action@v3, jtalk/url-health-check-action@v4]
  patterns: [gradual-rollout-via-versions-api, concurrency-group-serialization, path-filtered-deploy-triggers]

key-files:
  created:
    - .github/workflows/deploy-staging.yml
    - .github/workflows/deploy-production.yml
  modified: []

key-decisions:
  - "Same deploy-staging concurrency group shared with ci.yml gateway-preview to prevent staging races (Pitfall 4)"
  - "Automatic 10% -> smoke test -> 100% gradual rollout (not manual promotion)"
  - "versions upload + versions deploy for production (not wrangler deploy) to enable traffic splitting"
  - "DO migration releases must bypass gradual rollout and use wrangler deploy --env production directly"

patterns-established:
  - "Deployment workflows use cancel-in-progress: false to queue rather than cancel mid-flight"
  - "Path filters (apps/gateway, packages, connectors) scope deploy triggers to gateway-relevant changes"
  - "Production deploys require GitHub environment approval before execution"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 13 Plan 02: Deployment Workflows Summary

**Staging and production deployment workflows with smoke tests, gradual rollouts (10% canary -> 100%), and GitHub environment approval gates**

## Performance

- **Duration:** 2 min (excludes human checkpoint wait time for secrets/environment configuration)
- **Started:** 2026-02-10T02:46:00Z
- **Completed:** 2026-02-10T03:12:50Z
- **Tasks:** 3 (2 automated + 1 human-action checkpoint)
- **Files created:** 2

## Accomplishments
- Staging deployment workflow: auto-deploys gateway on push to main with path filtering and post-deploy smoke test
- Production deployment workflow: gradual rollout on v* tag push with 10% canary, smoke test, then 100% promotion
- GitHub environment approval gate on production deploys (required reviewer + v* tag restriction)
- Concurrency controls on both workflows preventing deployment races
- Cloudflare API token and account ID configured as GitHub repository secrets

## Task Commits

Each task was committed atomically:

1. **Task 1: Create staging deployment workflow with smoke test** - `9e82aa8` (feat)
2. **Task 2: Create production deployment workflow with gradual rollout and approval gate** - `1ff9a7c` (feat)
3. **Task 3: Configure GitHub repository secrets and production environment** - human-action checkpoint (no commit; GitHub web UI configuration)

## Files Created/Modified
- `.github/workflows/deploy-staging.yml` - Push-to-main staging deploy with wrangler-action and health check smoke test
- `.github/workflows/deploy-production.yml` - Tag-triggered production deploy with versions upload, 10% canary, smoke test, 100% promotion

## Decisions Made
- **Shared concurrency group:** deploy-staging group is shared between ci.yml gateway-preview job and deploy-staging.yml to prevent PR preview deploys and main-branch deploys from racing (Pitfall 4 from research)
- **Automatic promotion:** 10% -> smoke test -> 100% is fully automatic in the workflow; manual percentage control available via CLI if needed
- **versions upload/deploy pattern:** Production uses the versioned API (not wrangler deploy) to enable traffic splitting; documented constraint that DO migration releases must use direct deploy
- **Same v* tag trigger as release.yml:** Both GoReleaser CLI release and gateway production deploy run independently on the same tag push with separate concurrency groups

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Completed during Task 3 checkpoint:
- CLOUDFLARE_API_TOKEN added as GitHub repository secret (Workers edit, Account read, D1 edit, DNS edit permissions)
- CLOUDFLARE_ACCOUNT_ID added as GitHub repository secret
- GitHub "production" environment created with required reviewer and v* tag restriction

## Next Phase Readiness
- Full CI/CD pipeline complete: PR checks (ci.yml), staging deploy (deploy-staging.yml), production deploy (deploy-production.yml)
- Phase 13 is fully complete (both plans done)
- Ready for Phase 14 (Dashboard deployment) or next milestone phase

## Self-Check: PASSED

- [x] `.github/workflows/deploy-staging.yml` exists
- [x] `.github/workflows/deploy-production.yml` exists
- [x] `13-02-SUMMARY.md` exists
- [x] Commit `9e82aa8` (Task 1) found in git log
- [x] Commit `1ff9a7c` (Task 2) found in git log

---
*Phase: 13-gateway-cicd-pipeline*
*Completed: 2026-02-10*
