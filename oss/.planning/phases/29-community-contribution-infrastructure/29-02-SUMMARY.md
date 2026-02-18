---
phase: 29-community-contribution-infrastructure
plan: 02
subsystem: testing
tags: [vitest, connector-sdk, scaffolding, contract-tests, codegen]

# Dependency graph
requires:
  - phase: 29-01
    provides: "Connector template with actions, tests, and SDK types"
provides:
  - "@feelr/connector-test-utils package with validateConnector() SDK contract tests"
  - "pnpm create-connector scaffolding script with --auth flag"
  - "Template updated with connector-test-utils devDependency and contract test import"
affects: [29-03, 29-04, connector-development]

# Tech tracking
tech-stack:
  added: ["@feelr/connector-test-utils"]
  patterns: ["SDK contract tests via validateConnector()", "connector scaffolding via create-connector.mjs"]

key-files:
  created:
    - "packages/connector-test-utils/package.json"
    - "packages/connector-test-utils/tsconfig.json"
    - "packages/connector-test-utils/src/index.ts"
    - "packages/connector-test-utils/src/contract-tests.ts"
    - "scripts/create-connector.mjs"
  modified:
    - "connectors/_template/package.json"
    - "connectors/_template/src/__tests__/actions.test.ts"
    - "package.json"

key-decisions:
  - "validateConnector auto-added to template test file so all scaffolded connectors get contract tests immediately"
  - "Contract tests validate name, display_name, version, auth_type, actions structure, and all param definitions"

patterns-established:
  - "SDK contract tests: call validateConnector(connector) in any connector test file for automatic compliance checks"
  - "Connector scaffolding: pnpm create-connector <name> --auth <type> generates working connector from template"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 29 Plan 02: Connector Test Utils and Scaffolding Summary

**@feelr/connector-test-utils with SDK contract tests and create-connector scaffolding script for one-command connector generation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T11:04:42Z
- **Completed:** 2026-02-17T11:07:56Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created @feelr/connector-test-utils workspace package that auto-generates SDK contract tests for any ConnectorDefinition
- Built scaffolding script (scripts/create-connector.mjs) that generates working connectors from template with correct string replacements
- Template updated with connector-test-utils devDependency and validateConnector call in test file
- Scaffolded connectors pass all 60 tests immediately (SDK contract + action tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create @feelr/connector-test-utils package** - `4ac1d68` (feat)
2. **Task 2: Create scaffolding script and update template** - `a7ddd17` (feat)

## Files Created/Modified
- `packages/connector-test-utils/package.json` - Workspace package config with connector-sdk dep and vitest peer dep
- `packages/connector-test-utils/tsconfig.json` - TypeScript config extending base
- `packages/connector-test-utils/src/index.ts` - Public API re-exporting validateConnector
- `packages/connector-test-utils/src/contract-tests.ts` - SDK contract test generator (name, version, auth, actions, params validation)
- `scripts/create-connector.mjs` - Scaffolding script: copies template, replaces strings, runs pnpm install
- `connectors/_template/package.json` - Added @feelr/connector-test-utils devDependency
- `connectors/_template/src/__tests__/actions.test.ts` - Added validateConnector import and call
- `package.json` - Added create-connector root script

## Decisions Made
- Added validateConnector call directly to template test file so every scaffolded connector automatically gets SDK contract tests (Rule 2 deviation -- missing critical functionality for the stated goal)
- Contract tests check action name matches its registration key (defensive check not in plan but derived from SDK interface expectations)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added validateConnector call to template test file**
- **Found during:** Task 2 (Create scaffolding script and update template)
- **Issue:** Plan adds connector-test-utils as devDep in template but does not show adding the actual validateConnector import/call to the test file. Without this, scaffolded connectors would have the package installed but no contract tests running.
- **Fix:** Added `import { validateConnector } from '@feelr/connector-test-utils'` and `validateConnector(templateConnector)` to template test file
- **Files modified:** connectors/_template/src/__tests__/actions.test.ts
- **Verification:** Template tests pass with 60 tests (contract tests + action tests)
- **Committed in:** a7ddd17 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for the stated success criteria that scaffolded connectors have passing SDK compliance tests. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Connector test utils and scaffolding script ready for contributor guide documentation (Plan 03)
- Template now includes SDK contract tests, establishing the pattern for all new connectors

## Self-Check: PASSED

All created files verified on disk. Both task commits (4ac1d68, a7ddd17) confirmed in git history.

---
*Phase: 29-community-contribution-infrastructure*
*Completed: 2026-02-17*
