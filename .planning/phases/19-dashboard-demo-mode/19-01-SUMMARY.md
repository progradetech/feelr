---
phase: 19-dashboard-demo-mode
plan: 01
subsystem: ui
tags: [react, swr, demo-mode, hooks, next.js, auth-guard]

# Dependency graph
requires:
  - phase: 18-demo-foundation
    provides: DemoContext provider with useDemo hook, fixture data constants
provides:
  - Demo-aware SWR hooks returning fixture data when isDemo is true
  - AuthGuard bypass for demo mode
  - Navigation flow handling for demo users (root, login, sidebar logout)
affects: [19-02-dashboard-demo-mode, 20-landing-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [SWR null-key conditional fetching for demo data interception]

key-files:
  created: []
  modified:
    - apps/dashboard/src/lib/hooks/use-keys.ts
    - apps/dashboard/src/lib/hooks/use-connectors.ts
    - apps/dashboard/src/lib/hooks/use-overview.ts
    - apps/dashboard/src/lib/hooks/use-usage.ts
    - apps/dashboard/src/components/auth-guard.tsx
    - apps/dashboard/src/components/sidebar.tsx
    - apps/dashboard/src/app/page.tsx
    - apps/dashboard/src/app/login/page.tsx

key-decisions:
  - "SWR null-key pattern for demo data (useSWR always called unconditionally, null key prevents fetch)"

patterns-established:
  - "SWR null-key demo interception: useDemo() -> isDemo ? null : key -> spread override with fixture data"
  - "AuthGuard demo bypass: early-return children without token check when isDemo"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 19 Plan 01: Demo Mode Wiring Summary

**SWR null-key demo interception across 6 hooks, AuthGuard bypass, and demo-aware navigation for root/login/sidebar**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T13:24:36Z
- **Completed:** 2026-02-11T13:27:03Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- All 6 SWR hooks (useKeys, useConnectors, useOverview, useUsage, useRateLimits, useAvailableKeys) return fixture data with zero network calls in demo mode
- AuthGuard renders children immediately without checking getAdminToken when isDemo is true
- Root page and login page redirect demo users to /overview, preventing auth redirect loops
- Sidebar logout calls exitDemo() in demo mode, clearing sessionStorage flag before redirect

## Task Commits

Each task was committed atomically:

1. **Task 1: Add demo interception to all 6 SWR hooks** - `15e25c2` (feat)
2. **Task 2: Add demo bypass to AuthGuard, navigation, and sidebar** - `cc838b8` (feat)

## Files Created/Modified
- `apps/dashboard/src/lib/hooks/use-keys.ts` - Demo-aware useKeys with DEMO_KEYS fixture
- `apps/dashboard/src/lib/hooks/use-connectors.ts` - Demo-aware useConnectors with DEMO_CONNECTORS fixture
- `apps/dashboard/src/lib/hooks/use-overview.ts` - Demo-aware useOverview with DEMO_OVERVIEW fixture
- `apps/dashboard/src/lib/hooks/use-usage.ts` - Demo-aware useUsage, useRateLimits, useAvailableKeys with fixtures
- `apps/dashboard/src/components/auth-guard.tsx` - AuthGuard with isDemo bypass (skips token check, renders children)
- `apps/dashboard/src/components/sidebar.tsx` - Sidebar logout calls exitDemo() in demo mode
- `apps/dashboard/src/app/page.tsx` - Root page redirects demo users to /overview
- `apps/dashboard/src/app/login/page.tsx` - Login page redirects demo users to /overview

## Decisions Made
- Used SWR null-key pattern (Approach A from research) for demo data interception -- ensures Rules of Hooks compliance by always calling useSWR unconditionally, using null key to prevent network fetch, then overriding return value with fixture data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All dashboard data hooks are demo-aware, ready for 19-02 (demo entry point integration)
- Demo banner, demo context, and fixture data from Phase 18 are fully wired into the dashboard
- TypeScript compilation verified with zero errors

## Self-Check: PASSED

All 8 modified files verified present. Both task commits (15e25c2, cc838b8) verified in git log. Summary file exists.

---
*Phase: 19-dashboard-demo-mode*
*Completed: 2026-02-11*
