# Phase 15: Frontend CI/CD Pipelines - Research

**Researched:** 2026-02-10
**Domain:** GitHub Actions CI/CD for Azure Static Web Apps, path-based monorepo triggers, environment-aware Next.js builds, Azure SWA deployment action
**Confidence:** HIGH

## Summary

Phase 15 creates two new GitHub Actions workflows (dashboard.yml and docs.yml) that automate Azure Static Web Apps deployments for the dashboard and docs apps, and refactors the existing gateway workflows (deploy-staging.yml, deploy-production.yml) into a single gateway.yml to achieve the success criteria of three independent, path-scoped workflow files. The core technical challenge is environment-aware builds: the dashboard's `NEXT_PUBLIC_GATEWAY_URL` is inlined at build time by Next.js, so staging builds must inject the staging gateway URL (`https://feelr-gateway-staging.feelr.workers.dev`) while production builds inject the production URL (`https://api.feelr.dev`). This is purely a CI environment variable injection concern -- no code changes are needed since `apps/dashboard/src/config.ts` already reads from `process.env.NEXT_PUBLIC_GATEWAY_URL` with an `http://localhost:8787` fallback.

The Azure Static Web Apps deploy action (`Azure/static-web-apps-deploy@v1`) supports a `deployment_environment` input that deploys to named preview environments at predictable URLs like `<DEFAULT_HOST>-staging.<LOCATION>.azurestaticapps.net`. The Standard plan (already provisioned in Phase 14) allows up to 10 staging environments. Combined with `skip_app_build: true` (pre-built in CI via pnpm/turbo), this provides a clean staging-to-production promotion flow. The `action: "upload"` deploys content while the `action: "close"` parameter can clean up preview environments when pull requests close.

The monorepo path-based trigger design must account for dependency graphs: the dashboard depends on `@feelr/tsconfig` (shared package), so `packages/tsconfig/**` changes must trigger dashboard builds. The docs app has no workspace dependencies, so only `apps/docs/**` changes need to trigger docs builds. The gateway already has path triggers in the existing deploy-staging.yml covering `apps/gateway/**`, `packages/**`, and `connectors/**`.

**Primary recommendation:** Create `dashboard.yml` and `docs.yml` workflow files with path-based push triggers on main, environment-aware build steps (staging vs production `NEXT_PUBLIC_GATEWAY_URL`), and Azure SWA deployment via the official action with `skip_app_build: true`. Refactor existing gateway workflows into `gateway.yml`. Keep `ci.yml` unchanged for PR quality gates. Set GitHub Actions secrets for SWA deployment tokens as a prerequisite human checkpoint.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Azure/static-web-apps-deploy | @v1 | Deploy pre-built static exports to Azure SWA | Official Microsoft-maintained action; supports `skip_app_build`, `deployment_environment`, deployment tokens |
| GitHub Actions path triggers | N/A (native) | Scope workflow triggers to service-specific paths | Built-in `on.push.paths` filter; standard monorepo CI pattern |
| dorny/paths-filter | @v3 | Job-level path filtering within PR workflows | Already used in ci.yml; needed for conditional steps within shared workflows |
| Turborepo | latest (in project) | Filtered builds (`--filter=@feelr/dashboard`) | Already installed; `pnpm turbo run build --filter=<pkg>` builds only the target app and its dependencies |
| pnpm | 9.15.0 | Package manager | Already the project's package manager; `--frozen-lockfile` in CI |
| actions/checkout | @v4 | Git checkout | Every workflow |
| actions/setup-node | @v4 | Node.js setup with pnpm cache | Every workflow; `cache: 'pnpm'` |
| pnpm/action-setup | @v4 | pnpm installation | Every workflow; reads version from packageManager field |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| actions/cache | @v4 | Turborepo local cache persistence | Cache `.turbo` directory across CI runs |
| actions/github-script | @v7 | PR comment with staging preview URL | Dashboard/docs PR preview URL comments |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `deployment_environment` for staging | Deploy directly to production SWA slot | Named environments give stable staging URLs without touching production; environment cleanup is automatic |
| Separate workflow files per service | Single mega-workflow with path-filter conditions | Success criteria explicitly requires three separate files; separate files are also easier to maintain and understand |
| `on.push.paths` trigger-level filtering | dorny/paths-filter at job level | Trigger-level filtering is simpler and more efficient (workflow never starts); paths-filter is needed only for conditional steps within PR workflows |
| SWA CLI (`swa deploy`) in CI | Azure/static-web-apps-deploy action | Action handles auth natively, supports `deployment_environment`, and integrates with GitHub PR lifecycle; CLI requires manual token management |

