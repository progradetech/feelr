---
phase: 14-azure-static-web-apps-provisioning
plan: 01
subsystem: infra
tags: [azure, swa, static-web-apps, next.js, nextra, deployment]

# Dependency graph
requires:
  - phase: 10-dashboard-docs
    provides: "Next.js dashboard and Nextra docs apps with static export"
provides:
  - "Azure resource group feelr-rg in Central US"
  - "Azure SWA resource feelr-dashboard (Standard plan)"
  - "Azure SWA resource feelr-docs (Standard plan)"
  - "Dashboard deployed at nice-island-0a28e4710.1.azurestaticapps.net"
  - "Docs deployed at icy-coast-012670e10.4.azurestaticapps.net"
  - "SWA routing config (security headers, 404 handling, static asset caching)"
  - "Turborepo out/** build output caching"
affects: [14-02-custom-domains, 15-swa-cicd]

# Tech tracking
tech-stack:
  added: ["@azure/static-web-apps-cli"]
  patterns: ["SWA deploy via CLI with deployment tokens", "staticwebapp.config.json in out/ directory"]

key-files:
  created:
    - "apps/dashboard/staticwebapp.config.json"
    - "apps/docs/staticwebapp.config.json"
    - "apps/docs/app/not-found.tsx"
  modified:
    - "turbo.json"
    - "apps/docs/app/docs/_meta.ts"
    - "apps/docs/app/page.mdx"
    - "apps/docs/tsconfig.json"

key-decisions:
  - "Register Microsoft.Web resource provider before SWA creation (subscription prerequisite)"
  - "Standard plan for both SWAs (required for custom domains in Plan 02)"
  - "Fix Nextra 4.6.1 strict schema: remove unsupported newWindow property from _meta.ts"
  - "Add explicit Cards import in page.mdx for Nextra v4 compatibility"
  - "GitHub secrets deferred: gh CLI not authenticated, tokens retrievable via az CLI"

patterns-established:
  - "SWA deployment: build -> copy staticwebapp.config.json to out/ -> deploy via swa-cli"
  - "Dashboard build requires NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev"

# Metrics
duration: 17min
completed: 2026-02-10
---

# Phase 14 Plan 01: Azure SWA Provisioning Summary

**Two Azure SWA resources (Standard plan) provisioned and deployed with dashboard at nice-island-0a28e4710.1.azurestaticapps.net and docs at icy-coast-012670e10.4.azurestaticapps.net**

## Performance

