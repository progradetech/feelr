---
phase: 28-cicd-migration
plan: 01
subsystem: infra
tags: [github-actions, ci-cd, repository-dispatch, secrets-management]

# Dependency graph
requires:
  - phase: 27-repository-split
    provides: "Public repo (progradetech/feelr) with clean snapshot, separate from cloud repo"
provides:
  - "Public repo cleaned of deployment secrets (only HOMEBREW_TAP_GITHUB_TOKEN remains)"
  - "sync.yml workflow dispatching oss-sync events to feelr-cloud on push to main"
  - "Production environment removed from public repo"
affects: [28-02-PLAN, 28-03-PLAN]

# Tech tracking
tech-stack:
  added: [peter-evans/repository-dispatch@v4]
  patterns: [cross-repo-dispatch-via-repository-dispatch-action]

key-files:
  created:
    - ".github/workflows/sync.yml (on public repo progradetech/feelr)"
  modified: []

key-decisions:
  - "No local commits for Task 1 -- secret/environment deletion is GitHub API only"
  - "sync.yml uses CLOUD_REPO_PAT (not GITHUB_TOKEN) since cross-repo dispatch requires a PAT"
  - "Workflow will silently fail until CLOUD_REPO_PAT secret is created in Plan 03"

patterns-established:
  - "Cross-repo dispatch pattern: public repo push -> repository-dispatch -> cloud repo workflow_dispatch"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 28 Plan 01: Public Repo Cleanup Summary

**Removed 8 deployment secrets and production environment from public repo, added sync.yml cross-repo dispatch workflow using peter-evans/repository-dispatch@v4**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T18:25:14Z
- **Completed:** 2026-02-13T18:26:59Z
- **Tasks:** 2
- **Files modified:** 1 (sync.yml created on public repo)

## Accomplishments
- Deleted 8 deployment secrets (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, DASHBOARD_TOKEN, DOCS_TOKEN, SWA_DASHBOARD_DEPLOYMENT_TOKEN, SWA_DASHBOARD_STAGING_TOKEN, SWA_DOCS_DEPLOYMENT_TOKEN, SWA_DOCS_STAGING_TOKEN)
- Deleted `production` GitHub environment from public repo
- Only `HOMEBREW_TAP_GITHUB_TOKEN` remains (used by release.yml for GoReleaser)
- Created and pushed `sync.yml` workflow that dispatches `oss-sync` event to `progradetech/feelr-cloud` on push to main

## Task Commits

Both tasks operated on the remote GitHub repo (API calls and remote push), not the local working directory:

1. **Task 1: Clean up public repo secrets and environment** - GitHub API operations only (no local commit)
2. **Task 2: Create and push sync.yml dispatch workflow** - `bb530b4` on public repo (ci: add cross-repo sync dispatch to cloud repo)

**Plan metadata:** See final docs commit below

## Files Created/Modified
- `.github/workflows/sync.yml` (on public repo) - Cross-repo dispatch workflow using peter-evans/repository-dispatch@v4

## Decisions Made
- Task 1 involved only GitHub API operations (gh secret delete, gh api DELETE), so no local commit was created
- sync.yml was committed and pushed directly to the public repo's main branch since the local repo has divergent history (fresh snapshot from Phase 27)
- CLOUD_REPO_PAT is intentionally not set yet -- Plan 03 handles PAT creation and secret setup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (CLOUD_REPO_PAT will be set up in Plan 03.)

## Next Phase Readiness
- Public repo is clean: only HOMEBREW_TAP_GITHUB_TOKEN secret, no deployment environments
- sync.yml is in place but dormant until CLOUD_REPO_PAT is created (Plan 03)
- Ready for Plan 02 (cloud repo CI/CD workflows) which operates independently on feelr-cloud
- Plan 03 will wire up the PAT to activate the sync dispatch

## Self-Check: PASSED

- FOUND: 28-01-SUMMARY.md
- FOUND: sync.yml on public repo (progradetech/feelr)
- FOUND: commit bb530b4 on public repo
- PASS: Secret count = 1 (HOMEBREW_TAP_GITHUB_TOKEN only)
- PASS: Environment count = 0

---
*Phase: 28-cicd-migration*
*Completed: 2026-02-13*
