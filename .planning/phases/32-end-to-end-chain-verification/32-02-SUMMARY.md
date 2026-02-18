---
phase: 32-end-to-end-chain-verification
plan: 02
subsystem: infra
tags: [github-actions, ci-cd, deploy, smoke-test, production]

# Dependency graph
requires:
  - phase: 32-01
    provides: dispatch workflow triggering cloud repo sync
provides:
  - verified tag-triggered deploy chain for all 4 cloud repo workflows
  - production smoke tests on dashboard and docs deploy jobs
  - documented production deploy procedure (tag push command)
affects: [32-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Production smoke test pattern: jtalk/url-health-check-action@v4 with max-attempts: 5, retry-delay: 10s"

key-files:
  created: []
  modified:
    - .github/workflows/dashboard.yml
    - .github/workflows/docs.yml

key-decisions:
  - "Used same jtalk/url-health-check-action@v4 pattern for production smoke tests as staging"
  - "Production smoke tests use 5 attempts / 10s delay (more tolerant than staging 3/5s)"

patterns-established:
  - "All deploy-production jobs must include post-deploy smoke test step"

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 32 Plan 02: Tag Deploy Chain Verification Summary

**Verified all 4 cloud repo deploy workflows trigger on v* tags with environment protection and production smoke tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T18:33:58Z
- **Completed:** 2026-02-18T18:35:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added production smoke tests to dashboard (app.feelr.dev/health) and docs (feelr.dev/health) deploy workflows
- Verified all 4 workflows (gateway, dashboard, docs, release) trigger on v* tag push
- Confirmed all 7 required deploy secrets present on cloud repo
- Verified all 3 production health endpoints return HTTP 200
- Documented production deploy procedure (tag push triggers all 4 workflows in parallel)

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit all cloud repo deploy workflows for tag trigger correctness** - `c37ed72` (feat)
2. **Task 2: Verify deploy chain readiness and document production deploy procedure** - `60736bb` (chore)

## Files Created/Modified
- `.github/workflows/dashboard.yml` - Added production smoke test step (url-health-check-action targeting app.feelr.dev/health)
- `.github/workflows/docs.yml` - Added production smoke test step (url-health-check-action targeting feelr.dev/health)

## Workflow Audit Results

| Workflow | Tag Trigger | Prod Condition | Environment | Smoke Test | Secrets |
|----------|-------------|----------------|-------------|------------|---------|
| gateway.yml | v* | startsWith(refs/tags/v) | production | api.feelr.dev/health | CF_API_TOKEN, CF_ACCOUNT_ID |
| dashboard.yml | v* | startsWith(refs/tags/v) | production | app.feelr.dev/health (ADDED) | SWA_DASHBOARD_DEPLOYMENT_TOKEN |
| docs.yml | v* | startsWith(refs/tags/v) | production | feelr.dev/health (ADDED) | SWA_DOCS_DEPLOYMENT_TOKEN |
| release.yml | v* | N/A (single job) | N/A | N/A (GoReleaser) | HOMEBREW_TAP_GITHUB_TOKEN |

## Cloud Repo Secrets Status

| Secret | Status |
|--------|--------|
| CLOUDFLARE_API_TOKEN | Present |
| CLOUDFLARE_ACCOUNT_ID | Present |
| SWA_DASHBOARD_STAGING_TOKEN | Present |
| SWA_DASHBOARD_DEPLOYMENT_TOKEN | Present |
| SWA_DOCS_STAGING_TOKEN | Present |
| SWA_DOCS_DEPLOYMENT_TOKEN | Present |
| HOMEBREW_TAP_GITHUB_TOKEN | Present |
| CF_ANALYTICS_TOKEN_STAGING | Missing (non-blocking, known) |
| CF_ANALYTICS_TOKEN_PRODUCTION | Missing (non-blocking, known) |

## Production Health Check Results

| Service | URL | Status |
|---------|-----|--------|
| Gateway | api.feelr.dev/health | 200 |
| Dashboard | app.feelr.dev/health | 200 |
| Docs | feelr.dev/health | 200 |

## Production Deploy Procedure

When ready to deploy to production, push a version tag to the cloud repo:

```bash
git tag v1.5.0 && git push origin v1.5.0
```

This triggers all 4 workflows in parallel:
- **Gateway** (gateway.yml deploy-production): Deploys to Cloudflare Workers production
- **Dashboard** (dashboard.yml deploy-production): Deploys to Azure SWA production
- **Docs** (docs.yml deploy-production): Deploys to Azure SWA production
- **Release** (release.yml): GoReleaser builds CLI binaries + updates Homebrew tap

No existing tags on cloud repo -- first tag push will be the initial coordinated production deploy.

## Decisions Made
- Used same jtalk/url-health-check-action@v4 pattern for production smoke tests as staging (consistency)
- Production smoke tests use 5 attempts / 10s delay (more tolerant than staging 3/5s to account for cold starts)
- release.yml does not need environment protection or smoke test (GoReleaser is a build-and-release, not a deploy)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added production smoke tests to dashboard and docs workflows**
- **Found during:** Task 1 (workflow audit)
- **Issue:** Dashboard and docs deploy-production jobs had no post-deploy health check
- **Fix:** Added jtalk/url-health-check-action@v4 steps matching the pattern used in staging jobs
- **Files modified:** .github/workflows/dashboard.yml, .github/workflows/docs.yml
- **Verification:** Workflow YAML validated, smoke test steps present
- **Committed in:** c37ed72 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** This was explicitly called out in the plan as expected work. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tag deploy chain verified ready for production tag push
- Plan 32-03 can proceed to verify the full end-to-end chain (dispatch -> sync -> staging -> tag -> production)
- CF_ANALYTICS_TOKEN_STAGING and CF_ANALYTICS_TOKEN_PRODUCTION still not configured (non-blocking)

## Self-Check: PASSED

All files and commits verified:
- .github/workflows/dashboard.yml: FOUND
- .github/workflows/docs.yml: FOUND
- 32-02-SUMMARY.md: FOUND
- Commit c37ed72: FOUND
- Commit 60736bb: FOUND

---
*Phase: 32-end-to-end-chain-verification*
*Completed: 2026-02-18*
