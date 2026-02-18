---
phase: 31-cloud-deploy-workflows
verified: 2026-02-17T15:00:00Z
status: human_needed
score: 10/10 must-haves verified
human_verification:
  - test: "Push to main on cloud repo with all secrets configured triggers gateway staging deploy to Cloudflare Workers without errors"
    expected: "wrangler deploy completes, smoke test at https://staging-api.feelr.dev/health returns 200"
    why_human: "Cannot run GitHub Actions CI or contact external Cloudflare API from this environment"
  - test: "Push to main on cloud repo triggers dashboard staging deploy to Azure SWA without errors"
    expected: "Azure/static-web-apps-deploy action completes, smoke test at https://staging-app.feelr.dev/health returns 200"
    why_human: "Cannot run GitHub Actions CI or contact external Azure SWA from this environment"
  - test: "Push to main on cloud repo triggers docs staging deploy to Azure SWA without errors"
    expected: "Azure/static-web-apps-deploy action completes, smoke test at https://staging-docs.feelr.dev/health returns 200"
    why_human: "Cannot run GitHub Actions CI or contact external Azure SWA from this environment"
  - test: "Confirm GitHub cloud repo secrets are set: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SWA_DASHBOARD_STAGING_TOKEN, SWA_DASHBOARD_DEPLOYMENT_TOKEN, SWA_DOCS_STAGING_TOKEN, SWA_DOCS_DEPLOYMENT_TOKEN"
    expected: "All 6 secrets exist in cloud repo GitHub settings; CF_ANALYTICS_TOKEN_STAGING and CF_ANALYTICS_TOKEN_PRODUCTION are optional"
    why_human: "Cannot access GitHub repo secrets via CLI without API access configured for the cloud repo"
---

# Phase 31: Cloud Deploy Workflows Verification Report

**Phase Goal:** All three cloud services deploy successfully from cloud repo
**Verified:** 2026-02-17T15:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Gateway deploy workflow installs deps with frozen lockfile without errors | VERIFIED | `pnpm install --frozen-lockfile` in both staging/production jobs; pnpm-lock.yaml exists (7167 lines, lockfileVersion 9.0) |
| 2  | Wrangler bundles cloud/gateway/gateway-entry.ts with all OSS imports resolved | VERIFIED | wrangler.cloud.toml `[alias]` maps stripe to ESM worker path; dry-run confirmed in SUMMARY (582 KiB bundle) |
| 3  | Staging gateway deploy targets staging-api.feelr.dev via wrangler.cloud.toml --env staging | VERIFIED | gateway.yml line 43: `command: deploy -c wrangler.cloud.toml --env staging`; wrangler.cloud.toml env.staging.routes pattern = "staging-api.feelr.dev" |
| 4  | Production gateway deploy targets api.feelr.dev via wrangler.cloud.toml --env production | VERIFIED | gateway.yml line 79: `command: deploy -c wrangler.cloud.toml --env production`; wrangler.cloud.toml env.production.routes pattern = "api.feelr.dev" |
| 5  | Turbo build for @feelr/dashboard produces output in oss/apps/dashboard/out/ | VERIFIED | turbo.json outputs: ["dist/**", "out/**"]; dashboard.yml uses `app_location: oss/apps/dashboard/out`; local build confirmed per SUMMARY |
| 6  | Turbo cache correctly invalidates when NEXT_PUBLIC env vars change | VERIFIED | turbo.json build.env: ["NEXT_PUBLIC_GATEWAY_URL", "NEXT_PUBLIC_CF_ANALYTICS_TOKEN", "NEXT_PUBLIC_SITE_URL"] |
| 7  | Dashboard deploy workflow builds and uploads static export to Azure SWA | VERIFIED | dashboard.yml uses Azure/static-web-apps-deploy@v1 with skip_app_build: true after turbo build step |
| 8  | Staging dashboard sets correct NEXT_PUBLIC_GATEWAY_URL and NEXT_PUBLIC_SITE_URL | VERIFIED | dashboard.yml lines 41-43: NEXT_PUBLIC_GATEWAY_URL=https://staging-api.feelr.dev, NEXT_PUBLIC_SITE_URL=https://staging-app.feelr.dev |
| 9  | Turbo build for @feelr/docs produces output in oss/apps/docs/out/ | VERIFIED | docs.yml uses `app_location: oss/apps/docs/out`; local build confirmed per SUMMARY (17 pages) |
| 10 | Docs deploy workflow builds and uploads static export to Azure SWA | VERIFIED | docs.yml uses Azure/static-web-apps-deploy@v1 with skip_app_build: true after turbo build step |

