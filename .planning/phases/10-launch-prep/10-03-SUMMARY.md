---
phase: 10-launch-prep
plan: 03
subsystem: infra
tags: [goreleaser, github-actions, homebrew, cli-distribution, update-checker]

# Dependency graph
requires:
  - phase: 04-cli-core
    provides: "Go CLI binary with cobra commands and ldflags version injection"
provides:
  - "GoReleaser v2 config for multi-platform CLI builds (6 combinations)"
  - "GitHub Actions release workflow triggered by git tags"
  - "Homebrew tap formula auto-generation"
  - "Silent CLI update checker with 24h disk cache"
affects: [10-04-PLAN]

# Tech tracking
tech-stack:
  added: [goreleaser-v2, goreleaser-action-v6]
  patterns: [tag-triggered-release, silent-update-check, disk-cached-version-query]

key-files:
  created:
    - .goreleaser.yaml
    - .github/workflows/release.yml
    - cli/internal/update/checker.go
  modified:
    - cli/cmd/root.go

key-decisions:
  - "Used GoReleaser v2 'brews' key (not 'homebrew_casks' as planned -- homebrew_casks is not a valid GoReleaser key)"
  - "Synchronous update check in PersistentPreRun (cache hit is <1ms file read, only stale cache triggers 5s HTTP call)"
  - "JSON-encoded cache file at ~/.config/feelr/update-check with Unix timestamp for TTL checking"

patterns-established:
  - "Tag-triggered release: push v* tag -> GitHub Actions -> GoReleaser builds + publishes"
  - "Silent update checker: never errors, never blocks, stderr-only notification"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 10 Plan 03: CLI Distribution Summary

**GoReleaser v2 multi-platform release pipeline with Homebrew tap and silent CLI update checker**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T15:25:27Z
- **Completed:** 2026-02-09T15:27:57Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- GoReleaser v2 config builds CLI for 6 platform combinations (linux/darwin/windows x amd64/arm64)
- GitHub Actions release workflow triggered on v* tags with full git history for changelog
- Homebrew formula auto-pushed to andrewprograde/homebrew-feelr tap
- Silent update checker with 24h disk cache, 5s HTTP timeout, stderr-only notification

## Task Commits

Each task was committed atomically:

1. **Task 1: GoReleaser config and GitHub Actions release workflow** - `40e778c` (feat)
2. **Task 2: CLI update checker with daily cache** - `da0c1ba` (feat)

## Files Created/Modified
- `.goreleaser.yaml` - GoReleaser v2 config for multi-platform CLI builds, Homebrew tap, checksums
- `.github/workflows/release.yml` - GitHub Actions workflow triggered on v* tags
- `cli/internal/update/checker.go` - Silent update checker with 24h cache and semver comparison
- `cli/cmd/root.go` - Added PersistentPreRun calling update.CheckForUpdate

## Decisions Made
- Used GoReleaser v2 `brews` key instead of plan's `homebrew_casks` -- `homebrew_casks` is not a valid GoReleaser configuration key
- Chose synchronous update check (not goroutine) for simplicity -- cache hit is a single file read (<1ms), only stale cache triggers HTTP call with 5s timeout
- Cache stored as JSON with Unix timestamp for reliable TTL checking across timezones

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used `brews` instead of `homebrew_casks` in GoReleaser config**
- **Found during:** Task 1 (GoReleaser config creation)
- **Issue:** Plan specified `homebrew_casks` as the GoReleaser v2 key for Homebrew formula generation, but `homebrew_casks` is not a valid GoReleaser key -- the correct key is `brews`
- **Fix:** Used `brews` (the actual GoReleaser v2 key) instead of `homebrew_casks`
- **Files modified:** .goreleaser.yaml
- **Verification:** YAML validation confirms valid structure; GoReleaser docs confirm `brews` as correct key
- **Committed in:** 40e778c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix -- `homebrew_casks` would have caused GoReleaser to silently ignore Homebrew formula generation. No scope creep.

## Issues Encountered
None.

## User Setup Required

Before using the release pipeline, the following must be configured:
- **HOMEBREW_TAP_GITHUB_TOKEN**: A GitHub PAT with `repo` scope, stored as a repository secret, for pushing Homebrew formula to `andrewprograde/homebrew-feelr`
- **andrewprograde/homebrew-feelr**: This repository must exist on GitHub (empty repo is fine, GoReleaser creates the formula)

## Next Phase Readiness
- Release pipeline is ready -- pushing a v* tag triggers the full build+publish cycle
- Homebrew tap repo (andrewprograde/homebrew-feelr) needs to be created before first release
- HOMEBREW_TAP_GITHUB_TOKEN secret needs to be added to the feelr repo settings

## Self-Check: PASSED

All 5 files verified present. Both task commits (40e778c, da0c1ba) verified in git log.

---
*Phase: 10-launch-prep*
*Completed: 2026-02-09*
