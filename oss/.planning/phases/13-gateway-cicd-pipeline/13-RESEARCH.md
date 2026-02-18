# Phase 13: Gateway CI/CD Pipeline - Research

**Researched:** 2026-02-09
**Domain:** GitHub Actions CI/CD, Cloudflare Workers deployment automation, Turborepo monorepo CI, gradual rollouts, preview URLs
**Confidence:** HIGH

## Summary

Phase 13 automates the gateway deployment pipeline using GitHub Actions workflows triggered by PR events, merges to main, and version tag pushes. The monorepo already uses pnpm + Turborepo with `test`, `typecheck`, and `build` tasks configured in `turbo.json`. The gateway (Cloudflare Workers + Hono) has a fully configured multi-environment `wrangler.toml` from Phase 12 with staging (`feelr-gateway-staging.feelr.workers.dev`) and production (`api.feelr.dev`) environments.

The critical finding is that **preview URLs are NOT generated for Workers that implement Durable Objects** -- and the gateway exports `TokenCoordinator`, a Durable Object. This means the GW-06 requirement ("Gateway PRs generate unique preview URLs for testing before merge") cannot use Cloudflare's native preview URL feature. The alternative approach is to deploy PR changes to the staging environment using `wrangler deploy --env staging` on PR events, giving reviewers a stable staging URL to test against. This is a material constraint that shapes the entire PR workflow design.

For gradual rollouts (GW-05), `wrangler versions upload` + `wrangler versions deploy` provide programmatic, non-interactive percentage-based traffic splitting. The `wrangler versions deploy` command accepts positional `<version-id>@<percentage>` arguments, a `--yes` flag for CI, and `--version-id`/`--percentage` flags. However, **versions containing new Durable Object migrations cannot be uploaded** via `wrangler versions upload` -- they must use `wrangler deploy`. Since DO migrations are rare (only when adding new DO classes), this constraint is manageable: normal code changes use the gradual rollout path; migration changes use the direct deploy path.

**Primary recommendation:** Create three GitHub Actions workflows: (1) `ci.yml` for PR checks (lint, typecheck, test via Turborepo + staging deploy for preview), (2) `deploy-staging.yml` for main-branch staging deployment with smoke tests, (3) `deploy-production.yml` for tag-triggered production deployment with environment approval gate and gradual rollout support. Add a `lint` turbo task (currently missing) using either Biome or the existing `tsc --noEmit` typecheck since no linter is currently configured.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Actions | N/A (hosted) | CI/CD platform | Already used for release.yml (GoReleaser); native to GitHub repo |
| cloudflare/wrangler-action | v3 | Wrangler CLI execution in CI | Official Cloudflare-maintained action; handles auth, secrets, deployment-url output |
| Turborepo | 2.8.3 | Monorepo task orchestration | Already installed; has `build`, `test`, `typecheck`, `deploy` tasks in turbo.json |
| pnpm | 9.15.0 | Package manager | Already the project's package manager; lockfile-based caching in CI |
| Wrangler | 4.63.0 | Cloudflare Workers CLI | Already installed; supports `versions upload`, `versions deploy`, `--env` flag |
| dorny/paths-filter | v3 | Path-based job filtering | Standard monorepo CI pattern; allows skipping gateway deploy when only docs changed |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| actions/checkout | v4 | Git checkout | Every workflow; use `fetch-depth: 0` for Turborepo `--affected` |
| actions/setup-node | v4 | Node.js setup | Every workflow; use `cache: 'pnpm'` for dependency caching |
| pnpm/action-setup | v4 | pnpm installation | Every workflow; version from packageManager field |
| actions/cache | v4 | Turborepo local cache | Cache `.turbo` directory for faster builds without remote cache |
| jtalk/url-health-check-action | v4 | Post-deploy smoke test | After staging and production deployments; curl-based with retry |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dorny/paths-filter for path filtering | Turborepo `--affected` only | paths-filter is more explicit for job-level skipping; `--affected` only works within turbo tasks, not for skipping entire deploy jobs |
| jtalk/url-health-check-action | Raw curl + retry loop | Action provides cleaner YAML, built-in retries, and proper exit codes; curl loop is more flexible but more verbose |
| Local Turborepo cache (actions/cache) | Vercel Remote Cache | Remote cache is faster for large repos but requires Vercel account + token setup; local cache is zero-config and sufficient for current repo size |
| Separate lint tool (Biome/ESLint) | Extend `typecheck` task only | Proper linting catches more issues (unused vars, style) but adds a dependency; typecheck alone is sufficient for type safety |

