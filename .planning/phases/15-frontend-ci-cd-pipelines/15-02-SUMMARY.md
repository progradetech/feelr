---
phase: 15-frontend-ci-cd-pipelines
plan: 02
subsystem: infra
tags: [github-actions, azure-swa, next-js, ci-cd, static-web-apps]

# Dependency graph
requires:
  - phase: 15-frontend-ci-cd-pipelines
    plan: 01
    provides: "Consolidated gateway.yml pattern, SWA deployment token secrets, turbo.json env-aware cache"
  - phase: 14-azure-swa-provisioning
    provides: "Azure SWA resources for dashboard and docs apps"
provides:
  - "dashboard.yml workflow: staging + production deploys to Azure SWA with environment-aware gateway URL"
  - "docs.yml workflow: staging + production deploys to Azure SWA (no gateway URL)"
  - "Complete three-service independent CI/CD pipeline (gateway + dashboard + docs)"
affects: []

# Tech tracking
tech-stack:
  added: [Azure/static-web-apps-deploy@v1]
  patterns: [one-workflow-per-service, pre-built-swa-deploy, environment-aware-build-vars]

key-files:
  created: [".github/workflows/dashboard.yml", ".github/workflows/docs.yml"]
  modified: []

key-decisions:
  - "Dashboard path triggers include packages/tsconfig/** (shared dependency); docs does not"
  - "Docs workflow has zero gateway URL references (pure content site)"
  - "Production jobs use environment: production for GitHub approval gate"
  - "SWA staging uses deployment_environment: staging; production omits it entirely for default slot"

patterns-established:
  - "One workflow file per service with conditional staging/production jobs via if: on github.ref"
  - "Pre-built static export deployed with skip_app_build: true (no Oryx builder)"
  - "SWA config copied into out/ directory before deploy to ensure routing rules are included"

# Metrics
duration: 1min
completed: 2026-02-10
---

# Phase 15 Plan 02: Frontend Deploy Workflows Summary

**Dashboard and docs Azure SWA deploy workflows with path-based triggers, environment-aware gateway URL for dashboard, and staging/production slots**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-10T16:32:25Z
- **Completed:** 2026-02-10T16:33:58Z
- **Tasks:** 2
- **Files modified:** 2 (2 created)

## Accomplishments
- Dashboard workflow deploys to Azure SWA with different gateway URLs for staging (feelr-gateway-staging.feelr.workers.dev) and production (api.feelr.dev)
- Docs workflow deploys to Azure SWA as a pure content site with zero environment variable injection
- Both workflows use path-based triggers for independent deploys (dashboard changes do not trigger docs deploy and vice versa)
- Complete CI/CD pipeline for all three services: gateway (Cloudflare Workers), dashboard (Azure SWA), docs (Azure SWA)
- Five workflow files now in repository: ci.yml, gateway.yml, dashboard.yml, docs.yml, release.yml

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dashboard.yml workflow** - `c3741c3` (feat)
2. **Task 2: Create docs.yml workflow** - `415bdb9` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `.github/workflows/dashboard.yml` - Dashboard staging + production deploy to Azure SWA with environment-aware NEXT_PUBLIC_GATEWAY_URL
- `.github/workflows/docs.yml` - Docs staging + production deploy to Azure SWA (no gateway URL, pure content site)

## Decisions Made
- Dashboard path triggers include `packages/tsconfig/**` because dashboard extends `@feelr/tsconfig`; docs path triggers only include `apps/docs/**` because docs tsconfig is self-contained
- Production jobs use `environment: production` for GitHub environment approval gate, matching the pattern established in gateway.yml
- SWA staging deploys use `deployment_environment: staging` for named SWA environments; production deploys omit it entirely to deploy to the default production slot
- Both workflows use `skip_app_build: true` to bypass Azure's Oryx builder and deploy pre-built static exports

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - SWA deployment tokens were already set as GitHub repository secrets in Plan 15-01.

## Next Phase Readiness
- All three service workflows are complete: gateway.yml, dashboard.yml, docs.yml
- Phase 15 (Frontend CI/CD Pipelines) is fully complete
- Independent deploys are possible: changes to gateway, dashboard, or docs trigger only their respective workflows
- Production deploys for all services require v* tag + GitHub environment approval

## Self-Check: PASSED

- FOUND: .github/workflows/dashboard.yml
- FOUND: .github/workflows/docs.yml
- FOUND: .planning/phases/15-frontend-ci-cd-pipelines/15-02-SUMMARY.md
- FOUND: c3741c3 (Task 1 commit)
- FOUND: 415bdb9 (Task 2 commit)

---
*Phase: 15-frontend-ci-cd-pipelines*
*Completed: 2026-02-10*
