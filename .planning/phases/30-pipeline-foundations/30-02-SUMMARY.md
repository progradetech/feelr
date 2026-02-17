---
phase: 30-pipeline-foundations
plan: 02
subsystem: infra
tags: [pnpm, lockfile, ci-cd, sync, github-actions, subtree]

# Dependency graph
requires:
  - phase: 29-oss-sync
    provides: "sync.yml workflow and git subtree setup"
provides:
  - "Root pnpm-lock.yaml enabling deterministic installs across all cloud repo workflows"
  - "Fixed sync.yml that regenerates lockfile without corrupting subtree merge commits"
affects: [31-workflow-hardening, 32-release-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate commit for lockfile changes after subtree sync (never amend merge commits)"
    - "Explicit --no-frozen-lockfile for workflows that expect lockfile mutations"

key-files:
  created:
    - pnpm-lock.yaml
  modified:
    - .github/workflows/sync.yml

key-decisions:
  - "Separate lockfile commit instead of amending subtree merge commit to preserve git subtree markers"
  - "Removed pnpm cache from setup-node in sync workflow since lockfile changes during sync"

patterns-established:
  - "Lockfile mutations in CI use --no-frozen-lockfile explicitly; deterministic installs use --frozen-lockfile"
  - "Subtree merge commits are never amended post-creation"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 30 Plan 02: Lockfile & Sync Fix Summary

**Root pnpm-lock.yaml generated for 12 workspace packages and sync.yml fixed to use separate lockfile commits instead of corrupting subtree merge with --amend**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T13:11:15Z
- **Completed:** 2026-02-17T13:13:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Generated root pnpm-lock.yaml covering all 12 workspace packages (oss/ and cloud/)
- Fixed sync.yml to use separate commit for lockfile changes instead of dangerous --amend on subtree merge
- Removed pnpm cache from sync workflow setup-node (lockfile changes make cache unreliable)
- All CI workflows can now use `pnpm install --frozen-lockfile` for deterministic installs

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate root pnpm-lock.yaml** - `63091a0` (chore)
2. **Task 2: Fix sync.yml lockfile handling** - `224b5ef` (fix)

## Files Created/Modified
- `pnpm-lock.yaml` - Root lockfile for cloud repo covering all 12 workspace packages
- `.github/workflows/sync.yml` - Fixed sync workflow: separate lockfile commit, no --amend, explicit --no-frozen-lockfile

## Decisions Made
- Used separate commit for lockfile changes instead of amending subtree merge commit. Rationale: --amend corrupts git subtree markers needed for future subtree pulls, especially with --squash flag.
- Removed `cache: "pnpm"` from setup-node step in sync workflow. Rationale: the lockfile may change after subtree pull, making cached node_modules based on old lockfile unreliable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Root lockfile committed; all deploy workflows (dashboard.yml, docs.yml, gateway.yml) can use --frozen-lockfile
- Sync workflow fixed; OSS changes pulled via subtree will properly regenerate lockfile
- Blocker "Cloud repo has NO pnpm-lock.yaml" is now resolved

## Self-Check: PASSED

All artifacts verified:
- pnpm-lock.yaml: FOUND
- .github/workflows/sync.yml: FOUND
- 30-02-SUMMARY.md: FOUND
- Commit 63091a0: FOUND
- Commit 224b5ef: FOUND

---
*Phase: 30-pipeline-foundations*
*Completed: 2026-02-17*