**Score:** 10/10 truths verified (in codebase)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/gateway.yml` | Cloud gateway deploy workflow (staging + production) | VERIFIED | 87 lines; both jobs present; references wrangler.cloud.toml; packageManager: pnpm |
| `cloud/gateway/package.json` | Cloud gateway package with pinned stripe dependency | VERIFIED | stripe pinned to "^20.3.1" (was "latest") |
| `cloud/gateway/wrangler.cloud.toml` | Wrangler config with main entry and alias | VERIFIED | `main = "gateway-entry.ts"`; [alias] section maps stripe to ESM worker path; staging + production envs |
| `.github/workflows/dashboard.yml` | Dashboard deploy workflow (staging + production) | VERIFIED | 103 lines; SWA_DASHBOARD_STAGING_TOKEN and SWA_DASHBOARD_DEPLOYMENT_TOKEN; correct env URLs |
| `turbo.json` | Root turbo config with out/** outputs and NEXT_PUBLIC env vars | VERIFIED | outputs: ["dist/**", "out/**"]; env: ["NEXT_PUBLIC_GATEWAY_URL", "NEXT_PUBLIC_CF_ANALYTICS_TOKEN", "NEXT_PUBLIC_SITE_URL"] |
| `.github/workflows/docs.yml` | Docs deploy workflow (staging + production) | VERIFIED | 100 lines; SWA_DOCS_STAGING_TOKEN and SWA_DOCS_DEPLOYMENT_TOKEN; staging-docs.feelr.dev and feelr.dev URLs |
| `oss/apps/dashboard/staticwebapp.config.json` | SWA config for dashboard | VERIFIED | File exists with 404 rewrite and security headers |
| `oss/apps/docs/staticwebapp.config.json` | SWA config for docs | VERIFIED | File exists with 404 rewrite and security headers |
| `pnpm-lock.yaml` | Root lockfile enabling frozen installs | VERIFIED | 7167 lines, lockfileVersion 9.0 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/gateway.yml` | `cloud/gateway/wrangler.cloud.toml` | wrangler-action command flag | WIRED | Lines 43, 79: `deploy -c wrangler.cloud.toml --env staging/production` |
| `cloud/gateway/wrangler.cloud.toml` | `cloud/gateway/gateway-entry.ts` | main entry point | WIRED | Line 14: `main = "gateway-entry.ts"` |
| `cloud/gateway/wrangler.cloud.toml` | `cloud/gateway/node_modules/stripe` | [alias] section | WIRED | `"stripe" = "./node_modules/stripe/esm/stripe.esm.worker.js"` |
| `.github/workflows/dashboard.yml` | `turbo.json` | pnpm turbo run build | WIRED | Line 39: `pnpm turbo run build --filter=@feelr/dashboard` |
| `.github/workflows/dashboard.yml` | `oss/apps/dashboard/out` | SWA upload app_location | WIRED | Lines 54, 101: `app_location: oss/apps/dashboard/out` |
| `.github/workflows/docs.yml` | `turbo.json` | pnpm turbo run build | WIRED | Line 40: `pnpm turbo run build --filter=@feelr/docs` |
| `.github/workflows/docs.yml` | `oss/apps/docs/out` | SWA upload app_location | WIRED | Lines 53, 98: `app_location: oss/apps/docs/out` |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| PIPE-03: Cloud repo gateway deploy workflow completes successfully | SATISFIED (in codebase) | Workflow correctly configured; actual CI run needs human verification |
| PIPE-04: Cloud repo dashboard deploy workflow completes successfully | SATISFIED (in codebase) | Workflow correctly configured; actual CI run needs human verification |
| PIPE-05: Cloud repo docs deploy workflow completes successfully | SATISFIED (in codebase) | Workflow correctly configured; actual CI run needs human verification |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments found in any workflow file. No stub implementations detected.

