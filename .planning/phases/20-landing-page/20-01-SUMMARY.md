---
phase: 20-landing-page
plan: 01
subsystem: ui
tags: [next-font, tailwind-v4, seo-metadata, cloudflare-analytics, typography]

# Dependency graph
requires:
  - phase: 16-dashboard-ci
    provides: "Dashboard CI/CD pipeline (dashboard.yml) for staging and production deploys"
provides:
  - "Brand typography (Inter, Space Grotesk, JetBrains Mono) via next/font/google with CSS variables"
  - "Tailwind v4 font utilities (font-sans, font-heading, font-mono) via @theme inline"
  - "Base SEO metadata with metadataBase, title template, and Open Graph site name"
  - "CfAnalytics client component for conditional Cloudflare Web Analytics beacon"
  - "CI/CD env var wiring for CF analytics token (staging + production)"
affects: [20-landing-page, dashboard-pages]

# Tech tracking
tech-stack:
  added: []
  patterns: ["next/font/google CSS variable bridge to Tailwind v4 @theme inline", "conditional analytics beacon via env var"]

key-files:
  created:
    - apps/dashboard/src/app/fonts.ts
    - apps/dashboard/src/components/cf-analytics.tsx
  modified:
    - apps/dashboard/src/app/globals.css
    - apps/dashboard/src/app/layout.tsx
    - .github/workflows/dashboard.yml

key-decisions:
  - "Used @theme inline (not @theme) for runtime CSS variable resolution from next/font"
  - "JSON.stringify for data-cf-beacon attribute (safe serialization vs template literal)"

patterns-established:
  - "Font variable bridge: fonts.ts exports -> layout.tsx html className -> globals.css @theme inline -> Tailwind utilities"
  - "Conditional third-party script: env var check in server layout -> client Script component"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 20 Plan 01: Typography, Metadata & Analytics Foundation Summary

**Brand typography (Inter, Space Grotesk, JetBrains Mono) wired through next/font to Tailwind v4 @theme inline, base SEO metadata with title template, and conditional Cloudflare Web Analytics beacon**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T14:29:25Z
- **Completed:** 2026-02-11T14:31:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Three Google fonts (Inter body, Space Grotesk headings, JetBrains Mono code) defined with CSS variables and mapped to Tailwind utilities via @theme inline
- Root layout upgraded with font variable classes on html, font-sans on body, and comprehensive base metadata (metadataBase, title template, OG siteName)
- CfAnalytics client component conditionally renders Cloudflare beacon when NEXT_PUBLIC_CF_ANALYTICS_TOKEN is set
- CI/CD workflow updated with analytics token env vars for both staging and production builds

## Task Commits

Each task was committed atomically:

1. **Task 1: Font definitions and Tailwind v4 CSS variable bridge** - `5ce0d66` (feat)
2. **Task 2: Root layout upgrade with fonts, metadata, and analytics** - `8518467` (feat)

## Files Created/Modified
- `apps/dashboard/src/app/fonts.ts` - Font definitions for Inter, Space Grotesk, JetBrains Mono with CSS variable exports
- `apps/dashboard/src/app/globals.css` - Tailwind v4 @theme inline mapping font CSS variables to utilities (font-sans, font-heading, font-mono)
- `apps/dashboard/src/app/layout.tsx` - Root layout with font variable classes, base SEO metadata, conditional CF analytics
- `apps/dashboard/src/components/cf-analytics.tsx` - Client component wrapping Cloudflare beacon Script
- `.github/workflows/dashboard.yml` - Added NEXT_PUBLIC_CF_ANALYTICS_TOKEN to staging and production build env blocks

## Decisions Made
- Used `@theme inline` (not `@theme`) for Tailwind font variable mapping because next/font injects CSS variables at runtime via class names, and Tailwind needs `inline` to keep var() references in output CSS rather than resolving at build time
- Used `JSON.stringify({ token })` for the data-cf-beacon attribute instead of template literal string for safe JSON serialization

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** The following must be set up before analytics will function:

- **NEXT_PUBLIC_CF_ANALYTICS_TOKEN**: Obtain from Cloudflare Dashboard -> Web Analytics -> Add a site -> app.feelr.dev
- **GitHub Secrets**: Add `CF_ANALYTICS_TOKEN_STAGING` and `CF_ANALYTICS_TOKEN_PRODUCTION` to the repo secrets

Note: The build and deployment work without these tokens -- CfAnalytics simply does not render.

## Next Phase Readiness
- Font utilities (font-sans, font-heading, font-mono) available for all pages
- Base metadata template active -- child pages can override with page-specific metadata
- Ready for Plan 02 (landing page content) which depends on these font utilities and metadata template

## Self-Check: PASSED

All 6 files verified present. Both commit hashes (5ce0d66, 8518467) confirmed in git log.

---
*Phase: 20-landing-page*
*Completed: 2026-02-11*