- **Duration:** 17 min
- **Started:** 2026-02-10T05:59:34Z
- **Completed:** 2026-02-10T06:16:18Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Provisioned two Azure SWA resources on Standard plan in feelr-rg resource group (Central US)
- Created SWA routing config with security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy), 404 handling, and static asset caching
- Fixed Turborepo build outputs to include out/** for Next.js static exports
- Fixed docs build failures (Nextra 4.6.1 strict schema validation, missing Cards import)
- Deployed both apps and verified HTTP 200 responses with active security headers

## Default Hostnames (CNAME targets for Plan 02)

| App | Default Hostname |
|-----|-----------------|
| Dashboard | `nice-island-0a28e4710.1.azurestaticapps.net` |
| Docs | `icy-coast-012670e10.4.azurestaticapps.net` |

These hostnames are the CNAME targets needed by Plan 02 for custom domain setup (app.feelr.dev and docs.feelr.dev).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SWA config files and fix Turborepo build outputs** - `f3671fe` (feat)
2. **Task 2: Authenticate Azure CLI** - N/A (human checkpoint, no files changed)
3. **Task 3: Create SWA resources, build apps, and deploy** - `1b46168` (feat)

## Files Created/Modified
- `apps/dashboard/staticwebapp.config.json` - SWA routing config for dashboard (security headers, 404, caching)
- `apps/docs/staticwebapp.config.json` - SWA routing config for docs (same structure)
- `apps/docs/app/not-found.tsx` - Custom 404 page for App Router compatibility
- `apps/docs/app/docs/_meta.ts` - Removed invalid newWindow property for Nextra 4.6.1 strict schema
- `apps/docs/app/page.mdx` - Added Cards component import for Nextra v4
- `apps/docs/tsconfig.json` - Auto-updated by Next.js (added .next/types includes)
- `turbo.json` - Added out/** to build outputs alongside dist/**

## Decisions Made
- **Register Microsoft.Web provider first:** The Azure subscription was not registered for Microsoft.Web namespace. Registered it before creating SWA resources.
- **Standard plan for both SWAs:** Required for custom domain support in Plan 02. Free plan does not support custom domains.
- **Fix Nextra docs build:** The docs app had never been successfully built. Fixed three issues: invalid `newWindow` property in `_meta.ts` (Nextra 4.6.1 uses Zod strict schemas), missing `Cards` import in `page.mdx`, and missing `not-found.tsx` for App Router.
- **GitHub secrets deferred:** The gh CLI is not authenticated on this machine. Deployment tokens are retrievable anytime via `az staticwebapp secrets list`. CI/CD workflows (Phase 15) will need these stored as `SWA_DASHBOARD_DEPLOYMENT_TOKEN` and `SWA_DOCS_DEPLOYMENT_TOKEN`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered Microsoft.Web resource provider**
- **Found during:** Task 3 (SWA resource creation)
- **Issue:** Azure subscription not registered for Microsoft.Web namespace, causing MissingSubscriptionRegistration error
- **Fix:** Ran `az provider register --namespace Microsoft.Web --wait`
- **Files modified:** None (Azure subscription configuration)
- **Verification:** `az provider show --namespace Microsoft.Web` returns "Registered"
- **Committed in:** 1b46168 (part of Task 3)

**2. [Rule 1 - Bug] Fixed Nextra 4.6.1 strict schema validation in _meta.ts**
- **Found during:** Task 3 (docs build)
- **Issue:** `newWindow: true` property in `_meta.ts` not part of Nextra 4.6.1's Zod strict schema, causing "Invalid input" error on all pages
- **Fix:** Removed `newWindow: true` from the Self-Hosting entry in `app/docs/_meta.ts`
- **Files modified:** `apps/docs/app/docs/_meta.ts`
- **Verification:** Build completes without "Invalid input" error
- **Committed in:** 1b46168 (part of Task 3)

**3. [Rule 1 - Bug] Added missing Cards import in page.mdx**
- **Found during:** Task 3 (docs build)
- **Issue:** Root `page.mdx` uses `<Cards>` component without importing it, causing "Expected component Cards to be defined" error
- **Fix:** Added `import { Cards } from 'nextra/components'` at top of `app/page.mdx`
- **Files modified:** `apps/docs/app/page.mdx`
- **Verification:** Build completes, root page renders Cards component
- **Committed in:** 1b46168 (part of Task 3)

**4. [Rule 1 - Bug] Added not-found.tsx for App Router 404 handling**
- **Found during:** Task 3 (docs build)
- **Issue:** Missing `not-found.tsx` caused Next.js to fall back to Pages Router `_error` page, which uses `<Html>` from `next/document` (not allowed in App Router)
- **Fix:** Created `apps/docs/app/not-found.tsx` with simple 404 page
- **Files modified:** `apps/docs/app/not-found.tsx` (created)
- **Verification:** Build no longer errors on /_not-found prerendering
- **Committed in:** 1b46168 (part of Task 3)

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking)
**Impact on plan:** All fixes necessary for the docs app to build and deploy. The docs app had never been built before; these were latent bugs from Phase 10. No scope creep.

## Issues Encountered
- **GitHub secrets not set:** The gh CLI is not authenticated on this machine. The deployment tokens were successfully retrieved and used for deployment, but could not be stored as GitHub Actions secrets. This is a prerequisite for Phase 15 CI/CD workflows. The tokens can be set later via `gh secret set` or the GitHub web UI. Token retrieval command: `az staticwebapp secrets list --name <app-name> --resource-group feelr-rg --query "properties.apiKey" -o tsv`

## User Setup Required

GitHub Actions secrets need to be configured before CI/CD deployment workflows:
- `SWA_DASHBOARD_DEPLOYMENT_TOKEN` - Retrieved via `az staticwebapp secrets list --name feelr-dashboard --resource-group feelr-rg --query "properties.apiKey" -o tsv`
- `SWA_DOCS_DEPLOYMENT_TOKEN` - Retrieved via `az staticwebapp secrets list --name feelr-docs --resource-group feelr-rg --query "properties.apiKey" -o tsv`

## Next Phase Readiness
- Both SWA resources exist on Standard plan, ready for custom domain configuration (Plan 02)
- CNAME targets recorded: `nice-island-0a28e4710.1.azurestaticapps.net` and `icy-coast-012670e10.4.azurestaticapps.net`
- Cloudflare orange-cloud proxy must be disabled during Azure domain verification (noted in STATE.md blockers)
- GitHub secrets for deployment tokens need to be set before Phase 15

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 14-azure-static-web-apps-provisioning*
*Completed: 2026-02-10*
