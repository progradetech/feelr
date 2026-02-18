---
phase: 23-favicon-and-manifest
plan: 02
subsystem: ui
tags: [web-manifest, metadataBase, viewport, themeColor, next-metadata, ci-cd, azure-swa]

# Dependency graph
requires:
  - phase: 23-01
    provides: "icon-192.png and icon-512.png manifest PNGs in public/ directories for both apps"
provides:
  - "manifest.webmanifest with app name, theme color, and icon references for both apps"
  - "Environment-aware metadataBase via NEXT_PUBLIC_SITE_URL for both apps"
  - "Viewport themeColor (#E85D3A) for mobile browser chrome on both apps"
  - "NEXT_PUBLIC_SITE_URL injection in all 4 CI deploy jobs (dashboard+docs x staging+production)"
affects: [dashboard, docs, ci-cd, seo, pwa]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Environment-aware metadataBase via NEXT_PUBLIC_SITE_URL", "Separate viewport export for themeColor (Next.js 14+ pattern)", "force-static on manifest.ts for static export compatibility"]

key-files:
  created:
    - apps/dashboard/src/app/manifest.ts
    - apps/docs/app/manifest.ts
  modified:
    - apps/dashboard/src/app/layout.tsx
    - apps/docs/app/layout.tsx
    - .github/workflows/dashboard.yml
    - .github/workflows/docs.yml

key-decisions:
  - "NEXT_PUBLIC_SITE_URL with localhost:3000 fallback for local dev (not hardcoded production URL)"
  - "Separate viewport export for themeColor (metadata.themeColor deprecated since Next.js 14)"
  - "dynamic = 'force-static' on manifest.ts for output: 'export' compatibility"

patterns-established:
  - "Environment URL injection: CI build steps set NEXT_PUBLIC_SITE_URL per environment"
  - "Viewport export: use separate 'export const viewport: Viewport' not metadata.themeColor"
  - "Static manifest: manifest.ts needs dynamic = 'force-static' with output: 'export'"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 23 Plan 02: Web Manifest & Metadata Integration Summary

**Web manifests with Lobster Red theme, env-aware metadataBase via NEXT_PUBLIC_SITE_URL, and CI injection for all four deploy targets**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T03:39:38Z
- **Completed:** 2026-02-12T03:43:04Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Web manifest files for both dashboard (name: Feelr) and docs (name: Feelr Docs) with 192+512 icon sizes and Lobster Red theme
- Environment-aware metadataBase replacing hardcoded URL -- resolves correctly for staging, production, and local dev
- Viewport themeColor export using Next.js 14+ pattern (separate viewport export, not deprecated metadata.themeColor)
- CI workflows inject NEXT_PUBLIC_SITE_URL for all 4 deploy environments (staging-app, app, staging-docs, feelr.dev)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add web manifest and update metadata for both apps** - `1e0c962` (feat)
2. **Task 2: Add NEXT_PUBLIC_SITE_URL to CI workflows** - `41e6cc0` (feat)
3. **Bug fix: Add force-static for static export compatibility** - `71f33c9` (fix)

## Files Created/Modified
- `apps/dashboard/src/app/manifest.ts` - Dashboard web manifest (Feelr, Lobster Red, 192+512 icons)
- `apps/docs/app/manifest.ts` - Docs web manifest (Feelr Docs, Lobster Red, 192+512 icons)
- `apps/dashboard/src/app/layout.tsx` - metadataBase from env var + viewport themeColor
- `apps/docs/app/layout.tsx` - metadataBase from env var + viewport themeColor
- `.github/workflows/dashboard.yml` - NEXT_PUBLIC_SITE_URL for staging + production build steps
- `.github/workflows/docs.yml` - NEXT_PUBLIC_SITE_URL for staging + production build steps

## Decisions Made
- Used NEXT_PUBLIC_SITE_URL with `http://localhost:3000` fallback instead of hardcoded production URL -- enables correct resolution in all environments including local dev
- Used separate `export const viewport: Viewport` for themeColor instead of `metadata.themeColor` which is deprecated since Next.js 14
- Added `export const dynamic = 'force-static'` to manifest.ts files -- required for compatibility with `output: 'export'` static site generation mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added dynamic = 'force-static' to manifest.ts for static export**
- **Found during:** Task 1 verification (build step)
- **Issue:** Next.js `output: 'export'` requires all route handlers to have `dynamic = 'force-static'`. The manifest.ts convention generates a route at `/manifest.webmanifest` which failed with: "export const dynamic = 'force-static'/export const revalidate not configured on route /manifest.webmanifest"
- **Fix:** Added `export const dynamic = 'force-static'` to both manifest.ts files
- **Files modified:** apps/dashboard/src/app/manifest.ts, apps/docs/app/manifest.ts
- **Verification:** Both apps build successfully, manifest.webmanifest appears in build output
- **Committed in:** 71f33c9

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for builds to succeed with static export. No scope creep.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All favicon and manifest work for Phase 23 is complete
- Both apps have full icon sets (favicon.ico, icon.svg, apple-icon.png) from Plan 01
- Both apps have web manifests with correct icon references from Plan 02
- CI workflows inject site URLs for all environments
- Ready for Phase 24 or any next phase

## Self-Check: PASSED

All 7 files verified present (2 created, 4 modified, 1 summary). All 3 commits (1e0c962, 41e6cc0, 71f33c9) verified in git log.

---
*Phase: 23-favicon-and-manifest*
*Completed: 2026-02-12*
