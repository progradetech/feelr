---
phase: 06-dashboard
plan: 02
subsystem: ui
tags: [nextjs, react, tailwind, spa, static-export, auth, sidebar]

# Dependency graph
requires:
  - phase: 02-auth-vault
    provides: Admin token auth (Bearer header to /admin/* routes)
  - phase: 06-01
    provides: Internal API routes for dashboard data (/internal/overview, /internal/usage)
provides:
  - Next.js 16 dashboard app scaffold at apps/dashboard/
  - Admin token login page with gateway validation
  - Auth guard protecting authenticated routes
  - Sidebar navigation (Overview, Keys, Connectors, Usage)
  - Gateway API client (gatewayFetch, gatewayMutate) with Bearer auth
  - Dashboard types (ApiKey, ConnectorStatus, UsageBucket, OverviewData)
affects: [06-03, 06-04, 06-05]

# Tech tracking
tech-stack:
  added: [next@15.5, react@19, tailwindcss@4, swr@2, recharts@2, lucide-react, date-fns, sonner]
  patterns: [static-export SPA, localStorage auth, gateway fetch wrapper, route group layout]

key-files:
  created:
    - apps/dashboard/package.json
    - apps/dashboard/tsconfig.json
    - apps/dashboard/next.config.ts
    - apps/dashboard/postcss.config.mjs
    - apps/dashboard/src/app/layout.tsx
    - apps/dashboard/src/app/globals.css
    - apps/dashboard/src/app/page.tsx
    - apps/dashboard/src/app/login/page.tsx
    - apps/dashboard/src/app/(dashboard)/layout.tsx
    - apps/dashboard/src/app/(dashboard)/overview/page.tsx
    - apps/dashboard/src/app/(dashboard)/keys/page.tsx
    - apps/dashboard/src/app/(dashboard)/connectors/page.tsx
    - apps/dashboard/src/app/(dashboard)/usage/page.tsx
    - apps/dashboard/src/components/auth-guard.tsx
    - apps/dashboard/src/components/sidebar.tsx
    - apps/dashboard/src/lib/api.ts
    - apps/dashboard/src/lib/auth.ts
    - apps/dashboard/src/lib/types.ts
    - apps/dashboard/src/config.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Next.js 15.5 used (latest stable) -- plan referenced Next.js 16 but 15.5 is the latest available"
  - "Manual project scaffold instead of create-next-app (avoids interactive prompts in CI)"
  - "Tailwind v4 with @tailwindcss/postcss plugin (not legacy tailwind.config.js)"
  - "All pages use 'use client' directive for static export compatibility"
  - "Login validates token against /admin/keys before storing to prevent invalid tokens"
  - "localStorage key 'feelr_admin_token' with SSG guards (typeof window check)"

patterns-established:
  - "Static export SPA: output: 'export' with unoptimized images, all client components"
  - "Auth flow: localStorage token -> AuthGuard redirect -> gatewayFetch Bearer header"
  - "Route group: (dashboard) group wraps authenticated pages with Sidebar layout"
  - "Gateway client: gatewayFetch/gatewayMutate pattern for typed API calls"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 6 Plan 2: Dashboard App Scaffold Summary

**Next.js static-export SPA with admin token auth, sidebar navigation (Overview/Keys/Connectors/Usage), and gateway API client using Bearer header auth**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T03:21:59Z
- **Completed:** 2026-02-07T03:26:07Z
- **Tasks:** 2
- **Files created:** 20

## Accomplishments
- Next.js 15.5 dashboard app at apps/dashboard/ with static export (output: 'export')
- Admin token login page that validates against gateway /admin/keys before storing
- AuthGuard component redirecting unauthenticated users to /login via localStorage check
- Sidebar with 4 nav sections (Overview, Keys, Connectors, Usage) using lucide-react icons
- Gateway API client (gatewayFetch, gatewayMutate) with Bearer token auth and typed responses
- Dark theme with zinc palette, Toaster for error notifications via sonner

## Task Commits

Each task was committed atomically:

1. **Task 1: Next.js 16 project scaffold with dependencies** - `ddcac0d` (feat)
2. **Task 2: Login page, auth guard, sidebar, API client, dashboard layout** - `16e1c8b` (feat, co-committed with 06-01 docs due to parallel execution)

**Note:** Task 2 files were inadvertently staged by the parallel 06-01 agent's docs commit. All files are correct and complete.

## Files Created/Modified
- `apps/dashboard/package.json` - Dashboard package with Next.js 15, React 19, Tailwind v4
- `apps/dashboard/tsconfig.json` - TypeScript config extending @feelr/tsconfig/base.json
- `apps/dashboard/next.config.ts` - Static export config (output: 'export')
- `apps/dashboard/postcss.config.mjs` - PostCSS config with @tailwindcss/postcss
- `apps/dashboard/.gitignore` - Excludes node_modules, .next/, out/
- `apps/dashboard/src/app/layout.tsx` - Root layout with dark theme and Toaster
- `apps/dashboard/src/app/globals.css` - Tailwind v4 import
- `apps/dashboard/src/app/page.tsx` - Root redirect (auth check -> /overview or /login)
- `apps/dashboard/src/app/login/page.tsx` - Admin token login with gateway validation
- `apps/dashboard/src/app/(dashboard)/layout.tsx` - AuthGuard + Sidebar flex layout
- `apps/dashboard/src/app/(dashboard)/overview/page.tsx` - Overview stub page
- `apps/dashboard/src/app/(dashboard)/keys/page.tsx` - API Keys stub page
- `apps/dashboard/src/app/(dashboard)/connectors/page.tsx` - Connectors stub page
- `apps/dashboard/src/app/(dashboard)/usage/page.tsx` - Usage stub page
- `apps/dashboard/src/components/auth-guard.tsx` - Auth guard with localStorage token check
- `apps/dashboard/src/components/sidebar.tsx` - Persistent sidebar with 4 nav links + logout
- `apps/dashboard/src/lib/api.ts` - Gateway fetch wrapper with Bearer auth
- `apps/dashboard/src/lib/auth.ts` - localStorage token management (get/set/clear)
- `apps/dashboard/src/lib/types.ts` - Dashboard types (ApiKey, ConnectorStatus, Usage, etc.)
- `apps/dashboard/src/config.ts` - GATEWAY_URL and APP_NAME constants

## Decisions Made
- **Next.js 15.5 instead of 16:** Plan referenced Next.js 16, but 15.5.12 is the latest stable release. Used 15.5 as it is production-ready.
- **Manual scaffold over create-next-app:** Interactive prompts cannot be suppressed in CI/automated contexts. Created files manually for reliable execution.
- **Tailwind v4 with PostCSS:** Used `@tailwindcss/postcss` plugin instead of legacy `tailwind.config.js` approach, consistent with Tailwind v4 patterns.
- **Token validation on login:** Login page validates the admin token by calling `/admin/keys` before storing, preventing invalid tokens from being saved.
- **No shadcn/ui:** Plan execution context specified not to use shadcn/ui. Built UI with plain Tailwind CSS for lighter footprint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added postcss.config.mjs for Tailwind v4**
- **Found during:** Task 1 (project scaffold)
- **Issue:** Tailwind v4 requires PostCSS config with @tailwindcss/postcss plugin
- **Fix:** Created postcss.config.mjs with @tailwindcss/postcss plugin
- **Files modified:** apps/dashboard/postcss.config.mjs
- **Verification:** Build succeeds with Tailwind styles
- **Committed in:** ddcac0d (Task 1 commit)

**2. [Rule 3 - Blocking] Added .gitignore for dashboard**
- **Found during:** Task 1 (project scaffold)
- **Issue:** Build artifacts (.next/, out/, node_modules/) would be committed without gitignore
- **Fix:** Created .gitignore excluding build artifacts and local files
- **Files modified:** apps/dashboard/.gitignore
- **Verification:** git status shows clean after build
- **Committed in:** ddcac0d (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for correct project setup. No scope creep.

## Issues Encountered
- **Parallel execution conflict:** The 06-01 agent's docs commit (`16e1c8b`) inadvertently staged and committed Task 2 files that were in the working tree. All file content is correct and the build passes. This is a cosmetic attribution issue only -- no functional impact.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard scaffold complete with all stub pages for overview, keys, connectors, usage
- Auth flow (login -> guard -> sidebar layout) fully functional
- Gateway API client ready for use by page implementations in plans 06-03 through 06-05
- Static export verified: `next build` produces `out/` with all 7 HTML pages

## Self-Check: PASSED

---
*Phase: 06-dashboard*
*Completed: 2026-02-07*
