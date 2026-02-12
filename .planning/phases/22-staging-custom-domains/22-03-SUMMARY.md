---
phase: 22-staging-custom-domains
plan: 03
subsystem: infra
tags: [github-actions, ci-cd, azure-swa, cloudflare-workers, staging, custom-domains, health-checks]

# Dependency graph
requires:
  - phase: 22-01
    provides: "wrangler.toml staging route with workers_dev=false, custom domain config"
  - phase: 22-02
    provides: "Staging banner component and /health endpoints in dashboard and docs"
provides:
  - "Gateway workflow with workflow_dispatch trigger and custom domain health check"
  - "Dashboard workflow deploying staging to separate SWA instance via SWA_DASHBOARD_STAGING_TOKEN"
  - "Docs workflow deploying staging to separate SWA instance via SWA_DOCS_STAGING_TOKEN"
  - "Health check steps for all three staging services on custom domains"
affects: [22-04, production-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate SWA instances for staging (dedicated token, no deployment_environment)"
    - "Custom domain health checks in CI/CD (staging-*.feelr.dev)"

key-files:
  created: []
  modified:
    - ".github/workflows/gateway.yml"
    - ".github/workflows/dashboard.yml"
    - ".github/workflows/docs.yml"

key-decisions:
  - "No deployment_environment for staging SWA deploys (separate instance IS the target)"

patterns-established:
  - "Staging SWA pattern: separate instance + dedicated token + no deployment_environment + custom domain health check"
  - "workflow_dispatch on all deploy workflows for manual re-deploy capability"

# Metrics
duration: 1min
completed: 2026-02-12
---

# Phase 22 Plan 03: CI/CD Workflow Updates Summary

**All three CI/CD workflows updated for staging custom domain deployment with separate SWA instances and health checks**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-12T00:39:41Z
- **Completed:** 2026-02-12T00:41:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Gateway workflow now has workflow_dispatch trigger and health checks staging-api.feelr.dev
- Dashboard staging build points to staging-api.feelr.dev and deploys to separate SWA instance
- Docs staging deploys to separate SWA instance with dedicated token
- All staging health checks use custom domain URLs instead of workers.dev/azurestaticapps.net
- Removed deployment_environment from dashboard and docs staging deploys

## Task Commits

Each task was committed atomically:

1. **Task 1: Update gateway workflow with workflow_dispatch and custom domain health check** - `985c242` (feat)
2. **Task 2: Update dashboard and docs workflows for staging SWA instances with health checks** - `9e1ec6e` (feat)

## Files Created/Modified
- `.github/workflows/gateway.yml` - Added workflow_dispatch trigger; changed staging health check from workers.dev to staging-api.feelr.dev
- `.github/workflows/dashboard.yml` - Changed staging gateway URL to staging-api.feelr.dev; switched to SWA_DASHBOARD_STAGING_TOKEN; removed deployment_environment; added health check for staging-app.feelr.dev
- `.github/workflows/docs.yml` - Switched to SWA_DOCS_STAGING_TOKEN; removed deployment_environment; added health check for staging-docs.feelr.dev

## Decisions Made
None - followed plan as specified

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. (SWA staging tokens and Azure SWA instances are prerequisites from Phase 22 Plan 04 human checkpoint.)

## Next Phase Readiness
- All three workflows are configured for custom domain staging deployment
- Requires SWA_DASHBOARD_STAGING_TOKEN and SWA_DOCS_STAGING_TOKEN GitHub secrets to be set before staging deploys will succeed
- Requires staging SWA instances to be created in Azure Portal (covered by Plan 04 human checkpoint)
- Ready for Plan 04 (final verification/manual setup)

## Self-Check: PASSED

All files exist, all commits verified, all 9 must-have truths confirmed.

---
*Phase: 22-staging-custom-domains*
*Completed: 2026-02-12*