## Architecture Patterns

### Recommended Workflow Structure

```
.github/
  workflows/
    ci.yml                    # PR checks: lint, typecheck, test, staging preview deploy
    deploy-staging.yml        # main branch: staging deploy + smoke test
    deploy-production.yml     # version tag: production deploy with approval gate
    release.yml               # existing: GoReleaser for CLI (unchanged)
```

### Pattern 1: PR Check Workflow (ci.yml)

**What:** Runs on every PR that touches gateway/connector/package code. Executes lint, typecheck, and tests via Turborepo. Optionally deploys to staging for a preview URL.

**When to use:** Every pull request.

**Example:**
```yaml
# Source: https://turborepo.dev/docs/guides/ci-vendors/github-actions
# Source: https://github.com/cloudflare/wrangler-action
name: CI

on:
  pull_request:
    types: [opened, synchronize]

concurrency:
  group: ci-${{ github.head_ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Needed for turbo --affected

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Cache Turborepo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-

      - name: Lint + Typecheck + Test
        run: pnpm turbo run lint typecheck test --affected

  gateway-preview:
    needs: check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Check gateway changes
        uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            gateway:
              - 'apps/gateway/**'
              - 'packages/**'
              - 'connectors/**'

      - name: Deploy to staging (preview)
        if: steps.filter.outputs.gateway == 'true'
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/gateway
          command: deploy --env staging
          packageManager: pnpm

      - name: Comment PR with staging URL
        if: steps.filter.outputs.gateway == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: 'Deployed to staging for preview: https://feelr-gateway-staging.feelr.workers.dev'
            })
```

### Pattern 2: Staging Deploy Workflow (deploy-staging.yml)

**What:** Triggers on push to main. Deploys gateway to staging and runs smoke test.

**When to use:** Every merge to main.

**Example:**
```yaml
# Source: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
name: Deploy Staging

on:
  push:
    branches: [main]
    paths:
      - 'apps/gateway/**'
      - 'packages/**'
      - 'connectors/**'

concurrency:
  group: deploy-staging
  cancel-in-progress: false  # Queue, don't cancel deployments

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Deploy to staging
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/gateway
          command: deploy --env staging
          packageManager: pnpm

      - name: Smoke test staging
        uses: jtalk/url-health-check-action@v4
        with:
          url: https://feelr-gateway-staging.feelr.workers.dev/health
          max-attempts: 3
          retry-delay: 5s
```

### Pattern 3: Production Deploy with Gradual Rollout (deploy-production.yml)

**What:** Triggers on version tag push. Requires GitHub environment approval. Uploads version, then deploys at 10%, waits for manual promotion to 100%.

**When to use:** Production releases.

**Example:**
```yaml
# Source: wrangler versions upload --help, wrangler versions deploy --help
name: Deploy Production

on:
  push:
    tags:
      - "v*"

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production  # Triggers GitHub approval gate
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      # Upload version without deploying
      - name: Upload new version
        id: upload
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/gateway
          command: versions upload --env production --tag ${{ github.ref_name }} --message "Release ${{ github.ref_name }}"
          packageManager: pnpm

      # Get the version ID from the upload
      - name: Get version ID
        id: version
        run: |
          VERSION_ID=$(npx wrangler versions list --env production --json --name feelr-gateway-production | jq -r '.[0].id')
          echo "version_id=$VERSION_ID" >> "$GITHUB_OUTPUT"
        working-directory: apps/gateway
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      # Deploy at 10%
      - name: Gradual deploy (10%)
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/gateway
          command: versions deploy ${{ steps.version.outputs.version_id }}@10% --env production --yes --message "Canary ${{ github.ref_name }} at 10%"
          packageManager: pnpm

      - name: Smoke test production
        uses: jtalk/url-health-check-action@v4
        with:
          url: https://api.feelr.dev/health
          max-attempts: 5
          retry-delay: 10s

      # Full deploy (100%)
      - name: Full deploy (100%)
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/gateway
          command: versions deploy ${{ steps.version.outputs.version_id }}@100% --env production --yes --message "Release ${{ github.ref_name }} at 100%"
          packageManager: pnpm
```

### Pattern 4: Concurrency Controls

**What:** Prevent deployment races using GitHub Actions `concurrency` groups.