## Architecture Patterns

### Recommended Workflow Structure

```
.github/
  workflows/
    ci.yml                    # EXISTING: PR checks (lint, typecheck, test via Turborepo)
    gateway.yml               # REFACTORED: gateway staging + production (from deploy-staging.yml + deploy-production.yml)
    dashboard.yml             # NEW: dashboard staging + production deploy to Azure SWA
    docs.yml                  # NEW: docs staging + production deploy to Azure SWA
    release.yml               # EXISTING: GoReleaser for CLI (unchanged)
```

### Pattern 1: Service-Specific Workflow with Path Triggers (dashboard.yml)

**What:** A workflow file triggered by push-to-main changes within the dashboard app's directory (and its shared dependencies). Builds with environment-specific `NEXT_PUBLIC_GATEWAY_URL` and deploys to Azure SWA.

**When to use:** For each frontend service (dashboard, docs).

**Example:**
```yaml
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration
# Source: https://github.com/Azure/static-web-apps-deploy (action.yml)
name: Dashboard

on:
  push:
    branches: [main]
    paths:
      - "apps/dashboard/**"
      - "packages/tsconfig/**"   # Dashboard extends @feelr/tsconfig
  workflow_dispatch:              # Manual trigger for ad-hoc deploys

concurrency:
  group: deploy-dashboard-staging
  cancel-in-progress: false

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Build dashboard (staging)
        run: pnpm turbo run build --filter=@feelr/dashboard
        env:
          NEXT_PUBLIC_GATEWAY_URL: https://feelr-gateway-staging.feelr.workers.dev

      - name: Copy SWA config to output
        run: cp apps/dashboard/staticwebapp.config.json apps/dashboard/out/

      - name: Deploy to SWA staging
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.SWA_DASHBOARD_DEPLOYMENT_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: apps/dashboard/out
          output_location: ""
          skip_app_build: true
          deployment_environment: staging
```

### Pattern 2: Environment-Aware Build with NEXT_PUBLIC_GATEWAY_URL

**What:** Inject the correct gateway URL at build time based on target environment. Next.js inlines `NEXT_PUBLIC_*` vars during `next build`, so the value is baked into the static HTML/JS output.

**When to use:** Every dashboard build.

**Key environment URLs:**

| Environment | `NEXT_PUBLIC_GATEWAY_URL` Value |
|-------------|-------------------------------|
| Staging | `https://feelr-gateway-staging.feelr.workers.dev` |
| Production | `https://api.feelr.dev` |
| Local dev | `http://localhost:8787` (default in config.ts) |

**Example:**
```yaml
# Staging build
- name: Build dashboard (staging)
  run: pnpm turbo run build --filter=@feelr/dashboard
  env:
    NEXT_PUBLIC_GATEWAY_URL: https://feelr-gateway-staging.feelr.workers.dev

# Production build
- name: Build dashboard (production)
  run: pnpm turbo run build --filter=@feelr/dashboard
  env:
    NEXT_PUBLIC_GATEWAY_URL: https://api.feelr.dev
```

**Critical detail:** The docs app does NOT use `NEXT_PUBLIC_GATEWAY_URL`. It is a pure content site. The docs workflow only needs `pnpm turbo run build --filter=@feelr/docs` with no environment variable injection.

### Pattern 3: SWA Named Environments for Staging

**What:** Use Azure SWA's `deployment_environment` parameter to deploy to a named "staging" environment with a stable, predictable URL.

**When to use:** Staging deployments (push to main).

**URL pattern:** `<DEFAULT_HOST>-staging.<LOCATION>.azurestaticapps.net`

For this project:
- Dashboard staging: `nice-island-0a28e4710.1-staging.azurestaticapps.net` (estimated -- actual pattern depends on Azure)
- Docs staging: `icy-coast-012670e10.4-staging.azurestaticapps.net` (estimated)

**Standard plan allows 10 staging environments** (vs 3 on Free plan). Phase 14 already provisioned Standard plan for both SWAs.

