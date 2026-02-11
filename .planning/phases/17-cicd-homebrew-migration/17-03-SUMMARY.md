---
phase: 17-cicd-homebrew-migration
plan: 03
subsystem: infra
tags: [homebrew, tap, deprecation, formula-path, gap-closure]

# Dependency graph
requires:
  - phase: 17-02
    provides: "Deprecation formula in andrewprograde/homebrew-feelr (at wrong path)"
provides:
  - "Deprecation formula correctly located at Formula/feelr.rb in andrewprograde/homebrew-feelr"
  - "Homebrew tap discovery works for brew tap andrewprograde/feelr"
affects: [release-workflow, homebrew-install-path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Homebrew tap formulas must be in Formula/ directory (not root) for tap discovery"

key-files:
  created: []
  modified:
    - "andrewprograde/homebrew-feelr/Formula/feelr.rb (moved from root, external repo)"

key-decisions:
  - "API verification accepted as sufficient for Homebrew tap discovery (programmatic check confirmed correct path and 404 on old path)"

patterns-established:
  - "Homebrew formula path convention: always Formula/<name>.rb, never root level"

# Metrics
duration: 1min
completed: 2026-02-11
---

# Phase 17 Plan 03: Gap Closure - Deprecation Formula Path Fix Summary

**Moved deprecation formula from root to Formula/feelr.rb in andrewprograde/homebrew-feelr for correct Homebrew tap discovery**

## Performance

- **Duration:** ~1 min (excludes human checkpoint wait time)
- **Started:** 2026-02-11T02:00:00Z
- **Completed:** 2026-02-11T02:05:52Z
- **Tasks:** 2
- **Files modified:** 1 (external repo: andrewprograde/homebrew-feelr)

## Accomplishments

- Moved deprecation formula from root (`feelr.rb`) to correct Homebrew tap path (`Formula/feelr.rb`) in andrewprograde/homebrew-feelr
- Verified via GitHub API that Formula/feelr.rb returns 200 and root-level feelr.rb returns 404
- Closed Gap 1 (blocker) from Phase 17 verification report

## Task Commits

1. **Task 1: Move deprecation formula to Formula/ directory** - `fe495cb` (fix, remote repo andrewprograde/homebrew-feelr)
2. **Task 2: Verify Homebrew tap discovers the deprecation formula** - No commit (checkpoint:human-verify, user approved)

**Plan metadata:** See final commit below.

## Files Created/Modified

- `andrewprograde/homebrew-feelr/Formula/feelr.rb` (external repo) - Deprecation formula moved from root to Formula/ directory; content unchanged (deprecate! directive, odie install block, caveats migration instructions)

## Decisions Made

- **API verification accepted as sufficient:** User approved programmatic GitHub API check confirming Formula/feelr.rb exists at correct path and root-level feelr.rb returns 404, in lieu of local Homebrew CLI testing

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no additional external service configuration required.

## Gap Closure Status

This plan was created to address gaps found in Phase 17 verification:

| Gap | Status | Resolution |
|-----|--------|------------|
| Gap 1: Formula wrong path (BLOCKER) | CLOSED | Moved to Formula/feelr.rb, verified via API |
| Gap 2: CF token unverified (DEFERRED) | UNCHANGED | Still deferred to next gateway deploy |
| Gap 3: New tap empty (EXPECTED) | UNCHANGED | Expected state; GoReleaser publishes on next release |

## Next Phase Readiness

- Phase 17 (CI/CD & Homebrew Migration) is now fully complete with all actionable gaps closed
- Remaining deferred items (CF token verification, new tap first formula) resolve naturally on next deploy/release
- Ready for Phase 18 (Demo Foundation) planning

## Self-Check: PASSED

- FOUND: 17-03-SUMMARY.md
- FOUND: 17-03-PLAN.md
- FOUND: 17-02-SUMMARY.md (dependency)
- FOUND: Formula/feelr.rb in remote repo andrewprograde/homebrew-feelr (GitHub API confirmed)
- Task 1 commit fe495cb is in remote repo andrewprograde/homebrew-feelr
- Task 2 checkpoint approved by user (API verification accepted)

---
*Phase: 17-cicd-homebrew-migration*
*Completed: 2026-02-11*
