---
phase: 27-repository-split
plan: 01
subsystem: infra
tags: [rsync, wrangler, goreleaser, github-actions, repo-split]

# Dependency graph
requires:
  - phase: 25-pre-split-audit-cleanup
    provides: File classification matrix (SECRETS-INVENTORY.md Section 5B) defining PUBLIC/EXCLUDE/PARTIAL files
  - phase: 26-billing-interface-extraction
    provides: BillingProvider interface extraction enabling clean split of billing code
provides:
  - Clean public repo staging area at /tmp/feelr-public/ ready for git init and push
  - Dev-only wrangler.toml without staging/production env blocks
  - GoReleaser config targeting feelr repo for GitHub Releases
  - Public-only CI workflow (lint, typecheck, test -- no deploy)
  - Graceful check-bindings.mjs that exits 0 when env sections missing
affects: [27-02-PLAN, 27-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "rsync --exclude for file classification-based snapshot creation"
    - "Graceful script degradation for multi-repo compatibility"

key-files:
  created: []
  modified:
    - /tmp/feelr-public/apps/gateway/wrangler.toml
    - /tmp/feelr-public/.goreleaser.yaml
    - /tmp/feelr-public/.github/workflows/ci.yml
    - /tmp/feelr-public/scripts/check-bindings.mjs

key-decisions:
  - "Excluded pnpm-lock.yaml from snapshot so public repo generates its own lockfile on first install"
  - "Combined staging/production env check into single conditional for cleaner graceful skip logic"

patterns-established:
  - "Public repo wrangler.toml contains only top-level dev config; cloud config lives in cloud repo"
  - "Scripts must gracefully handle missing environment sections for multi-repo compatibility"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 27 Plan 01: Public Snapshot Staging Summary

**Public repo snapshot at /tmp/feelr-public/ with rsync exclusions, stripped wrangler.toml, GoReleaser retarget, simplified CI, and graceful check-bindings.mjs**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T15:19:53Z
- **Completed:** 2026-02-13T15:22:20Z
- **Tasks:** 2
- **Files modified:** 4 (+ 3 deleted, 1 directory removed)

## Accomplishments
- Created complete public repo staging area via rsync with 14 exclusion patterns matching Phase 25 file classification matrix
- Stripped wrangler.toml to dev-only config (removed staging/production env blocks with KV, D1, DO, rate limit bindings)
- Fixed GoReleaser release.github.name from homebrew-feelr to feelr (brews section still points to homebrew-feelr tap)
- Replaced CI workflow: removed gateway-preview deploy job and check-bindings step, kept lint/typecheck/test only
- Made check-bindings.mjs exit gracefully (code 0) when wrangler.toml has no staging/production env sections

## Task Commits

Both tasks operate on /tmp/feelr-public/ (outside the git repo working tree), so no per-task commits are possible. The staging area is an ephemeral build artifact consumed by Plan 02.

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `/tmp/feelr-public/apps/gateway/wrangler.toml` - Dev-only config: name, main, compatibility_date, keep_vars, migrations, triggers (no env blocks)
- `/tmp/feelr-public/.goreleaser.yaml` - release.github.name changed from homebrew-feelr to feelr
- `/tmp/feelr-public/.github/workflows/ci.yml` - Single check job: checkout, pnpm, node, install, turbo cache, lint/typecheck/test
- `/tmp/feelr-public/scripts/check-bindings.mjs` - Graceful exit 0 when env.staging or env.production missing

### Files Deleted from Staging
- `/tmp/feelr-public/.github/workflows/gateway.yml` - Cloud-only gateway deploy workflow
- `/tmp/feelr-public/.github/workflows/dashboard.yml` - Cloud-only dashboard deploy workflow
- `/tmp/feelr-public/.github/workflows/docs.yml` - Cloud-only docs deploy workflow

### Directories Removed
- `/tmp/feelr-public/docs/deployment/` - Empty after SECRETS-INVENTORY.md and RUNBOOK.md exclusion

## Decisions Made
- Excluded pnpm-lock.yaml from snapshot: fresh snapshot should generate its own lockfile on first `pnpm install` to avoid dependency resolution issues from a different workspace root
- Combined the two separate env.staging / env.production checks in check-bindings.mjs into a single `||` conditional for cleaner graceful skip logic (functionally equivalent -- if either is missing, binding isolation check is impossible)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- check-bindings.mjs verification required temporarily symlinking node_modules from main repo since smol-toml is an ESM-only package not available without node_modules. Symlink was created, test passed, symlink removed. No impact on staging area.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- /tmp/feelr-public/ is ready for Plan 02 to `git init`, commit, and push as the public progradetech/feelr repo
- All file exclusions verified against Phase 25 classification matrix
- All modifications verified: wrangler.toml (no env blocks), GoReleaser (targets feelr), CI (no deploy), check-bindings (graceful)
- Only ci.yml and release.yml remain in .github/workflows/

## Self-Check: PASSED

All 11 artifact checks verified:
- 4 modified files confirmed present in staging area
- 3 deleted workflows confirmed absent
- 1 removed directory confirmed absent
- 2 excluded files confirmed absent
- 1 SUMMARY.md confirmed created

---
*Phase: 27-repository-split*
*Completed: 2026-02-13*