```yaml
# Staging deploy -- named environment
- uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.SWA_DASHBOARD_DEPLOYMENT_TOKEN }}
    repo_token: ${{ secrets.GITHUB_TOKEN }}
    action: upload
    app_location: apps/dashboard/out
    output_location: ""
    skip_app_build: true
    deployment_environment: staging

# Production deploy -- no deployment_environment (deploys to production slot)
- uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.SWA_DASHBOARD_DEPLOYMENT_TOKEN }}
    repo_token: ${{ secrets.GITHUB_TOKEN }}
    action: upload
    app_location: apps/dashboard/out
    output_location: ""
    skip_app_build: true
    # No deployment_environment = production
```

### Pattern 4: Gateway Workflow Consolidation

**What:** Merge existing `deploy-staging.yml` and `deploy-production.yml` into a single `gateway.yml` with two jobs (staging on push to main, production on tag push). This achieves the success criteria of "three separate workflow files" named `gateway.yml`, `dashboard.yml`, and `docs.yml`.

**When to use:** Phase 15 refactoring.

**Design decision:** The existing `ci.yml` already handles the PR gateway-preview deploy (with staging concurrency group sharing). The consolidated `gateway.yml` handles post-merge staging and tag-triggered production. The `ci.yml` remains unchanged as the PR quality gate.

```yaml
name: Gateway

on:
  push:
    branches: [main]
    paths:
      - "apps/gateway/**"
      - "packages/**"
      - "connectors/**"
    tags:
      - "v*"

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    # ... existing deploy-staging.yml content ...

  deploy-production:
    if: startsWith(github.ref, 'refs/tags/v')
    # ... existing deploy-production.yml content ...
```

**Important nuance:** GitHub Actions `paths` filters do NOT apply to tag push events -- only branch push events. If `on.push.paths` is set, tag pushes that don't match the paths will still trigger. But if `on.push.branches` is also set alongside `on.push.tags`, they work as separate trigger conditions. The `if:` condition on each job provides the precise gating.

### Pattern 5: Concurrency Controls

**What:** Each service gets its own concurrency group for staging deploys, preventing cross-service interference.

```yaml
# dashboard.yml staging
concurrency:
  group: deploy-dashboard-staging
  cancel-in-progress: false

# docs.yml staging
concurrency:
  group: deploy-docs-staging
  cancel-in-progress: false

# gateway.yml staging
concurrency:
  group: deploy-staging          # Existing group (shared with ci.yml gateway-preview)
  cancel-in-progress: false

# gateway.yml production
concurrency:
  group: deploy-production       # Existing group
  cancel-in-progress: false
```

### Anti-Patterns to Avoid

- **Omitting `packages/tsconfig/**` from dashboard path triggers:** The dashboard extends `@feelr/tsconfig/base.json`. A change to the shared tsconfig could affect the dashboard build. Docs does NOT have this dependency, so its triggers are narrower.
- **Setting `NEXT_PUBLIC_GATEWAY_URL` as a GitHub Actions secret instead of a plain env var:** It is a public URL (not a secret). Using `env:` in the workflow step is correct. Secrets would obscure the value from logs, making debugging harder.
- **Using `output_location` instead of `app_location` for pre-built files:** When `skip_app_build: true`, set `app_location` to the pre-built `out/` directory and `output_location` to `""`. The action does not run a build, so `app_location` IS the output.
- **Forgetting to copy `staticwebapp.config.json` into `out/` before deploy:** The SWA config must exist in the deployed directory. Phase 14 established the pattern of copying it into `out/` before deployment.
- **Using `cancel-in-progress: true` for deployment workflows:** A cancelled deployment can leave Azure SWA in an inconsistent state. Queue deploys with `cancel-in-progress: false`.
- **Triggering production SWA deploys on tag push alone:** Unlike the gateway (which has its own versioning via Cloudflare), SWA frontend production deploys should be tied to a deliberate promotion step. Tag-triggered production deploy or manual `workflow_dispatch` are both valid approaches.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SWA deployment | Custom `swa deploy` script in CI | `Azure/static-web-apps-deploy@v1` action | Handles auth, deployment tokens, named environments, PR lifecycle natively |
| Path-based workflow triggers | Custom `git diff` script | `on.push.paths` native GitHub Actions filter | Built-in, no maintenance, efficient (workflow never starts) |
| Environment-aware URL injection | Runtime URL replacement, service worker URL rewrite | `NEXT_PUBLIC_GATEWAY_URL` env var at build time | Next.js inlines `NEXT_PUBLIC_*` vars at build -- this is the designed pattern |
| SWA config copying | Custom post-build script | Single `cp` command in workflow | `staticwebapp.config.json` must be in `out/` directory; one-liner is sufficient |
| Turborepo filtered builds | Custom `cd apps/dashboard && npm run build` | `pnpm turbo run build --filter=@feelr/dashboard` | Turborepo handles dependency graph (builds `@feelr/tsconfig` first if needed), caching, and output tracking |

