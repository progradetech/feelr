---
phase: 28-cicd-migration
plan: 02
subsystem: infra
tags: [github-actions, ci-cd, cloudflare-workers, azure-swa, goreleaser, git-subtree, repository-dispatch]

# Dependency graph
requires:
  - phase: 27-repository-split
    plan: 03
    provides: Cloud overlay with gateway-entry.ts, wrangler.cloud.toml, and workspace config
provides:
  - Sync workflow receiving repository_dispatch events and running git subtree pull
  - Gateway deploy workflow using cloud/gateway working directory with wrangler.cloud.toml
  - Dashboard deploy workflow with oss/ prefixed paths for Azure SWA
  - Docs deploy workflow with oss/ prefixed paths for Azure SWA
  - GoReleaser release workflow with workdir: oss for subdirectory CLI builds
affects: [28-cicd-migration-plan-01, 28-cicd-migration-plan-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cloud deploy workflows use oss/ prefix for all OSS content paths"
    - "Gateway deploy uses explicit -c wrangler.cloud.toml flag to select cloud config"
    - "Sync workflow uses pnpm install (not --frozen-lockfile) to handle OSS dependency changes"
    - "GoReleaser workdir: oss parameter for subdirectory builds without Pro license"

key-files:
  created:
    - .github/workflows/sync.yml (cloud repo)
    - .github/workflows/gateway.yml (cloud repo)
    - .github/workflows/dashboard.yml (cloud repo)
    - .github/workflows/docs.yml (cloud repo)
    - .github/workflows/release.yml (cloud repo)
  modified: []

key-decisions:
  - "Sync workflow uses pnpm install without --frozen-lockfile because subtree pulls may change OSS dependencies requiring lockfile regeneration"
  - "Lockfile changes are folded into sync commit via git commit --amend to keep history clean"
  - "Dashboard workflow includes CF_ANALYTICS_TOKEN_STAGING/PRODUCTION env vars; docs workflow does not (pure content site)"

patterns-established:
  - "Cloud repo workflow path filters use oss/ prefix: oss/apps/gateway/**, oss/packages/**, oss/connectors/**"
  - "Gateway deploy command: deploy -c wrangler.cloud.toml --env staging|production"
  - "GoReleaser: workdir: oss + go-version-file: oss/cli/go.mod for subtree builds"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 28 Plan 02: Cloud Repo CI/CD Workflows Summary

**5 GitHub Actions workflows for cloud repo: OSS subtree sync receiver, gateway/dashboard/docs deploy with oss/-prefixed paths and wrangler.cloud.toml, and GoReleaser release from oss/ subdirectory**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T18:25:24Z
- **Completed:** 2026-02-13T18:27:18Z
- **Tasks:** 2
- **Files modified:** 5 (all in cloud repo)

## Accomplishments
- Created sync.yml workflow that receives repository_dispatch events (type: oss-sync), runs git subtree pull --prefix=oss with full history checkout, handles lockfile regeneration, and pushes sync commits
- Created gateway.yml, dashboard.yml, and docs.yml deploy workflows adapted from OSS repo with oss/ path prefixes, cloud/gateway workingDirectory, and wrangler.cloud.toml config selection
- Created release.yml workflow using GoReleaser workdir: oss for subdirectory CLI builds without Pro license
- All 5 workflows pushed to progradetech/feelr-cloud main branch and verified via GitHub API

## Task Commits

1. **Task 1: Create sync and deploy workflows** - `65b9114` (ci) -- committed and pushed to progradetech/feelr-cloud
2. **Task 2: Create release workflow and push** - `65b9114` (ci) -- same commit (all 5 workflows committed together per plan)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `.github/workflows/sync.yml` (cloud repo) - OSS subtree sync receiver triggered by repository_dispatch with oss-sync event type
- `.github/workflows/gateway.yml` (cloud repo) - Cloud gateway deploy using cloud/gateway workingDirectory and wrangler.cloud.toml (staging + production)
- `.github/workflows/dashboard.yml` (cloud repo) - Dashboard deploy to Azure SWA with oss/apps/dashboard paths and CF_ANALYTICS_TOKEN env vars
- `.github/workflows/docs.yml` (cloud repo) - Docs deploy to Azure SWA with oss/apps/docs paths (no CF analytics)
- `.github/workflows/release.yml` (cloud repo) - GoReleaser CLI release with workdir: oss and go-version-file: oss/cli/go.mod

## Decisions Made
- Sync workflow uses `pnpm install` (without `--frozen-lockfile`) because subtree pulls may introduce OSS dependency changes that require lockfile regeneration. Changes are folded into the sync commit via `git commit --amend --no-edit`.
- Dashboard workflow includes `CF_ANALYTICS_TOKEN_STAGING` and `CF_ANALYTICS_TOKEN_PRODUCTION` env vars; docs workflow does not include these because the docs site is a pure content site that does not use Cloudflare analytics.
- All 5 workflows were committed in a single commit to the cloud repo per the plan specification.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Secrets must be configured separately (covered by Plan 03).

## Next Phase Readiness
- All 5 cloud repo workflows are on the default branch (main) and can now receive repository_dispatch events
- Plan 01 (public repo dispatch trigger) can be executed to complete the sync chain
- Plan 03 (secret migration) can be executed to provide the deployment secrets these workflows reference
- The production GitHub environment needs to be created on the cloud repo for the environment approval gates in gateway.yml and dashboard.yml

## Self-Check: PASSED

All 5 artifact checks verified via GitHub API:
- sync.yml on cloud repo: FOUND (repository_dispatch with oss-sync confirmed)
- gateway.yml on cloud repo: FOUND (cloud/gateway workingDirectory and wrangler.cloud.toml confirmed)
- dashboard.yml on cloud repo: FOUND (oss/apps/dashboard paths confirmed)
- docs.yml on cloud repo: FOUND (oss/apps/docs paths confirmed)
- release.yml on cloud repo: FOUND (workdir: oss and go-version-file: oss/cli/go.mod confirmed)
- Commit 65b9114 on cloud repo: FOUND

---
*Phase: 28-cicd-migration*
*Completed: 2026-02-13*