### Human Verification Required

#### 1. Gateway Staging Deploy

**Test:** Configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID as GitHub secrets on the cloud repo. Push a commit to main that touches `cloud/gateway/**`. Observe the Gateway workflow run.
**Expected:** The `deploy-staging` job completes successfully. Smoke test at `https://staging-api.feelr.dev/health` returns HTTP 200.
**Why human:** GitHub Actions CI runs on the cloud repo; cannot trigger or observe from this environment.

#### 2. Dashboard Staging Deploy

**Test:** Configure SWA_DASHBOARD_STAGING_TOKEN as a GitHub secret on the cloud repo. Push a commit to main that touches `oss/apps/dashboard/**`. Observe the Dashboard workflow run.
**Expected:** The `deploy-staging` job completes: turbo build produces `oss/apps/dashboard/out/`, SWA action uploads successfully. Smoke test at `https://staging-app.feelr.dev/health` returns HTTP 200.
**Why human:** GitHub Actions CI runs on the cloud repo; SWA token must be configured externally; cannot verify from this environment.

#### 3. Docs Staging Deploy

**Test:** Configure SWA_DOCS_STAGING_TOKEN as a GitHub secret on the cloud repo. Push a commit to main that touches `oss/apps/docs/**`. Observe the Docs workflow run.
**Expected:** The `deploy-staging` job completes: turbo build produces `oss/apps/docs/out/`, SWA action uploads successfully. Smoke test at `https://staging-docs.feelr.dev/health` returns HTTP 200.
**Why human:** GitHub Actions CI runs on the cloud repo; SWA token must be configured externally; cannot verify from this environment.

#### 4. Confirm Secrets Isolation (Success Criterion 4)

**Test:** In the cloud repo GitHub settings, verify the secrets list. Confirm no secrets from the public progradetech/feelr repo are depended upon by these workflows.
**Expected:** Cloud repo has CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SWA_DASHBOARD_STAGING_TOKEN, SWA_DASHBOARD_DEPLOYMENT_TOKEN, SWA_DOCS_STAGING_TOKEN, SWA_DOCS_DEPLOYMENT_TOKEN (and optionally CF_ANALYTICS_TOKEN_STAGING, CF_ANALYTICS_TOKEN_PRODUCTION). No workflow references secrets that only exist in the public repo.
**Why human:** Cannot access cloud repo's GitHub secrets settings from this environment.

### Gaps Summary

No gaps found. All workflow files are structurally correct and fully wired:

- Gateway: stripe dependency pinned, wrangler alias added, both staging/production deploy jobs reference wrangler.cloud.toml with correct --env flags, CLOUDFLARE_* secrets used.
- Dashboard: turbo.json has out/** outputs and NEXT_PUBLIC env var cache invalidation, both staging/production deploy jobs use correct SWA secrets and environment URLs.
- Docs: both staging/production deploy jobs use correct SWA secrets (SWA_DOCS_STAGING/DEPLOYMENT_TOKEN) and correct NEXT_PUBLIC_SITE_URL values.
- All secrets referenced are cloud-repo-only (no public repo secret dependencies identified).

The phase cannot be fully verified without running actual CI on the cloud repo. All codebase checks pass. The remaining verification is operational (live deploys), not structural.

---

_Verified: 2026-02-17T15:00:00Z_
_Verifier: Claude (gsd-verifier)_
