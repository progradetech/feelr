---
phase: 16-deployment-guides-hardening
plan: 03
subsystem: infra
tags: [ci, cloudflare, wrangler, toml, binding-validation, smol-toml]

# Dependency graph
requires:
  - phase: 12-cloudflare-workers-deploy
    provides: wrangler.toml with per-environment KV and D1 bindings
  - phase: 13-gateway-ci-cd
    provides: CI workflow with check job
provides:
  - CI binding isolation check preventing staging/production resource ID sharing
  - Reusable TOML binding extraction script
affects: [gateway-config, ci-pipeline]

# Tech tracking
tech-stack:
  added: [smol-toml]
  patterns: [binding-isolation-validation, ci-config-checks]

key-files:
  created: [scripts/check-bindings.mjs]
  modified: [.github/workflows/ci.yml, package.json, pnpm-lock.yaml]

key-decisions:
  - "Rate limit namespace_id excluded from validation (policy identifier, not resource ID)"
  - "Binding check runs in existing check job (fast, no separate job needed)"
  - "Validation step placed before lint/typecheck/test for early failure"

patterns-established:
  - "CI config validation: fast config checks run before expensive lint/test steps"
  - "TOML parsing via smol-toml for wrangler.toml analysis scripts"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 16 Plan 03: Binding Isolation CI Check Summary

**TOML-based CI validation that prevents staging and production from sharing KV namespace or D1 database IDs in wrangler.toml**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T16:58:42Z
- **Completed:** 2026-02-10T17:00:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `scripts/check-bindings.mjs` that parses wrangler.toml and validates KV/D1 resource ID isolation between staging and production
- Correctly excludes rate limit `namespace_id` "0" (intentionally shared policy identifier, not a resource ID)
- Added binding validation step to CI workflow `check` job, running before lint/typecheck/test on every PR
- Installed smol-toml as root workspace devDependency for TOML parsing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create binding validation script and install smol-toml** - `5c56d56` (feat)
2. **Task 2: Add binding validation to CI workflow** - `d428aae` (feat)

## Files Created/Modified
- `scripts/check-bindings.mjs` - Node.js ES module that parses wrangler.toml, extracts KV/D1 IDs per environment, computes set intersection to detect sharing
- `.github/workflows/ci.yml` - Added "Validate wrangler binding isolation" step in check job after pnpm install
- `package.json` - Added smol-toml ^1.6.0 as devDependency
- `pnpm-lock.yaml` - Updated lockfile with smol-toml dependency tree

## Decisions Made
- Rate limit `namespace_id` "0" excluded from validation because it is a policy identifier, not a Cloudflare resource ID pointing to a data store
- Binding check runs in existing `check` job rather than a separate job (sub-second execution, shares pnpm install step)
- Validation step placed before lint/typecheck/test to catch configuration errors immediately without waiting for slower checks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 plan 03 is the final plan in Phase 16
- All deployment guides and hardening checks are now in place
- CI pipeline validates both code quality (lint/typecheck/test) and infrastructure configuration (binding isolation)

## Self-Check: PASSED

All artifacts verified:
- scripts/check-bindings.mjs: FOUND
- .github/workflows/ci.yml: FOUND
- 16-03-SUMMARY.md: FOUND
- Commit 5c56d56: FOUND
- Commit d428aae: FOUND

---
*Phase: 16-deployment-guides-hardening*
*Completed: 2026-02-10*
