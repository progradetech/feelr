# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** An AI agent can call any supported external API in one line with near-zero context overhead
**Current focus:** v1.4 Open Core -- Phase 28 in progress (CI/CD migration)

## Current Position

Phase: 28 of 29 (CI/CD Migration)
Plan: 3 of 3 (COMPLETE)
Status: Phase 28 Complete
Last activity: 2026-02-16 -- Completed 28-03 (secrets configuration and E2E verification)

Progress: [██████████████████████████████] 94/94 plans (91 prior + 3/3 Phase 28)

## Milestone History

| Milestone | Phases | Plans | Shipped |
|-----------|--------|-------|---------|
| v1.0 MVP | 1-10 | 51 | 2026-02-09 |
| v1.1 Deployment & CI/CD | 11-16 | 13 | 2026-02-10 |
| v1.2 Marketing & Onboarding | 17-21 | 11 | 2026-02-11 |
| v1.3 Staging & Branding | 22-24 | 7 | 2026-02-12 |
| v1.4 Open Core | 25-29 | TBD | -- |

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 51
- Average duration: 3 min
- Total execution time: 154 min
- Timeline: 5 days (2026-02-05 to 2026-02-09)

**v1.1 Velocity:**
- Total plans completed: 13
- Average duration: 3 min
- Total execution time: ~41 min
- Timeline: 2 days (2026-02-09 to 2026-02-10)

**v1.2 Velocity:**
- Total plans completed: 11
- Tasks: 25
- Timeline: 2 days (2026-02-10 to 2026-02-11)

**v1.3 Velocity:**
- Total plans completed: 7
- Tasks: ~17
- Commits: 30
- Files modified: 54
- Timeline: 2 days (2026-02-11 to 2026-02-12)

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table with outcomes.

- [25-01] Used path-based gitleaks allowlists organized by category (8 entries) for auditability
- [25-01] Included .next/ and .turbo/ allowlist entries for dir-mode scans despite being gitignored
- [25-01] Used zricethezav/gitleaks module path (upstream module path changed)
- [25-02] Added **/.env alongside bare .env for explicit auditability (both match at any depth in git)
- [25-02] 10 secrets marked ROTATE after Phase 27; 2 marked SAFE (CLOUDFLARE_ACCOUNT_ID, GITHUB_TOKEN)
- [25-02] Fresh snapshot approach for public repo means .planning/ exclusion requires no git filter
- [25-03] No .gitleaks.toml changes needed -- Plan 01 allowlist was comprehensive for zero findings
- [25-03] Git history scan also clean (373 commits) confirming allowlist covers all false positives
- [26-01] Used (c.env as any).BILLING_PROVIDER cast -- Plan 02 adds proper AppEnv typing
- [26-01] Kept billing.enabled as first guard before provider for zero-cost self-hosted path
- [26-01] plan-enforcer.ts preserved for Plan 02 extraction reference
- [26-02] Used tsconfig exclude for billing/stripe/ so gateway typechecks without stripe npm package
- [26-02] StripeBillingProvider takes secretKey in constructor for clean dependency injection
- [26-02] Stripped createStripeClientFromEnv from meter.ts -- provider owns env-to-client mapping
- [26-03] Refined dashboard boundary check to exclude Stripe connector references (product feature vs billing infrastructure)
- [26-03] Phase 26 fully validated: 5 boundary checks pass, BILL-05 confirmed, all success criteria met
- [27-01] Excluded pnpm-lock.yaml from snapshot so public repo generates its own lockfile on first install
- [27-01] Combined staging/production env check into single conditional for cleaner graceful skip logic
- [27-02] Force-pushed clean snapshot over existing private repo then changed visibility to public
- [27-02] Used --accept-visibility-change-consequences flag for private-to-public visibility change
- [27-03] Cloud tsconfig includes all OSS gateway source (no billing/stripe/ exclude) since cloud overlay needs those types
- [27-03] Cloud gateway package has deploy scripts only (no typecheck/test) since wrangler bundles at deploy time
- [28-01] No local commits for Task 1 -- secret/environment deletion is GitHub API only
- [28-01] sync.yml uses CLOUD_REPO_PAT (not GITHUB_TOKEN) since cross-repo dispatch requires a PAT
- [28-01] Workflow will silently fail until CLOUD_REPO_PAT secret is created in Plan 03
- [28-02] Sync workflow uses pnpm install (not --frozen-lockfile) because subtree pulls may change OSS dependencies
- [28-02] Lockfile changes folded into sync commit via git commit --amend to keep history clean
- [28-02] Dashboard includes CF_ANALYTICS_TOKEN env vars; docs does not (pure content site)
- [28-03] User skipped CF_ANALYTICS_TOKEN_STAGING and CF_ANALYTICS_TOKEN_PRODUCTION (not yet set up in Cloudflare Web Analytics) -- 7 secrets instead of 9
- [28-03] Dashboard builds work without CF analytics tokens -- beacon simply will not render
- [28-03] GoReleaser verified via API config inspection since goreleaser CLI not installed locally

### Pending Todos

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Remove GIF placeholder in README | 2026-02-09 | 3c8b385 | [1-remove-gif-placeholder-in-readme](./quick/1-remove-gif-placeholder-in-readme/) |

### Blockers/Concerns

- v1.4 phases are strictly sequential -- no parallelization possible
- Public repo uses fresh snapshot (no git history) to prevent secret leakage
- Squash merge must be disabled on cloud repo (breaks git subtree markers)

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 28-03-PLAN.md (secrets configuration and E2E verification -- Phase 28 complete)
Resume file: None
