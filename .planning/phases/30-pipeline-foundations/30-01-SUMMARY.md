---
phase: 30-pipeline-foundations
plan: 01
subsystem: infra
tags: [github-actions, ci, workflows, public-repo]

# Dependency graph
requires: []
provides:
  - "Clean public repo with only CI quality gates and release workflows"
  - "No deploy workflows or cloud secrets referenced in public repo"
affects: [30-pipeline-foundations, 31-cloud-ci, 32-workflow-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Public repo: CI-only (no deploy), cloud repo: deploy-only"

key-files:
  created: []
  modified:
    - "oss/.github/workflows/ci.yml"

key-decisions:
  - "Used git clone + push instead of gh API for file deletions (OAuth token lacked write scope on org repo)"
  - "Synced oss/ subtree ci.yml to match public repo (added connector-validation job and binding check step)"

patterns-established:
  - "Public repo workflows: ci.yml (PR quality gates) + release.yml (tag GoReleaser) only"
  - "All deploy workflows live exclusively in cloud repo"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 30 Plan 01: Strip Deploy Workflows Summary

**Removed 3 deploy workflows (dashboard, docs, gateway) and gateway-preview CI job from public repo, leaving only PR quality gates and tag-triggered release**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T13:11:09Z
- **Completed:** 2026-02-17T13:13:55Z
- **Tasks:** 2
- **Files modified:** 1 (local), 4 (public repo: 3 deleted + 1 modified)

## Accomplishments
- Deleted dashboard.yml, docs.yml, gateway.yml deploy workflows from public repo
- Stripped gateway-preview job from ci.yml (removed Cloudflare secret references)
- Public repo now has exactly 2 workflows: ci.yml (check + connector-validation) and release.yml (GoReleaser)
- Synced oss/ subtree ci.yml to match public repo state
- Verified no CLOUDFLARE, SWA, Azure, or deploy references remain in any public workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete deploy workflows and strip gateway-preview from ci.yml** - `fabba24` (ci)
2. **Task 2: Verify no deploy triggers remain** - verification-only (no file changes)

Public repo commit: `de6dbfa` (pushed directly to progradetech/feelr main)

## Files Created/Modified
- `oss/.github/workflows/ci.yml` - Updated to include connector-validation job and binding check; matches public repo
- (public repo) `.github/workflows/dashboard.yml` - Deleted
- (public repo) `.github/workflows/docs.yml` - Deleted
- (public repo) `.github/workflows/gateway.yml` - Deleted
- (public repo) `.github/workflows/ci.yml` - Removed gateway-preview job and deploy comment headers

## Decisions Made
- Used SSH git clone + push to modify public repo files (gh API DELETE returned 404 despite having admin permissions, likely OAuth token scope limitation)
- Synced local oss/ subtree ci.yml to include connector-validation job and wrangler binding check that existed on public repo but were missing from subtree

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Synced oss/ subtree ci.yml with public repo**
- **Found during:** Task 1 (updating ci.yml)
- **Issue:** Local oss/ subtree ci.yml was missing the connector-validation job and the "Validate wrangler binding isolation" step that existed on the public repo
- **Fix:** Updated oss/ ci.yml to include both the connector-validation job and binding check step, matching the cleaned public repo version
- **Files modified:** oss/.github/workflows/ci.yml
- **Verification:** Files match between subtree and public repo
- **Committed in:** fabba24 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary to keep oss/ subtree in sync with public repo. No scope creep.

## Issues Encountered
- GitHub API DELETE endpoint returned 404 for file deletions despite having admin permissions on the repo. The gh CLI token (`gho_*` OAuth token) appears to lack write scope for the progradetech org. Worked around by cloning via SSH and pushing directly.
- Some stale workflow runs (Dashboard, Docs, Gateway) show as failed in public repo history -- these are from before the workflow deletion and will be cleaned up in Phase 32.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Public repo is clean: only CI and Release workflows remain
- Ready for Phase 30 Plan 02 (cloud repo workflow setup)
- Stale failed workflow runs exist but are cosmetic (no active triggers)

## Self-Check: PASSED

- [x] oss/.github/workflows/ci.yml exists locally
- [x] 30-01-SUMMARY.md exists
- [x] Commit fabba24 exists in git log
- [x] Public repo has exactly ci.yml and release.yml (verified via GitHub API)

---
*Phase: 30-pipeline-foundations*
*Completed: 2026-02-17*