**Key insight:** The entire phase is GitHub Actions YAML configuration. No application code changes are needed. The only moving parts are workflow files, environment variable injection, and the Azure SWA deploy action.

## Common Pitfalls

### Pitfall 1: NEXT_PUBLIC_GATEWAY_URL Not Set During Build

**What goes wrong:** Dashboard deploys successfully but all API calls go to `http://localhost:8787` instead of the gateway. The app appears broken.
**Why it happens:** `NEXT_PUBLIC_GATEWAY_URL` is a build-time variable. Next.js replaces `process.env.NEXT_PUBLIC_GATEWAY_URL` with its literal value during `next build`. If the env var is not set, the fallback `http://localhost:8787` from `config.ts` is baked into the output.
**How to avoid:** Always set `NEXT_PUBLIC_GATEWAY_URL` in the `env:` section of the build step (not the deploy step). Use `https://feelr-gateway-staging.feelr.workers.dev` for staging and `https://api.feelr.dev` for production.
**Warning signs:** Browser DevTools Network tab shows requests to `localhost:8787` from the deployed dashboard.

### Pitfall 2: staticwebapp.config.json Not in out/ Directory

**What goes wrong:** Deployed site has no security headers, 404 handling falls back to Azure defaults, and static asset caching is missing.
**Why it happens:** `next build` with `output: 'export'` generates the `out/` directory but does not copy `staticwebapp.config.json` from the app root into `out/`. The SWA action deploys whatever is in `app_location`.
**How to avoid:** Add a `cp apps/<app>/staticwebapp.config.json apps/<app>/out/` step between the build and deploy steps. Phase 14 established this pattern.
**Warning signs:** Response headers missing `X-Frame-Options`, `X-Content-Type-Options`; 404 pages not rendering custom page.

### Pitfall 3: Path Triggers Missing Shared Dependencies

**What goes wrong:** A change to `packages/tsconfig/base.json` does not trigger a dashboard rebuild. The dashboard may fail at build time or behave differently in production.
**Why it happens:** Dashboard extends `@feelr/tsconfig/base.json` via its tsconfig.json, but the workflow's `paths` filter only includes `apps/dashboard/**`.
**How to avoid:** Include `packages/tsconfig/**` in the dashboard workflow's path triggers. The docs app does NOT have this dependency (its tsconfig.json does not extend any workspace package), so it does not need this path.
**Warning signs:** Dashboard build starts failing after a tsconfig change, but no dashboard workflow was triggered.

### Pitfall 4: GitHub Actions Secrets Not Set

**What goes wrong:** Workflow fails at the deploy step with an authentication error.
**Why it happens:** Phase 14 deferred setting GitHub Actions secrets because gh CLI was not authenticated. The secrets `SWA_DASHBOARD_DEPLOYMENT_TOKEN` and `SWA_DOCS_DEPLOYMENT_TOKEN` must be set before Phase 15 workflows can run.
**How to avoid:** Include a human checkpoint at the start of Phase 15 to set secrets via `gh secret set` or the GitHub web UI. Token retrieval: `az staticwebapp secrets list --name <app> --resource-group feelr-rg --query "properties.apiKey" -o tsv`.
**Warning signs:** Workflow error: "The deployment token is invalid or has expired."

### Pitfall 5: Production Deploy Triggered by Every Tag

**What goes wrong:** Tagging any commit (not just main) triggers a production deployment of potentially untested code.
**Why it happens:** `on.push.tags: ["v*"]` triggers on all tags matching `v*` regardless of branch. There is no branch restriction on tag pushes.
**How to avoid:** Use GitHub environment protection rules (require reviewers for the "production" environment) as a safety gate. Also, for SWA frontend production deploys, consider using `workflow_dispatch` with an environment selector instead of automatic tag triggers. This allows deliberate promotion from staging to production.
**Warning signs:** Production site updates unexpectedly; deploy happens without a staging deployment first.

