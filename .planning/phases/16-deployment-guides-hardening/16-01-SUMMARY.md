---
phase: 16-deployment-guides-hardening
plan: 01
subsystem: infra
tags: [deployment, runbook, cloudflare-workers, azure-swa, rollback, troubleshooting]

# Dependency graph
requires:
  - phase: 12-gateway-infra
    provides: "Wrangler multi-env configuration, KV/D1/DO resource setup"
  - phase: 13-gateway-cicd
    provides: "Gateway CI/CD workflows, gradual rollout pipeline"
  - phase: 14-frontend-infra
    provides: "Azure SWA provisioning, custom domain setup, DNS configuration"
  - phase: 15-frontend-cicd
    provides: "Dashboard and docs deploy workflows"
provides:
  - "Complete deployment runbook (docs/deployment/RUNBOOK.md)"
  - "First-time setup guide for all Feelr services"
  - "Routine deployment procedures documentation"
  - "Rollback procedures with DO migration constraint warning"
  - "Troubleshooting guide with symptom-cause-fix format"
affects: [16-02, 16-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runbook structure: Prerequisites > First-Time Setup > Routine > Rollback > Troubleshooting"
    - "Reference config files by path rather than hardcoding resource IDs"
    - "Symptom-cause-fix format for troubleshooting entries"

key-files:
  created:
    - docs/deployment/RUNBOOK.md
  modified: []

key-decisions:
  - "Single runbook file rather than per-service docs -- all procedures in one place for discoverability"
  - "Reference wrangler.toml by path for resource IDs rather than duplicating values in documentation"
  - "Prominent DO migration rollback warning in both rollback and production deploy sections"

patterns-established:
  - "docs/deployment/ directory for internal operational documentation"
  - "Last-verified date at top of runbook for staleness detection"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 16 Plan 01: Deployment Runbook Summary

**Comprehensive deployment runbook covering first-time setup, routine deploys, rollback procedures, and troubleshooting for gateway (Cloudflare Workers), dashboard/docs (Azure SWA), and CLI (GoReleaser)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T16:58:43Z
- **Completed:** 2026-02-10T17:01:07Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments

- Created comprehensive deployment runbook consolidating all Phase 12-15 deployment knowledge into a single reference document
- Documented first-time setup covering Cloudflare DNS, gateway resources (KV/D1/DO), Azure SWA provisioning, custom domains, and GitHub Actions secrets
- Documented routine deployment procedures for all four services (gateway, dashboard, docs, CLI) with both automatic CI/CD and manual fallback paths
- Documented rollback procedures with prominent DO migration constraint warning
- Created troubleshooting section covering 12 common scenarios across gateway, SWA, CI/CD, and DNS/SSL

## Task Commits

Each task was committed atomically:

1. **Task 1: Create deployment runbook with first-time setup and routine procedures** - `616f90e` (feat)

## Files Created/Modified

- `docs/deployment/RUNBOOK.md` - Complete deployment runbook with 4 major sections: First-Time Setup, Routine Deployments, Rollback Procedures, and Troubleshooting

## Decisions Made

- Single runbook file rather than per-service docs -- consolidation improves discoverability
- All resource IDs referenced via `apps/gateway/wrangler.toml` path rather than hardcoded values to prevent documentation staleness
- DO migration rollback constraint documented in both the Rollback section (3.1) and the Production Deploy section (2.2) for maximum visibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan creates documentation only.

## Next Phase Readiness

- Runbook is complete and ready for developer use
- Plan 16-02 (deployment scripts and secrets inventory) can proceed -- scripts will complement the runbook procedures
- Plan 16-03 (CI binding validation) can proceed independently

---
*Phase: 16-deployment-guides-hardening*
*Completed: 2026-02-10*
