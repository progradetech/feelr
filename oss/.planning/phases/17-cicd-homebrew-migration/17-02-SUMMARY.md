---
phase: 17-cicd-homebrew-migration
plan: 02
subsystem: infra
tags: [homebrew, goreleaser, ci-cd, tap-migration, deprecation]

# Dependency graph
requires:
  - phase: 17-01
    provides: "progradetech/homebrew-feelr repo, HOMEBREW_TAP_GITHUB_TOKEN secret, CF token fix"
provides:
  - "GoReleaser config targeting progradetech/homebrew-feelr for formula publishing"
  - "Deprecation formula in andrewprograde/homebrew-feelr directing users to new tap"
affects: [release-workflow, homebrew-install-path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Homebrew tap deprecation via deprecate! directive with caveats migration instructions"
    - "GoReleaser brews.repository.owner set to progradetech for all future releases"

key-files:
  created:
    - "andrewprograde/homebrew-feelr Formula/feelr.rb (deprecation formula, external repo)"
  modified:
    - ".goreleaser.yaml (owner: andrewprograde -> progradetech)"

key-decisions:
  - "Deprecation formula uses odie to block install with migration instructions (no working binary since no prior release existed)"
  - "CF token fix verification deferred to next gateway deploy (no code change to trigger pipeline in this plan)"

patterns-established:
  - "Homebrew tap migration pattern: update GoReleaser owner + deprecate old tap with caveats"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 17 Plan 02: GoReleaser Config & Tap Deprecation Summary

**GoReleaser Homebrew tap owner migrated to progradetech with deprecation formula in old andrewprograde tap**

## Performance

- **Duration:** 2 min (excludes human checkpoint wait time)
- **Started:** 2026-02-11T00:40:00Z
- **Completed:** 2026-02-11T00:53:55Z
- **Tasks:** 3
- **Files modified:** 1 (local) + 1 (external repo)

## Accomplishments

- Updated `.goreleaser.yaml` to publish Homebrew formula to progradetech/homebrew-feelr on future releases
- Created deprecation formula in andrewprograde/homebrew-feelr with `deprecate!` directive and `caveats` directing users to `brew install progradetech/feelr/feelr`
- User verified old tap deprecation and confirmed new tap is ready for next release

## Task Commits

1. **Task 1: Update GoReleaser config to target progradetech tap** - `fb6426c` (chore)
2. **Task 2: Write deprecation formula in old andrewprograde/homebrew-feelr tap** - `d2c1c1f` (remote, andrewprograde/homebrew-feelr)
3. **Task 3: Verify end-to-end Homebrew tap migration** - No commit (human-verify checkpoint, approved)

**Plan metadata:** See final commit below.

## Files Created/Modified

- `.goreleaser.yaml` - Changed `brews.repository.owner` from `andrewprograde` to `progradetech`
- `andrewprograde/homebrew-feelr Formula/feelr.rb` (external repo) - Deprecation formula with `deprecate!`, `odie` install block, and `caveats` migration instructions

## Decisions Made

- **Deprecation formula uses odie install block:** Since no prior release had published a formula with real download URLs, the deprecation formula blocks install entirely with migration instructions rather than preserving nonexistent binaries
- **CF token fix deferred:** No code change in this plan triggers the gateway pipeline; verification deferred to next gateway deploy

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no additional external service configuration required beyond what was done in Plan 01.

## Next Phase Readiness

- Homebrew tap migration is complete: future `v*` tag pushes will publish formulas to progradetech/homebrew-feelr
- Old tap users will see deprecation warning directing them to `brew install progradetech/feelr/feelr`
- Phase 17 (CI/CD & Homebrew Migration) is fully complete
- CF token fix will be verified on next gateway deploy (deferred blocker)

## Self-Check: PASSED

- FOUND: 17-02-SUMMARY.md
- FOUND: fb6426c (Task 1 commit)
- FOUND: owner: progradetech in .goreleaser.yaml
- Task 2 commit d2c1c1f is in remote repo andrewprograde/homebrew-feelr (verified by user during checkpoint)

---
*Phase: 17-cicd-homebrew-migration*
*Completed: 2026-02-11*