**When to use:** All deployment workflows.

**Key insight:** Use `cancel-in-progress: true` for PR checks (newer push supersedes) but `cancel-in-progress: false` for deployments (queue, don't cancel -- a canceled deploy mid-flight is worse than waiting).

```yaml
# PR checks: cancel older runs on same branch
concurrency:
  group: ci-${{ github.head_ref }}
  cancel-in-progress: true

# Staging deploy: queue, don't cancel
concurrency:
  group: deploy-staging
  cancel-in-progress: false

# Production deploy: queue, don't cancel
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

Source: [GitHub Actions Concurrency](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs)

### Anti-Patterns to Avoid

- **Using `wrangler deploy` for production instead of `versions upload` + `versions deploy`:** `wrangler deploy` immediately sends 100% of traffic to the new version. For production, use the versioned workflow to enable gradual rollouts and easy rollback.
- **Setting `cancel-in-progress: true` on deployment workflows:** Canceling a deployment mid-flight can leave the environment in an inconsistent state. Use `false` to queue subsequent deployments.
- **Using `actions/checkout` with default `fetch-depth: 1` when using Turborepo `--affected`:** Turborepo needs git history to determine which packages changed. Use `fetch-depth: 0` for full history or `fetch-depth: 2` minimum.
- **Relying on native preview URLs when the Worker has Durable Objects:** Preview URLs are not generated for DO Workers. Deploy to staging instead.
- **Skipping `pnpm install --frozen-lockfile` in CI:** Without `--frozen-lockfile`, pnpm may update the lockfile, causing non-reproducible builds. Always use `--frozen-lockfile` in CI.
- **Putting CLOUDFLARE_API_TOKEN in workflow files:** Always use GitHub Secrets. The token provides full Workers deployment access.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path-based job filtering | Custom `git diff` script parsing changed files | `dorny/paths-filter@v3` or built-in `paths:` trigger filter | Edge cases with merge commits, renames, deletions; paths-filter handles all git diff modes |
| Post-deploy health checks with retry | Custom bash loop with curl + sleep | `jtalk/url-health-check-action@v4` | Built-in retry, timeout, proper exit codes, redirect handling |
| CI dependency caching | Manual tar/untar of node_modules | `actions/setup-node` with `cache: 'pnpm'` + `actions/cache` for .turbo | Handles cache key generation, invalidation, and restoration automatically |
| Deployment concurrency control | File-based locks or external coordination | GitHub Actions `concurrency` groups | Native platform feature; handles queueing, cancellation, and cleanup |
| Version ID extraction after upload | Parsing wrangler stdout with regex | `wrangler versions list --json` piped to `jq` | JSON output is stable; stdout format may change between wrangler versions |

**Key insight:** The GitHub Actions ecosystem and Cloudflare's official tooling handle all CI/CD complexity. The only custom code needed is the workflow YAML files themselves.

## Common Pitfalls

### Pitfall 1: Preview URLs Not Generated for DO Workers

**What goes wrong:** You set up `wrangler versions upload` in the PR workflow expecting a preview URL, but no URL is generated because the gateway exports a Durable Object.
**Why it happens:** Cloudflare explicitly does not generate preview URLs for Workers that implement Durable Objects. Preview environments would share production DO state, creating data integrity risks.
**How to avoid:** Deploy to the staging environment (`wrangler deploy --env staging`) instead of using `versions upload` for PR previews. The staging environment has its own isolated DO instances, KV namespaces, and D1 databases.
**Warning signs:** No preview URL in wrangler output; `deployment-url` output from wrangler-action is empty.

### Pitfall 2: DO Migration Versions Cannot Use versions upload

**What goes wrong:** You add a new Durable Object class and the `wrangler versions upload` command fails with an error about unsupported migrations.
**Why it happens:** Durable Object migrations are atomic operations that cannot be split across gradual deployments. They must be deployed all-at-once via `wrangler deploy`.
**How to avoid:** Use `wrangler deploy --env production` directly when the release includes DO migrations. The gradual rollout path (`versions upload` + `versions deploy`) is only for code changes without DO migrations.
**Warning signs:** Wrangler error mentioning "migrations" during `versions upload`; new `[[migrations]]` entries in wrangler.toml.

### Pitfall 3: Turborepo --affected Requires Git History

**What goes wrong:** `pnpm turbo run test --affected` runs all tasks in all packages instead of only changed packages.
**Why it happens:** `actions/checkout@v4` defaults to `fetch-depth: 1` (shallow clone). Turborepo cannot compare commits without history.
**How to avoid:** Set `fetch-depth: 0` on the checkout step. Turborepo auto-detects `GITHUB_BASE_REF` in PR contexts to determine the comparison point.
**Warning signs:** All packages shown as "affected" in turbo output; unexpected long CI times.

### Pitfall 4: Staging Deploy Race with PR Preview Deploy

**What goes wrong:** A PR preview deploy to staging and a main-branch staging deploy run simultaneously, overwriting each other.
**Why it happens:** PR preview deploys and main-branch deploys both target `--env staging` but are in different workflow files with different concurrency groups.
**How to avoid:** Use the SAME concurrency group (`deploy-staging`) for both the PR preview deploy job and the main-branch staging deploy workflow. This serializes all staging deployments.
**Warning signs:** PR reviewer sees unexpected behavior on staging URL; deploy logs show interleaved deployments.

### Pitfall 5: GitHub Environment Approval Gate on Free/Team Plans

**What goes wrong:** You configure the `production` environment with required reviewers, but the approval prompt never appears.
**Why it happens:** GitHub environment protection rules with required reviewers are only available for public repositories on Free/Pro/Team plans. Private repositories require GitHub Enterprise or GitHub Teams with the Environments feature.
**How to avoid:** Verify repository visibility and GitHub plan. If the repo is private on a Free plan, required reviewers will not work. The repo must be public or upgraded to a plan that supports this feature.
**Warning signs:** Production deploy job starts immediately without pausing for approval.

### Pitfall 6: Missing lint Task in turbo.json

**What goes wrong:** `pnpm turbo run lint` fails because `lint` is not defined in `turbo.json` and most packages lack a `lint` script.
**Why it happens:** The current turbo.json has `build`, `test`, `typecheck`, and `deploy` tasks but no `lint` task. Only the dashboard has a `lint` script (`next lint`).
**How to avoid:** Either (a) add a `lint` task to `turbo.json` and add `lint` scripts to each package, or (b) skip the dedicated lint step and rely on `typecheck` alone. Recommendation: add the `lint` task to turbo.json now so CI-01 is fully satisfied, even if most packages initially just run `tsc --noEmit` as their lint step.
**Warning signs:** `turbo run lint` exits with "No tasks were found for the `lint` task" error.

### Pitfall 7: wrangler-action Installs Its Own Wrangler

**What goes wrong:** The wrangler version used in CI differs from the one in the project's lockfile, causing subtle behavior differences.
**Why it happens:** `cloudflare/wrangler-action@v3` installs its own wrangler version by default. If you don't pin `wranglerVersion`, it uses the latest.
**How to avoid:** Either set `wranglerVersion` in the action config to match the project, or set `packageManager: pnpm` which tells the action to use the project's locally installed wrangler.
**Warning signs:** CI logs show a different wrangler version than `npx wrangler --version` locally; features work locally but fail in CI.

## Code Examples

### Cloudflare API Token Creation for CI

```
Required permissions for the CI token:
- Account > Cloudflare Workers > Edit
- Account > D1 > Edit (for future D1 migrations in CI)
- Zone > DNS > Edit (only if custom domain changes are needed)

Scope: Single account, single zone (feelr.dev)
```

Source: [Cloudflare API Token Setup](https://developers.cloudflare.com/workers/wrangler/ci-cd/#api-token)

### Gradual Rollout CLI Commands (verified via --help)

```bash
# Upload a version without deploying
npx wrangler versions upload --env production \
  --tag "v1.2.0" \
  --message "Release v1.2.0"

# List versions to get ID (JSON output for scripting)
npx wrangler versions list --env production --json

# Deploy at 10% (non-interactive with --yes)
npx wrangler versions deploy <version-id>@10% \
  --env production \
  --yes \
  --message "Canary at 10%"

# Promote to 100%
npx wrangler versions deploy <version-id>@100% \
  --env production \
  --yes \
  --message "Full rollout"

# Alternative: use named flags instead of positional
npx wrangler versions deploy \
  --version-id <version-id> \
  --percentage 10 \
  --env production \
  --yes
```

Source: `wrangler versions deploy --help` (verified locally, Wrangler 4.63.0)

### GitHub Environment Setup (manual, one-time)

```
1. Go to: https://github.com/andrewprograde/<repo>/settings/environments
2. Create environment: "production"
3. Configure protection rules:
   - Required reviewers: add repository owner or team
   - Deployment branches: restrict to tags matching "v*"
4. Add environment secrets:
   - CLOUDFLARE_API_TOKEN (same as repo secret, or a more restricted production-only token)
   - CLOUDFLARE_ACCOUNT_ID
```

Source: [GitHub Environment Protection Rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)

### turbo.json with lint Task Added

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "deploy": {
      "dependsOn": ["build", "test"]
    }
  }
}
```

### Smoke Test with Version Verification

```yaml
- name: Smoke test with version check
  run: |
    RESPONSE=$(curl -sf --retry 3 --retry-delay 5 https://feelr-gateway-staging.feelr.workers.dev/health)
    echo "Health response: $RESPONSE"
    OK=$(echo "$RESPONSE" | jq -r '.ok')
    if [ "$OK" != "true" ]; then
      echo "Health check failed: ok=$OK"
      exit 1
    fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `wrangler publish` in CI | `wrangler deploy` in CI | Wrangler 3.x (2023) | Command renamed; `publish` is deprecated |
| `--x-versions` flag required | Flag removed, `versions` subcommands are stable | Wrangler 3.73.0 (2024) | No experimental flags needed for gradual deployments |
| Manual version percentage via interactive prompts | Positional `<id>@<pct>%` syntax + `--yes` flag | Wrangler 4.x (2025) | Full non-interactive CI/CD support for gradual rollouts |
| `CLOUDFLARE_ENV` not supported | `CLOUDFLARE_ENV` env var selects environment | Wrangler 4.x (Nov 2025) | Can set env via environment variable instead of `--env` flag |
| Preview URLs not available | Preview URLs auto-generated on `versions upload` | Sept 2024+ | Static preview URLs per version (but NOT for DO Workers) |
| `wrangler-action@v2` with global API key | `wrangler-action@v3` with API token only | wrangler-action v3 (2024) | Global API key auth removed; must use scoped API token |

**Deprecated/outdated:**
- `wrangler-action@v1` and `@v2`: Use `@v3`; v1 is discontinued, v2 supports deprecated auth methods
- `--x-versions` flag: Removed in Wrangler 3.73.0; versions commands are now stable
- Interactive `wrangler versions deploy`: Still the default, but `--yes` flag enables non-interactive mode for CI

## Open Questions

1. **Is the repository public or private (affects environment protection rules)?**
   - What we know: GitHub environment protection rules with required reviewers require either a public repo or a paid GitHub plan (Teams/Enterprise) for private repos.
   - What's unclear: The andrewprograde organization's GitHub plan and repo visibility.
   - Recommendation: Implement the `environment: production` job config regardless. If required reviewers don't work due to plan limitations, the workflow will still function (just without the approval gate). This can be upgraded later.

2. **Should PR preview deploys target staging or use a separate preview environment?**
   - What we know: Preview URLs are not available for DO Workers. Staging is the only preview option. PR preview deploys and main-branch deploys would both target staging.
   - What's unclear: Whether simultaneous PR previews will cause confusion when multiple PRs are open.
   - Recommendation: Use staging for PR preview with the same concurrency group as main-branch deploys. Only one version can be deployed at a time. This is acceptable for a solo developer / small team. For larger teams, a dedicated `--env preview` could be added later.

3. **Should the lint task use a dedicated linter (Biome/ESLint) or just extend typecheck?**
   - What we know: No linter is currently configured in the project. `typecheck` runs `tsc --noEmit` across packages. The dashboard has `next lint` but no other package has a `lint` script. CI-01 specifically requires "lint, typecheck, and tests."
   - What's unclear: Whether the user wants to invest in setting up a linter now or satisfy CI-01 minimally.
   - Recommendation: Add a `lint` task to turbo.json. For packages without a dedicated linter, have the `lint` script alias to `tsc --noEmit` (same as typecheck). This satisfies CI-01's requirement for a lint step in CI. A proper linter (Biome is recommended for speed) can be added later as a separate improvement.

4. **How to handle the existing release.yml interaction with the new deploy-production.yml?**
   - What we know: `release.yml` triggers on `v*` tags and runs GoReleaser for CLI binary releases. The new `deploy-production.yml` would also trigger on `v*` tags for gateway production deployment.
   - What's unclear: Whether both should trigger on the same tag pattern, or if gateway deploys should use a different tag pattern (e.g., `gateway-v*`).
   - Recommendation: Use the same `v*` tag pattern for both. The release.yml handles CLI binaries via GoReleaser; deploy-production.yml handles gateway deployment via Wrangler. They are independent jobs with different purposes and different concurrency groups. Both should run on the same release tag.

5. **Gradual rollout automation: should 10% to 100% promotion be automatic or manual?**
   - What we know: The success criteria says "Developer can perform a gradual rollout (10% then 100%)". The `wrangler versions deploy` command supports any percentage.
   - What's unclear: Whether the 10% to 100% step should be automatic (after smoke test passes) or require manual intervention (e.g., `workflow_dispatch`).
   - Recommendation: Make it automatic in the workflow (10% deploy -> smoke test -> 100% deploy) as the default path. Add a separate `workflow_dispatch` workflow for manual percentage control when needed. The automatic path satisfies the success criteria while keeping the process simple.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers GitHub Actions CI/CD](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) - Official CI/CD setup guide
- [Cloudflare Workers Preview URLs](https://developers.cloudflare.com/workers/configuration/previews/) - Preview URL documentation including DO limitation
- [Cloudflare Workers Gradual Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/) - Traffic splitting, DO constraints, version affinity
- [Cloudflare Workers Versions & Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/) - Version lifecycle, deploy vs upload, limitations
- [cloudflare/wrangler-action GitHub](https://github.com/cloudflare/wrangler-action) - v3 action inputs, outputs, secret management, packageManager support
- `wrangler versions deploy --help` (local, Wrangler 4.63.0) - Positional `<id>@<pct>%` syntax, `--yes`, `--version-id`, `--percentage` flags
- `wrangler versions upload --help` (local, Wrangler 4.63.0) - `--env`, `--tag`, `--message`, `--preview-alias` flags
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions) - pnpm setup, caching, remote cache configuration
- [Turborepo Constructing CI](https://turborepo.dev/docs/crafting-your-repository/constructing-ci) - `--affected` flag, turbo-ignore, CI patterns
- [GitHub Actions Concurrency](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) - Concurrency groups, cancel-in-progress behavior
- [GitHub Environment Protection Rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) - Required reviewers, branch restrictions, wait timers

### Secondary (MEDIUM confidence)
- [dorny/paths-filter GitHub](https://github.com/dorny/paths-filter) - v3 usage, filter syntax, PR vs push behavior
- [jtalk/url-health-check-action GitHub](https://github.com/Jtalk/url-health-check-action) - v4 inputs, retry configuration, success criteria
- [CLOUDFLARE_ENV environment variable changelog](https://developers.cloudflare.com/changelog/2025-11-09-cloudflare-env-variable/) - Nov 2025 addition of env var for environment selection

### Verified via Project Files (HIGH confidence)
- `apps/gateway/wrangler.toml` - Multi-env config with staging (workers_dev=true) and production (custom_domain api.feelr.dev)
- `apps/gateway/package.json` - Scripts: dev, deploy, test, typecheck; wrangler ^4.0.0
- `apps/gateway/src/app.ts` - Health endpoint at `/health` returning `{ok: true, version: '1.0.0'}`
- `apps/gateway/src/index.ts` - Exports TokenCoordinator DO class (confirmed DO Worker)
- `turbo.json` - Tasks: build, dev, test, typecheck, deploy (no lint task)
- `package.json` - packageManager: pnpm@9.15.0; scripts: build, dev, test, typecheck, deploy
- `pnpm-workspace.yaml` - Workspace: apps/*, packages/*, connectors/*
- `.github/workflows/release.yml` - Existing GoReleaser workflow on v* tags
- `.planning/phases/12-gateway-infrastructure-environments/12-VERIFICATION.md` - Phase 12 complete, staging URL: feelr-gateway-staging.feelr.workers.dev

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools verified via official docs, local CLI help, and project files
- Architecture: HIGH - Workflow patterns follow official Cloudflare and Turborepo CI/CD guides; concurrency is native GitHub Actions feature
- Pitfalls: HIGH - DO preview URL limitation confirmed in official docs; DO migration constraint confirmed; turbo.json lint gap verified in project files
- Gradual rollouts: HIGH - CLI syntax verified locally via `--help`; non-interactive `--yes` flag confirmed

**Research date:** 2026-02-09
**Valid until:** 2026-03-11 (30 days -- GitHub Actions and Wrangler are stable; wrangler-action v3 is current)