### Pitfall 6: Turborepo Cache Invalidation with Different Env Vars

**What goes wrong:** Staging build reuses production build cache (or vice versa), deploying a staging build with the production gateway URL.
**Why it happens:** Turborepo hashes inputs including environment variables configured in `turbo.json`'s `globalEnv` or `env` fields. If `NEXT_PUBLIC_GATEWAY_URL` is not declared in turbo.json's environment configuration, Turborepo may consider two builds with different env vars as cache hits.
**How to avoid:** Add `NEXT_PUBLIC_GATEWAY_URL` to the build task's `env` list in `turbo.json`, or ensure separate CI runs have clean `.turbo` caches (which they do by default in GitHub Actions without remote cache). Since the project uses local Turborepo cache only (actions/cache keyed by SHA), each workflow run gets a fresh context. But declaring the env var in turbo.json is still best practice for correctness.
**Warning signs:** Deploy logs show "FULL TURBO" (cache hit) when the gateway URL should have changed between environments.

### Pitfall 7: Workflow File Naming vs Success Criteria

**What goes wrong:** Success criterion 4 requires "gateway.yml, dashboard.yml, docs.yml" but the current repo has `deploy-staging.yml` and `deploy-production.yml` for the gateway.
**Why it happens:** Phase 13 created two separate workflow files. Phase 15 success criteria expect a single `gateway.yml`.
**How to avoid:** Refactor: delete `deploy-staging.yml` and `deploy-production.yml`, create `gateway.yml` that handles both staging (push to main with path filter) and production (tag push) as separate jobs. Also update ci.yml's gateway-preview concurrency group if it references the old deploy-staging group.
**Warning signs:** Success criterion 4 fails verification because three files named gateway.yml, dashboard.yml, docs.yml do not exist.

## Code Examples

Verified patterns from official sources:

### Complete dashboard.yml Workflow

```yaml
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration
# Source: https://github.com/Azure/static-web-apps-deploy (action.yml verified inputs)
name: Dashboard

on:
  push:
    branches: [main]
    paths:
      - "apps/dashboard/**"
      - "packages/tsconfig/**"
  workflow_dispatch:

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    concurrency:
      group: deploy-dashboard-staging
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Build dashboard (staging)
        run: pnpm turbo run build --filter=@feelr/dashboard
        env:
          NEXT_PUBLIC_GATEWAY_URL: https://feelr-gateway-staging.feelr.workers.dev

      - name: Copy SWA config to output
        run: cp apps/dashboard/staticwebapp.config.json apps/dashboard/out/

      - name: Deploy to staging
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.SWA_DASHBOARD_DEPLOYMENT_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: apps/dashboard/out
          output_location: ""
          skip_app_build: true
          deployment_environment: staging
```

### Complete docs.yml Workflow

```yaml
name: Docs

on:
  push:
    branches: [main]
    paths:
      - "apps/docs/**"
  workflow_dispatch:

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    concurrency:
      group: deploy-docs-staging
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Build docs
        run: pnpm turbo run build --filter=@feelr/docs

      - name: Copy SWA config to output
        run: cp apps/docs/staticwebapp.config.json apps/docs/out/

      - name: Deploy to staging
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.SWA_DOCS_DEPLOYMENT_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: apps/docs/out
          output_location: ""
          skip_app_build: true
          deployment_environment: staging
```

### turbo.json Environment Variable Declaration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "out/**"],
      "env": ["NEXT_PUBLIC_GATEWAY_URL"]
    }
  }
}
```

Source: [Turborepo environment variables](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables)

### GitHub Actions Secret Setup Commands

```bash
# Retrieve deployment tokens from Azure
DASHBOARD_TOKEN=$(az staticwebapp secrets list \
  --name feelr-dashboard \
  --resource-group feelr-rg \
  --query "properties.apiKey" -o tsv)

DOCS_TOKEN=$(az staticwebapp secrets list \
  --name feelr-docs \
  --resource-group feelr-rg \
  --query "properties.apiKey" -o tsv)

