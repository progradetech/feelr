---
phase: 18-demo-foundation
plan: 02
subsystem: ui
tags: [typescript, react, mock-data, demo-mode, fixtures]

# Dependency graph
requires:
  - phase: 08-composable-actions
    provides: Chain execution types (ChainExecutionResult, ChainStepResult)
  - phase: 06-dashboard
    provides: Dashboard types (ApiKey, ConnectorStatus, UsageResponse, OverviewData) and SWR hooks
provides:
  - ChainHistoryEntry type in dashboard types.ts
  - Typed mock data fixtures for all 5 dashboard data domains (keys, connectors, usage, overview, chains)
  - Barrel export enabling single-import access to all fixtures
affects: [19-demo-wiring, 21-landing-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [satisfies-type-assertion-for-fixtures, fixture-per-domain-with-barrel-export]

key-files:
  created:
    - apps/dashboard/src/lib/demo-data/keys.ts
    - apps/dashboard/src/lib/demo-data/connectors.ts
    - apps/dashboard/src/lib/demo-data/usage.ts
    - apps/dashboard/src/lib/demo-data/overview.ts
    - apps/dashboard/src/lib/demo-data/chains.ts
    - apps/dashboard/src/lib/demo-data/index.ts
  modified:
    - apps/dashboard/src/lib/types.ts

key-decisions:
  - "Used satisfies assertions instead of type annotations for compile-time validation with narrower inferred types"
  - "Made overview fixture data internally consistent with keys/connectors counts (total_keys=3, connected_services=2)"
  - "Made usage and overview hourly data share identical values (657 total) for cross-domain consistency"

patterns-established:
  - "Fixture per domain: one file per data domain in demo-data/ directory with barrel re-export"
  - "satisfies assertion pattern: export const FIXTURE = [...] satisfies Type[] for compile-time type safety"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 18 Plan 02: Demo Data Fixtures Summary

**Typed mock data fixtures for 5 dashboard domains (keys, connectors, usage, overview, chains) with ChainHistoryEntry type and cross-domain consistency**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T02:30:01Z
- **Completed:** 2026-02-11T02:32:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added ChainHistoryEntry interface to dashboard types.ts, derived from gateway's ChainExecutionResult
- Created typed fixtures for all 5 data domains with realistic demo data and satisfies assertions
- Ensured cross-domain consistency: overview counts match keys/connectors fixture lengths, rate limit keys match API keys, hourly usage values shared between usage and overview fixtures
- Created barrel index.ts re-exporting all 6 fixture constants for single-import convenience

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ChainHistoryEntry type and create API keys + connectors fixtures** - `ce8ad7a` (feat)
2. **Task 2: Create usage, overview, chains fixtures and barrel export** - `91eb121` (feat)

## Files Created/Modified
- `apps/dashboard/src/lib/types.ts` - Added ChainHistoryEntry interface for chain execution history
- `apps/dashboard/src/lib/demo-data/keys.ts` - DEMO_KEYS: 3 ApiKey entries with production/staging/unlabeled mix
- `apps/dashboard/src/lib/demo-data/connectors.ts` - DEMO_CONNECTORS: 4 ConnectorStatus entries covering all 3 status states
- `apps/dashboard/src/lib/demo-data/usage.ts` - DEMO_USAGE: 24-hour traffic curve (657 total), DEMO_RATE_LIMITS: 3 entries matching demo keys
- `apps/dashboard/src/lib/demo-data/overview.ts` - DEMO_OVERVIEW: OverviewData consistent with keys/connectors/usage fixtures
- `apps/dashboard/src/lib/demo-data/chains.ts` - DEMO_CHAINS: 4 chain history entries (success, skip, failure, success)
- `apps/dashboard/src/lib/demo-data/index.ts` - Barrel re-export of all 6 fixture constants

## Decisions Made
- Used `satisfies` assertions instead of `as` or explicit type annotations to get compile-time validation while preserving narrow literal types for fixture values
- Made overview total_24h (657) exactly equal to sum of all hourly counts, which match DEMO_USAGE bucket total_requests values
- Placed ChainHistoryEntry in types.ts (not in fixture file) for future-proofing when chain history page is built

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 data domain fixtures ready for Phase 19 SWR hook integration
- ChainHistoryEntry type ready for future chain history dashboard page
- Barrel export enables clean single-import in Phase 19's hook modifications

## Self-Check: PASSED

- All 8 files verified present on disk
- Both task commits (ce8ad7a, 91eb121) verified in git history

---
*Phase: 18-demo-foundation*
*Completed: 2026-02-11*
