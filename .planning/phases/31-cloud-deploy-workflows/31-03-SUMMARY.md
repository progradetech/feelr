---
phase: 31-cloud-deploy-workflows
plan: 03
subsystem: infra
tags: [nextra, nextjs, azure-swa, static-export, ci-cd, docs]

# Dependency graph
requires:
  - phase: 31-cloud-deploy-workflows
    plan: 02
    provides: "Root turbo.json with out/** outputs and NEXT_PUBLIC env var cache invalidation"
provides:
  - "Verified docs deploy workflow for Azure SWA (staging + production)"
  - "Confirmed docs build produces health page for smoke tests"
affects: [docs-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "No workflow modifications needed -- docs.yml was already correctly configured"
  - "Docs build verified end-to-end with turbo producing static export in oss/apps/docs/out/"

patterns-established: []

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 31 Plan 03: Docs Deploy Workflow Summary

**Docs deploy workflow verified end-to-end: turbo build produces static export with health page, SWA deploy config correct for staging and production**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T14:40:50Z
- **Completed:** 2026-02-17T14:42:27Z
- **Tasks:** 1
- **Files modified:** 0

## Accomplishments
- Verified docs site builds successfully with turbo (17 static pages exported to `oss/apps/docs/out/`)
- Confirmed `health.html` exists in build output for SWA smoke test at `/health`
- Confirmed `staticwebapp.config.json` exists for the "Copy SWA config" workflow step
- Validated `docs.yml` workflow has correct staging (`https://staging-docs.feelr.dev`) and production (`https://feelr.dev`) NEXT_PUBLIC_SITE_URL values
- Validated correct SWA token secrets: `SWA_DOCS_STAGING_TOKEN` for staging, `SWA_DOCS_DEPLOYMENT_TOKEN` for production
- Confirmed no unnecessary env vars (no gateway URL or CF analytics -- docs is pure content)

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify docs build and review workflow configuration** - No commit (verification-only, no files modified)

**Plan metadata:** See final commit below (docs: complete plan)

## Files Created/Modified
None -- verification-only plan, all artifacts were already correctly configured.

## Decisions Made
- No workflow modifications needed -- `docs.yml` was already correctly structured with proper staging/production env vars, SWA tokens, `app_location: oss/apps/docs/out`, and `skip_app_build: true`
- Nextra git timestamp warnings during build are benign (caused by subtree-managed files, does not affect output)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration:**
- `SWA_DOCS_STAGING_TOKEN` - Azure Portal -> Static Web Apps -> feelr-docs-staging -> Manage deployment token
- `SWA_DOCS_DEPLOYMENT_TOKEN` - Azure Portal -> Static Web Apps -> feelr-docs -> Manage deployment token

## Next Phase Readiness
- Docs deploy pipeline verified and ready for deployment
- SWA deployment tokens need to be configured as GitHub secrets before first deploy
- All three deploy workflows (gateway, dashboard, docs) are now verified

## Self-Check: PASSED

- [x] 31-03-SUMMARY.md exists
- [x] docs.yml contains SWA_DOCS_STAGING_TOKEN
- [x] docs.yml contains SWA_DOCS_DEPLOYMENT_TOKEN
- [x] docs.yml contains staging-docs.feelr.dev
- [x] docs.yml contains https://feelr.dev production URL
- [x] oss/apps/docs/staticwebapp.config.json exists

---
*Phase: 31-cloud-deploy-workflows*
*Completed: 2026-02-17*
