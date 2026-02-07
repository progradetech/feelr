---
phase: 06-dashboard
plan: 04
subsystem: ui
tags: [next.js, recharts, swr, connectors, overview, sparkline, dashboard]

# Dependency graph
requires:
  - phase: 06-01
    provides: "Gateway /internal/overview and /admin/credentials endpoints"
  - phase: 06-02
    provides: "Dashboard scaffold, gatewayFetch, SWR, types, auth utilities"
provides:
  - "Connectors page with 4 connector cards and status badges"
  - "ConnectorCard reusable component with 3-state status model"
  - "useConnectors SWR hook fetching from /admin/credentials"
  - "Overview landing page with 3 summary cards and sparkline chart"
  - "useOverview SWR hook fetching from /internal/overview"
  - "SparklineChart component using Recharts AreaChart"
affects: [07-production-hardening, 08-composable-actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for Recharts (SSR-safe with static export)"
    - "Constant-based connector list with auth command mapping"
    - "3-state status model (connected/needs_reauth/not_connected) with 2-state Phase 6 implementation"

key-files:
  created:
    - "apps/dashboard/src/lib/hooks/use-connectors.ts"
    - "apps/dashboard/src/components/connector-card.tsx"
    - "apps/dashboard/src/lib/hooks/use-overview.ts"
    - "apps/dashboard/src/app/(dashboard)/overview/sparkline-chart.tsx"
  modified:
    - "apps/dashboard/src/app/(dashboard)/connectors/page.tsx"
    - "apps/dashboard/src/app/(dashboard)/overview/page.tsx"

key-decisions:
  - "Dynamic import for Recharts SparklineChart to avoid SSR issues with static export"
  - "2-state connector status (connected/not_connected) in Phase 6; needs_reauth requires gateway auth_state exposure"
  - "Connector list hardcoded as constant (4 known connectors) rather than discovered from gateway"

patterns-established:
  - "Dynamic chart imports: Recharts components wrapped in next/dynamic with ssr:false for static export compatibility"
  - "Status badge pattern: config object mapping status to dot/badge colors for consistent UI"

# Metrics
duration: 5min
completed: 2026-02-07
---

# Phase 6 Plan 4: Connectors and Overview Pages Summary

**Connector status cards with CLI auth commands and overview landing page with summary cards and Recharts sparkline**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-07T03:30:51Z
- **Completed:** 2026-02-07T03:35:39Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Connectors page showing all 4 connectors (GitHub, Slack, Stripe, Discord) with connected/not_connected status badges
- Each connector card displays a CLI reconnect command (e.g., `feelr auth github`) with prominent call-to-action for disconnected services
- Overview page with 3 summary cards: Total API Keys, Connected Services (N/4), Requests (24h)
- Sparkline area chart using Recharts for hourly usage visualization with blue gradient fill
- All pages handle loading (skeleton cards), error (retry button), and empty states

## Task Commits

Each task was committed atomically:

1. **Task 1: Connectors page with status cards and re-auth CLI instructions** - `be07aeb` (feat)
   - Note: Task 1 files (use-connectors.ts, connector-card.tsx, connectors/page.tsx) were incidentally committed by the parallel 06-03 plan agent which staged all untracked files. The code is authored by this plan execution.
2. **Task 2: Overview landing page with summary cards and sparkline** - `30236e4` (feat)

**Plan metadata:** `aa09479` (docs: complete plan)

## Files Created/Modified
- `apps/dashboard/src/lib/hooks/use-connectors.ts` - SWR hook fetching /admin/credentials, maps to ConnectorStatus[]
- `apps/dashboard/src/components/connector-card.tsx` - Card component with status badge, icon, and CLI command
- `apps/dashboard/src/app/(dashboard)/connectors/page.tsx` - Connectors page with 4-column card grid
- `apps/dashboard/src/lib/hooks/use-overview.ts` - SWR hook fetching /internal/overview
- `apps/dashboard/src/app/(dashboard)/overview/page.tsx` - Overview page with summary cards and sparkline
- `apps/dashboard/src/app/(dashboard)/overview/sparkline-chart.tsx` - Recharts AreaChart for hourly usage

## Decisions Made
- **Dynamic import for Recharts:** Used `next/dynamic` with `ssr: false` to load the SparklineChart component. Recharts uses browser APIs internally, and static export (output: 'export') fails if Recharts is server-rendered.
- **2-state connector status:** The plan specifies 3 states (connected/needs_reauth/not_connected), but the gateway's /admin/credentials endpoint only reveals which connectors have stored credentials. It does not expose auth_state (token validity, refresh errors). Added a TODO comment documenting this limitation. The ConnectorCard component already supports all 3 states for future use.
- **Hardcoded connector list:** The 4 known connectors (github, slack, stripe, discord) are defined as a constant array rather than discovered via API. This matches the current gateway architecture where connectors are in-process modules, not a dynamic registry.

## Deviations from Plan

### Parallel Plan Commit Collision

**Task 1 files committed by parallel agent (06-03)**
- **Found during:** Task 1 commit
- **Issue:** The parallel 06-03 plan agent committed connector-card.tsx, use-connectors.ts, and connectors/page.tsx alongside its own key management files in commit `be07aeb`. This happened because both plans ran concurrently and 06-03 staged all untracked files.
- **Impact:** No code changes needed. The files contain exactly the code written by this plan. Commit attribution is shared with 06-03.
- **Resolution:** Proceeded to Task 2. Task 1 code is correct and committed.

### Sparkline Chart Extracted to Separate File

**Added sparkline-chart.tsx (not in plan file list)**
- **Found during:** Task 2 implementation
- **Issue:** Recharts requires `next/dynamic` with `ssr: false` for static export. Dynamic imports require a separate module file.
- **Fix:** Created `sparkline-chart.tsx` as a co-located component in the overview directory, imported via `dynamic(() => import('./sparkline-chart'))`.
- **Rule:** [Rule 3 - Blocking] Required for build to succeed with static export.

---

**Total deviations:** 1 auto-fix (blocking), 1 parallel collision (no impact)
**Impact on plan:** Sparkline extraction was necessary for static export compatibility. No scope creep.

## Issues Encountered
- Parallel plan 06-03 committed Task 1 files -- resolved by proceeding since code was correct.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 dashboard pages now have full implementations (connectors, overview, keys, usage)
- Dashboard build succeeds with all pages as static exports
- Ready for Phase 7 (Production Hardening) or Phase 6 Plan 5 if remaining

## Self-Check: PASSED

---
*Phase: 06-dashboard*
*Completed: 2026-02-07*
