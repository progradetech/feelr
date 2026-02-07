---
phase: 06-dashboard
plan: 05
subsystem: ui
tags: [recharts, swr, area-chart, usage-analytics, date-fns, react, next.js]

# Dependency graph
requires:
  - phase: 06-01
    provides: "Gateway /internal/usage endpoint with time bucketing"
  - phase: 06-02
    provides: "Dashboard scaffold with auth, SWR, gatewayFetch, types"
provides:
  - "Usage visualization page with time-series area chart"
  - "Filter controls for key, connector, and time window"
  - "Usage breakdown stats (total requests, error rate, avg latency)"
  - "useUsage SWR hook with parameterized filter queries"
affects: [07-production-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recharts AreaChart for time-series visualization"
    - "Filter-aware SWR keys with descriptive cache key pattern"
    - "Time preset button group with active state toggle"

key-files:
  created:
    - apps/dashboard/src/lib/hooks/use-usage.ts
    - apps/dashboard/src/components/usage-chart.tsx
    - apps/dashboard/src/components/usage-breakdown.tsx
  modified:
    - apps/dashboard/src/app/(dashboard)/usage/page.tsx

key-decisions:
  - "HTML select elements for filter dropdowns (simple, no extra shadcn dep needed)"
  - "Static connector list in useAvailableConnectors (no fetch, connectors are known)"
  - "Separate SWR key for admin-keys-for-filter to avoid collision with keys page hook"

patterns-established:
  - "Filter-parameterized SWR keys: usage-${window}-${key}-${connector}"
  - "Time preset button group with active state visual indicator"
  - "Recharts area overlay pattern for primary + secondary metrics"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 6 Plan 5: Usage Visualization Summary

**Recharts area chart with time-series usage data, key/connector filter dropdowns, time window presets, and aggregate breakdown stats**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T03:31:40Z
- **Completed:** 2026-02-07T03:34:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Area chart renders total_requests (blue) and error_count (red) as overlaid areas with Recharts
- 4 time window presets (Last Hour, Last 24 Hours, Last 7 Days, Last 30 Days) change chart granularity
- Key and connector filter dropdowns with parameterized SWR queries avoid cache collisions
- Summary breakdown shows total requests, error rate (red when >5%), and average latency

## Task Commits

Each task was committed atomically:

1. **Task 1: SWR usage hook with filter parameters + usage chart component** - `461bf84` (feat)
2. **Task 2: Usage page with time window presets and filter dropdowns** - `1fa285e` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `apps/dashboard/src/lib/hooks/use-usage.ts` - SWR hook for /internal/usage with filter params, useAvailableKeys, useAvailableConnectors
- `apps/dashboard/src/components/usage-chart.tsx` - Recharts AreaChart with total_requests and error_count, time bucket formatting via date-fns
- `apps/dashboard/src/components/usage-breakdown.tsx` - Aggregate stat cards: total requests, error rate, avg latency
- `apps/dashboard/src/app/(dashboard)/usage/page.tsx` - Full usage page with presets, filters, chart, breakdown, loading/error/empty states

## Decisions Made
- Used HTML `<select>` elements for filter dropdowns instead of shadcn Select component -- simpler, no extra dependency, consistent dark theme styling with native elements
- Static connector list returned from useAvailableConnectors (no API call needed since connectors are known)
- Separate SWR key `admin-keys-for-filter` for the keys dropdown to avoid cache collision with the keys page `admin-keys` hook
- Time bucket formatting via date-fns `format` + `parseISO` with window-dependent format strings (HH:mm for hour, MMM dd for day, MMM yyyy for month)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Usage visualization complete, all 5 dashboard plans now delivered
- Dashboard pages (Overview, Keys, Connectors, Usage) all functional with proper loading/error/empty states
- Ready for Phase 7 (Production Hardening)

## Self-Check: PASSED

---
*Phase: 06-dashboard*
*Completed: 2026-02-07*