# Set as GitHub Actions secrets
gh secret set SWA_DASHBOARD_DEPLOYMENT_TOKEN --body "$DASHBOARD_TOKEN"
gh secret set SWA_DOCS_DEPLOYMENT_TOKEN --body "$DOCS_TOKEN"
```

### Production Deploy Pattern (workflow_dispatch or tag-triggered)

```yaml
# Production deploy for dashboard (tag-triggered)
deploy-production:
  if: startsWith(github.ref, 'refs/tags/v')
  runs-on: ubuntu-latest
  timeout-minutes: 15
  environment: production
  concurrency:
    group: deploy-dashboard-production
    cancel-in-progress: false
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4

    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: "pnpm"

    - run: pnpm install --frozen-lockfile

    - name: Build dashboard (production)
      run: pnpm turbo run build --filter=@feelr/dashboard
      env:
        NEXT_PUBLIC_GATEWAY_URL: https://api.feelr.dev

    - name: Copy SWA config to output
      run: cp apps/dashboard/staticwebapp.config.json apps/dashboard/out/

    - name: Deploy to production
      uses: Azure/static-web-apps-deploy@v1
      with:
        azure_static_web_apps_api_token: ${{ secrets.SWA_DASHBOARD_DEPLOYMENT_TOKEN }}
        repo_token: ${{ secrets.GITHUB_TOKEN }}
        action: upload
        app_location: apps/dashboard/out
        output_location: ""
        skip_app_build: true
        # No deployment_environment = production slot
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Azure auto-generated GitHub workflows | Custom pre-build + `skip_app_build: true` | 2023+ | Full control over build pipeline; required for monorepo/pnpm |
| SWA `routes.json` | `staticwebapp.config.json` | 2022 | Old format deprecated; must use new config format |
| Pull request preview environments (auto) | Named environments via `deployment_environment` | 2023+ | Named environments give stable, predictable URLs |
| Single workflow for all services | Per-service workflow files with path triggers | Best practice 2024+ | Independent deploys, clearer ownership, faster CI |
| `output_location` for build output | `app_location` pointing to pre-built dir with empty `output_location` | SWA deploy action v1 | When `skip_app_build: true`, `app_location` IS the output |

**Deprecated/outdated:**
- `routes.json`: Replaced by `staticwebapp.config.json`
- Azure SWA Dedicated plan: Retired October 2025; use Standard
- SWA auto-generated workflow: Not recommended for monorepos or custom build pipelines

## Open Questions

1. **Should production frontend deploys be tag-triggered or manual (workflow_dispatch)?**
   - What we know: The gateway uses tag-triggered production deploys with a gradual rollout. The existing `release.yml` and `deploy-production.yml` both trigger on `v*` tags. SWA frontend deploys are atomic (no gradual rollout concept).
   - What's unclear: Whether the same `v*` tag should trigger all three service production deploys, or if frontend production deploys should be manual.
   - Recommendation: Use the same `v*` tag trigger for consistency. Tag push triggers production deploys for all services. If a tag push only changes gateway code, the frontend workflows can either (a) skip the build via `dorny/paths-filter` check or (b) rebuild and redeploy the same content (idempotent). Option (a) is more efficient. Add `workflow_dispatch` as an alternative for ad-hoc frontend-only production deploys.

2. **Should `ci.yml` be updated to include dashboard/docs PR preview deploys?**
   - What we know: `ci.yml` already has a `gateway-preview` job that deploys gateway to staging on PR. The same pattern could be extended for dashboard/docs PR preview deploys to SWA named environments.
   - What's unclear: Whether PR preview deploys for SWA are needed in the current phase.
   - Recommendation: Defer SWA PR preview deploys (listed as OPS-03 in future requirements). Phase 15 success criteria only require post-merge staging deploys. PR previews for frontend are a separate concern.

3. **What is the exact staging URL pattern for SWA named environments?**
   - What we know: Documentation says URL format is `<DEFAULT_HOST>-<ENV_NAME>.<LOCATION>.azurestaticapps.net`. Dashboard default host is `nice-island-0a28e4710.1.azurestaticapps.net`.
   - What's unclear: Whether the location segment changes or stays the same, and exact URL format. Azure documentation is ambiguous on the separator format.
   - Recommendation: Deploy to a `staging` named environment and capture the actual URL from the action's output. The URL will be predictable after the first deploy. Not a blocker for implementation.

