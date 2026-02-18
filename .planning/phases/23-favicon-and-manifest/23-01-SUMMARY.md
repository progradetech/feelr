---
phase: 23-favicon-and-manifest
plan: 01
subsystem: ui
tags: [sharp, sharp-ico, favicon, svg, icons, pwa, next-metadata]

# Dependency graph
requires:
  - phase: none
    provides: "assets/feelr-logomark.svg source SVG already exists"
provides:
  - "favicon.ico (32+16 multi-res ICO) for both apps"
  - "icon.svg (adaptive dark/light SVG favicon) for both apps"
  - "apple-icon.png (180px) for both apps"
  - "icon-192.png and icon-512.png manifest PNGs for both apps"
  - "scripts/generate-icons.ts reproducible build script"
  - "pnpm generate-icons root workspace script"
affects: [23-02, manifest, dashboard, docs]

# Tech tracking
tech-stack:
  added: [sharp@0.34.5, sharp-ico@0.1.5]
  patterns: ["SVG-to-raster icon generation via build script", "Next.js file-based metadata convention for icons", "Adaptive SVG favicon with prefers-color-scheme CSS"]

key-files:
  created:
    - scripts/generate-icons.ts
    - apps/dashboard/src/app/favicon.ico
    - apps/dashboard/src/app/icon.svg
    - apps/dashboard/src/app/apple-icon.png
    - apps/dashboard/public/icon-192.png
    - apps/dashboard/public/icon-512.png
    - apps/docs/app/favicon.ico
    - apps/docs/app/icon.svg
    - apps/docs/app/apple-icon.png
    - apps/docs/public/icon-192.png
    - apps/docs/public/icon-512.png
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "sharp + sharp-ico for SVG-to-ICO/PNG generation (standard Node.js image processing)"
  - "Only 32+16 sizes in favicon.ico (1KB) -- SVG handles modern browsers"
  - "Shortened gradient IDs (fgL/fgR) in icon.svg for cleaner markup"

patterns-established:
  - "Icon generation from source SVG: pnpm generate-icons regenerates all assets"
  - "File-based metadata: place files in app/ dir, Next.js auto-generates link tags"
  - "Adaptive SVG: use prefers-color-scheme in embedded style block"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Phase 23 Plan 01: Icon Asset Generation Summary

**Sharp-based build script generating favicon.ico, apple-icon.png, and manifest PNGs from source SVG, plus adaptive dark/light SVG favicon for both apps**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T03:35:09Z
- **Completed:** 2026-02-12T03:37:29Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Reproducible icon generation script that converts `assets/feelr-logomark.svg` into all required raster formats
- Multi-resolution favicon.ico (32+16) at only 1KB for both dashboard and docs
- Adaptive SVG favicon with CSS `prefers-color-scheme` media query (white dots on dark, dark dots on light)
- Manifest-ready PNGs (192px and 512px) placed in public/ directories for both apps

## Task Commits

Each task was committed atomically:

1. **Task 1: Install sharp dependencies and create icon generation script** - `4a2551f` (feat)
2. **Task 2: Create adaptive SVG favicon with dark/light mode for both apps** - `bfcf55d` (feat)

## Files Created/Modified
- `scripts/generate-icons.ts` - Build script: reads source SVG, generates ICO + PNG at multiple sizes for both apps
- `package.json` - Added generate-icons script and sharp/sharp-ico dev dependencies
- `pnpm-lock.yaml` - Updated lockfile with new dependencies
- `apps/dashboard/src/app/favicon.ico` - Generated 32+16 multi-resolution ICO (1011 bytes)
- `apps/dashboard/src/app/icon.svg` - Adaptive SVG favicon with dark/light mode
- `apps/dashboard/src/app/apple-icon.png` - Generated 180x180 PNG (2868 bytes)
- `apps/dashboard/public/icon-192.png` - Generated 192x192 PNG for manifest (3295 bytes)
- `apps/dashboard/public/icon-512.png` - Generated 512x512 PNG for manifest (9233 bytes)
- `apps/docs/app/favicon.ico` - Same ICO as dashboard
- `apps/docs/app/icon.svg` - Same adaptive SVG as dashboard
- `apps/docs/app/apple-icon.png` - Same 180px PNG as dashboard
- `apps/docs/public/icon-192.png` - Same 192px PNG as dashboard
- `apps/docs/public/icon-512.png` - Same 512px PNG as dashboard

## Decisions Made
- Used `sharp-ico` `encode()` API with pre-generated PNG buffers (not `sharpsToIco` which writes to disk)
- Only included 32px and 16px in favicon.ico -- keeps file at 1KB vs multi-KB for larger sizes; SVG favicon handles modern browsers
- Used shortened gradient IDs `fgL`/`fgR` in icon.svg instead of original `markGradL`/`markGradR` for cleaner markup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All icon files placed per Next.js file-based metadata conventions -- auto-detected at build time
- Manifest PNGs in public/ directories ready for web manifest references (Plan 23-02)
- No layout.tsx changes required for icon detection

## Self-Check: PASSED

All 11 created files verified present. Both task commits (4a2551f, bfcf55d) verified in git log.

---
*Phase: 23-favicon-and-manifest*
*Completed: 2026-02-12*
