---
phase: 31-cloud-deploy-workflows
plan: 01
subsystem: infra
tags: [cloudflare-workers, wrangler, pnpm, stripe, ci-cd, github-actions, esbuild]

# Dependency graph
requires:
  - phase: 30-pipeline-foundations
    provides: "Root pnpm-lock.yaml enabling deterministic installs across all cloud repo workflows"
provides:
  - "Working gateway deploy workflow with frozen lockfile install and wrangler deploy"
  - "Pinned stripe dependency (^20.3.1) for lockfile stability"
  - "Wrangler alias config for cross-workspace stripe resolution in pnpm"
affects: [31-02, 31-03, 32-release-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wrangler [alias] section for cross-workspace module resolution in pnpm strict mode"
    - "Pin all cloud-only npm dependencies to semver ranges (never use 'latest')"

key-files:
  created: []
  modified:
    - cloud/gateway/package.json
    - cloud/gateway/wrangler.cloud.toml
    - pnpm-lock.yaml

key-decisions:
  - "Used wrangler [alias] to resolve stripe from cloud/gateway/node_modules instead of adding stripe to OSS package"
  - "Pinned stripe to ^20.3.1 (current latest) instead of 'latest' for lockfile determinism"
  - "Selected esm worker entry point (stripe.esm.worker.js) for alias target to match Cloudflare Workers runtime"

patterns-established:
  - "Use wrangler [alias] for cloud-only dependencies imported by OSS code in pnpm monorepos"
  - "Always pin dependency versions in cloud package.json to maintain lockfile consistency"

# Metrics
duration: 6min
completed: 2026-02-17
---

# Phase 31 Plan 01: Gateway Deploy Workflow Summary

**Pinned stripe to ^20.3.1 and added wrangler esbuild alias to resolve cross-workspace pnpm imports for cloud gateway deploy**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-17T14:31:55Z
- **Completed:** 2026-02-17T14:38:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Pinned stripe dependency from "latest" to "^20.3.1" for lockfile stability
- Added wrangler [alias] config to resolve stripe from cloud/gateway/node_modules (pnpm strict mode fix)
- Validated wrangler dry-run build for both staging and production environments (582 KiB bundle, 109 KiB gzipped)
- Confirmed frozen lockfile install succeeds from repo root

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin stripe dependency and verify gateway workflow configuration** - `4722648` (fix)
2. **Task 2: Validate gateway build chain end-to-end locally** - `59a6f85` (fix)

## Files Created/Modified
- `cloud/gateway/package.json` - Pinned stripe from "latest" to "^20.3.1"
- `cloud/gateway/wrangler.cloud.toml` - Added [alias] section mapping stripe to local esm worker entry point
- `pnpm-lock.yaml` - Regenerated to reflect pinned stripe version

## Decisions Made
- **Wrangler alias over OSS dependency:** Used wrangler's [alias] config to map `stripe` to `./node_modules/stripe/esm/stripe.esm.worker.js` instead of adding stripe as a dependency in the OSS gateway package. Rationale: billing/stripe is cloud-only functionality; adding it to OSS would pollute the open-source package with a cloud-specific dependency.
- **ESM worker entry point:** Selected `stripe.esm.worker.js` (the workerd/worker conditional export) as the alias target since the gateway runs on Cloudflare Workers. This matches what Stripe's package.json exports for the "worker" and "workerd" conditions.
- **Semver range over exact pin:** Used `^20.3.1` instead of `20.3.1` to allow patch updates while maintaining lockfile stability. The key fix was eliminating "latest" which resolves differently each time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added wrangler [alias] for stripe module resolution**
- **Found during:** Task 2 (Validate gateway build chain)
- **Issue:** Wrangler dry-run failed with "Could not resolve stripe" because pnpm strict node_modules prevents esbuild from resolving stripe when the importing file (oss/apps/gateway/src/billing/stripe/stripe-client.ts) is in a different workspace than the package declaring the dependency (cloud/gateway)
- **Fix:** Added `[alias]` section to wrangler.cloud.toml mapping "stripe" to "./node_modules/stripe/esm/stripe.esm.worker.js"
- **Files modified:** cloud/gateway/wrangler.cloud.toml
- **Verification:** Wrangler dry-run succeeds for both staging and production environments
- **Committed in:** 59a6f85 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix -- without the alias, the gateway cannot be bundled or deployed. No scope creep.

## Issues Encountered
- TypeScript compilation (`tsc --noEmit`) has pre-existing rootDir/include mismatches in cloud/gateway/tsconfig.json (test files from oss included under wrong rootDir). This is not blocking since wrangler uses esbuild for bundling, not tsc. The tsconfig issues are out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Gateway deploy workflow is ready: dependencies install cleanly, wrangler bundles successfully
- Both staging and production deploy jobs correctly reference wrangler.cloud.toml with correct --env flags
- Secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) must be configured in GitHub repo settings (pre-existing requirement)
- cloud/gateway/tsconfig.json has pre-existing issues that may need cleanup in a future plan

## Self-Check: PASSED

All artifacts verified:
- cloud/gateway/package.json: FOUND
- cloud/gateway/wrangler.cloud.toml: FOUND
- pnpm-lock.yaml: FOUND
- .github/workflows/gateway.yml: FOUND
- 31-01-SUMMARY.md: FOUND
- Commit 4722648: FOUND
- Commit 59a6f85: FOUND

---
*Phase: 31-cloud-deploy-workflows*
*Completed: 2026-02-17*
