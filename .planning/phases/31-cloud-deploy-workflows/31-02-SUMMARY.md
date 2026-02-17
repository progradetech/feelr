---
phase: 31-cloud-deploy-workflows
plan: 02
subsystem: infra
tags: [turbo, nextjs, azure-swa, static-export, ci-cd]

# Dependency graph
requires:
  - phase: 30-pipeline-foundations
    provides: "Lockfile sync and CI pipeline foundations"
provides:
  - "Root turbo.json with out/** outputs for Next.js static export caching"
  - "Root turbo.json with NEXT_PUBLIC env var cache invalidation"
  - "Verified dashboard build and SWA deploy workflow"
affects: [31-cloud-deploy-workflows, dashboard-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: ["turbo env var cache invalidation for Next.js builds"]

key-files:
  created: []
  modified: ["turbo.json"]

key-decisions:
  - "No workflow modifications needed -- dashboard.yml was already correctly structured"
  - "Root turbo.json aligned with oss/turbo.json patterns for out/** and env vars"

patterns-established:
  - "NEXT_PUBLIC env vars in turbo.json build.env for cache invalidation across environments"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 31 Plan 02: Dashboard Deploy Workflow Summary

**Root turbo.json fixed with out/** outputs and NEXT_PUBLIC env var cache invalidation for Next.js static export builds to Azure SWA**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T14:32:03Z
- **Completed:** 2026-02-17T14:33:57Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `out/**` to root turbo.json build outputs for Next.js static export caching
- Added `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`, `NEXT_PUBLIC_SITE_URL` to build.env for turbo cache invalidation
- Verified dashboard builds successfully with turbo producing static export in `oss/apps/dashboard/out/`
- Confirmed health page renders at `/health` for smoke tests
- Validated dashboard.yml workflow has correct env vars, SWA tokens, and app_location paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix root turbo.json for Next.js static export builds** - `3a57052` (fix)
2. **Task 2: Verify dashboard workflow builds and review SWA deploy config** - No commit (verification-only, no files modified)

**Plan metadata:** See final commit below (docs: complete plan)

## Files Created/Modified
- `turbo.json` - Added `out/**` to build outputs and NEXT_PUBLIC env vars to build.env

## Decisions Made
- No workflow modifications needed -- `dashboard.yml` was already correctly structured with proper staging/production env vars, SWA tokens, and app_location paths
- Root `turbo.json` aligned with OSS `turbo.json` patterns (both now have `out/**` in outputs)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration:**
- `SWA_DASHBOARD_STAGING_TOKEN` - Azure Portal -> Static Web Apps -> feelr-dashboard-staging -> Manage deployment token
- `SWA_DASHBOARD_DEPLOYMENT_TOKEN` - Azure Portal -> Static Web Apps -> feelr-dashboard -> Manage deployment token
- `CF_ANALYTICS_TOKEN_STAGING` - Cloudflare Dashboard -> Web Analytics -> staging-app.feelr.dev -> JS snippet token (optional)
- `CF_ANALYTICS_TOKEN_PRODUCTION` - Cloudflare Dashboard -> Web Analytics -> app.feelr.dev -> JS snippet token (optional)

## Next Phase Readiness
- Dashboard build pipeline verified and ready for deployment
- SWA deployment tokens need to be configured as GitHub secrets before first deploy
- CF analytics tokens are optional (dashboard renders without them)

## Self-Check: PASSED

- [x] 31-02-SUMMARY.md exists
- [x] turbo.json has out/** in build outputs
- [x] turbo.json has all 3 NEXT_PUBLIC env vars in build.env
- [x] Commit 3a57052 exists in git log

---
*Phase: 31-cloud-deploy-workflows*
*Completed: 2026-02-17*
