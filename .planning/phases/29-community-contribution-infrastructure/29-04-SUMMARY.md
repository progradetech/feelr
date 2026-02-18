---
phase: 29-community-contribution-infrastructure
plan: 04
subsystem: infra
tags: [ci, validation, github-issues, connector-sdk, community]

# Dependency graph
requires:
  - phase: 29-02
    provides: connector-test-utils package, create-connector scaffolding script, _template directory
provides:
  - Connector validation script (scripts/validate-connectors.mjs) with 5 SDK compliance checks
  - CI connector-validation job running on every PR
  - 3 pre-seeded "good first issue" connector requests (Todoist, OpenWeatherMap, Linear)
affects: [connector-development, ci-pipeline, community-contributions]

# Tech tracking
tech-stack:
  added: []
  patterns: [connector-validation-ci, good-first-issue-seeding]

key-files:
  created:
    - scripts/validate-connectors.mjs
    - connectors/slack/src/__tests__/contract.test.ts
    - connectors/stripe/src/__tests__/contract.test.ts
    - connectors/discord/src/__tests__/contract.test.ts
    - connectors/slack/vitest.config.ts
    - connectors/stripe/vitest.config.ts
    - connectors/discord/vitest.config.ts
  modified:
    - .github/workflows/ci.yml
    - connectors/slack/package.json
    - connectors/stripe/package.json
    - connectors/discord/package.json

key-decisions:
  - "Added contract test files for slack/stripe/discord connectors so validation check #5 passes for all existing connectors"
  - "Validation runs on all PRs with --changed flag; early-exits when no connectors modified"
  - "Used gh CLI to create issues directly on progradetech/feelr public repo"

patterns-established:
  - "Connector validation: 5-check compliance script runnable locally and in CI"
  - "Good first issue seeding: well-documented API connector requests with getting started steps"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 29 Plan 04: Connector Validation CI and Community Issues Summary

**Connector SDK compliance validation script with 5 checks, CI job on every PR, and 3 pre-seeded good-first-issue connector requests (Todoist, OpenWeatherMap, Linear)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T11:11:32Z
- **Completed:** 2026-02-17T11:15:21Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Validation script checks package.json, SDK-only dependencies, entry point, disallowed imports, and test existence
- CI workflow runs connector-validation job on every PR with --changed mode for efficiency
- 3 "good first issue" connector requests created on public repo targeting well-documented APIs
- All 4 existing connectors (github, slack, stripe, discord) pass validation; _template excluded

## Task Commits

Each task was committed atomically:

1. **Task 1: Create validation script and CI job** - `aef9ab9` (feat)
2. **Task 2: Pre-seed good-first-issue connector requests** - No local commit (GitHub API-only operations: issues #1, #2, #3 on progradetech/feelr)

**Plan metadata:** (pending)

## Files Created/Modified
- `scripts/validate-connectors.mjs` - Connector SDK compliance validation (5 checks, --all/--changed modes)
- `.github/workflows/ci.yml` - Added connector-validation job between check and gateway-preview
- `connectors/slack/src/__tests__/contract.test.ts` - SDK contract tests for Slack connector
- `connectors/stripe/src/__tests__/contract.test.ts` - SDK contract tests for Stripe connector
- `connectors/discord/src/__tests__/contract.test.ts` - SDK contract tests for Discord connector
- `connectors/{slack,stripe,discord}/vitest.config.ts` - Vitest configuration for test discovery
- `connectors/{slack,stripe,discord}/package.json` - Added @feelr/connector-test-utils devDependency

## Decisions Made
- Added contract test files for slack, stripe, discord connectors -- they had no tests, which would have failed validation check #5
- Validation script runs on ALL PRs (not just connector PRs) because --changed flag early-exits with "No connector changes detected" when irrelevant
- Used gh CLI to create issues directly on progradetech/feelr public repo with connector-request and good-first-issue labels

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing test files for slack, stripe, discord connectors**
- **Found during:** Task 1 (validation script creation)
- **Issue:** Slack, stripe, and discord connectors had no `src/__tests__/` directory or test files. Validation check #5 requires at least one `.test.ts` file, so all 3 would fail.
- **Fix:** Created minimal `contract.test.ts` files using `validateConnector` from `@feelr/connector-test-utils`, added the devDependency to each connector's package.json, and added vitest configs.
- **Files modified:** connectors/{slack,stripe,discord}/package.json, connectors/{slack,stripe,discord}/src/__tests__/contract.test.ts, connectors/{slack,stripe,discord}/vitest.config.ts
- **Verification:** `node scripts/validate-connectors.mjs --all` passes for all 4 connectors
- **Committed in:** aef9ab9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary for validation to pass on existing connectors. No scope creep -- contract tests are the minimal viable test for SDK compliance.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 29 is now complete -- all 4 plans executed
- Community contribution infrastructure fully operational:
  - Issue templates and PR template (Plan 01)
  - Connector scaffolding and test utils (Plan 02)
  - Developer documentation and CONTRIBUTING.md (Plan 03)
  - Connector validation CI and seeded issues (Plan 04)
- Public repo ready for community contributions

## Self-Check: PASSED

All created files verified on disk. All commit hashes found in git log. GitHub issues #1, #2, #3 confirmed on progradetech/feelr.

---
*Phase: 29-community-contribution-infrastructure*
*Completed: 2026-02-17*