4. **Should gateway.yml be a true consolidation or should the existing ci.yml gateway-preview remain separate?**
   - What we know: Success criterion 4 says "three separate workflow files (gateway.yml, dashboard.yml, docs.yml)." Currently, the gateway CI/CD spans `ci.yml` (PR preview), `deploy-staging.yml`, and `deploy-production.yml`.
   - What's unclear: Whether `ci.yml`'s gateway-preview job should move into `gateway.yml` or stay in `ci.yml`.
   - Recommendation: Keep `ci.yml` as the unified PR quality gate (lint/typecheck/test + gateway preview). Move only `deploy-staging.yml` and `deploy-production.yml` content into `gateway.yml`. The success criteria concern staging/production deploy workflows, not PR checks. The `ci.yml` gateway-preview job shares the `deploy-staging` concurrency group, which still works whether the partner workflow is named `deploy-staging.yml` or `gateway.yml`.

## Sources

### Primary (HIGH confidence)
- [Azure/static-web-apps-deploy action.yml](https://github.com/Azure/static-web-apps-deploy/blob/v1/action.yml) - All 25+ input parameters verified: `deployment_environment`, `skip_app_build`, `app_location`, `output_location`, `action`
- [Azure SWA Build Configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration) - `skip_app_build: true` pattern, `app_location` for pre-built files, empty `output_location`
- [Azure SWA Named Environments](https://learn.microsoft.com/en-us/azure/static-web-apps/named-environments) - `deployment_environment` parameter, URL pattern, environment naming
- [Azure SWA Plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans) - Standard plan: 10 staging environments, 5 custom domains
- [GitHub Actions path triggers](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#onpushpull_requestpull_request_targetpathspaths-ignore) - `on.push.paths` syntax, interaction with `branches` and `tags`
- [dorny/paths-filter](https://github.com/dorny/paths-filter) - Push event support, `base` parameter for change detection

### Verified via Project Files (HIGH confidence)
- `apps/dashboard/src/config.ts` - `NEXT_PUBLIC_GATEWAY_URL` with `http://localhost:8787` fallback
- `apps/dashboard/next.config.ts` - `output: 'export'` produces `out/` directory
- `apps/docs/next.config.mjs` - `output: 'export'` produces `out/` directory
- `apps/dashboard/package.json` - Depends on `@feelr/tsconfig` (workspace:*)
- `apps/docs/package.json` - No workspace dependencies beyond nextra/next/react
- `apps/dashboard/tsconfig.json` - Extends `@feelr/tsconfig/base.json`
- `apps/docs/tsconfig.json` - Self-contained, no workspace extends
- `apps/dashboard/staticwebapp.config.json` - SWA routing config (security headers, 404, caching)
- `apps/docs/staticwebapp.config.json` - SWA routing config (same structure)
- `turbo.json` - Build outputs: `dist/**`, `out/**` (fixed in Phase 14)
- `.github/workflows/ci.yml` - PR checks + gateway-preview with `deploy-staging` concurrency group
- `.github/workflows/deploy-staging.yml` - Gateway staging deploy (path-triggered on main)
- `.github/workflows/deploy-production.yml` - Gateway production deploy (tag-triggered)
- `.planning/phases/14-azure-static-web-apps-provisioning/14-01-SUMMARY.md` - Dashboard SWA: `nice-island-0a28e4710.1.azurestaticapps.net`, Docs SWA: `icy-coast-012670e10.4.azurestaticapps.net`
- `apps/gateway/wrangler.toml` - Staging URL: `feelr-gateway-staging.<subdomain>.workers.dev`

### Secondary (MEDIUM confidence)
- [Azure SWA Preview Environments overview](https://learn.microsoft.com/en-us/azure/static-web-apps/preview-environments) - PR preview lifecycle, pull request environments
- [Monorepo path filtering blog](https://oneuptime.com/blog/post/2025-12-20-monorepo-path-filters-github-actions/view) - Community patterns for monorepo CI with path filters
- [Turborepo environment variables](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables) - `env` field in task config for cache key inclusion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Azure SWA deploy action inputs verified directly from action.yml; all GitHub Actions tooling already proven in Phase 13
- Architecture: HIGH - Pattern follows directly from Phase 13 gateway workflows and Phase 14 SWA deployment; all components already exist and are tested
- Pitfalls: HIGH - Build-time env var injection is well-documented Next.js behavior; staticwebapp.config.json copying established in Phase 14; path dependency graph verified from package.json and tsconfig.json files
- Environment URLs: MEDIUM - SWA staging URL pattern is documented but exact format for named environments not verified with a live deployment

**Research date:** 2026-02-10
**Valid until:** 2026-03-12 (30 days -- GitHub Actions, Azure SWA deploy action, and Next.js static export are stable)
