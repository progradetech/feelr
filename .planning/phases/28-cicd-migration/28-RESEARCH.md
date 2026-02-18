# Phase 28: CI/CD Migration - Research

**Researched:** 2026-02-13
**Domain:** GitHub Actions cross-repo dispatch, git subtree automation, GoReleaser subdirectory builds, fine-grained PAT scoping
**Confidence:** HIGH

## Summary

Phase 28 establishes CI/CD pipelines for the two repositories created in Phase 27. The public repo (`progradetech/feelr`) already has a working CI workflow (lint, typecheck, test on PRs) and a release workflow (GoReleaser on tags). The public repo still contains 9 deployment secrets from the pre-split era (Cloudflare, Azure SWA tokens) that must be removed, plus a `production` GitHub environment that is no longer needed. Only `HOMEBREW_TAP_GITHUB_TOKEN` should remain, and `CLOUD_REPO_PAT` must be added.

The cloud repo (`progradetech/feelr-cloud`) has zero workflows and zero secrets. It needs: (1) a sync workflow triggered by `repository_dispatch` from the public repo that runs `git subtree pull --prefix=oss --squash`, builds, tests, and pushes; (2) deploy workflows for gateway (Cloudflare Workers), dashboard (Azure SWA), and docs (Azure SWA); and (3) all the deployment secrets migrated from the public repo.

The cross-repo dispatch chain works as follows: merge to public main triggers a `peter-evans/repository-dispatch@v4` step that sends an event to `progradetech/feelr-cloud`. The cloud repo's sync workflow receives this event, adds the `oss` remote, runs `git subtree pull`, then pushes the merge commit. The existing deploy workflows (gateway.yml, dashboard.yml, docs.yml) fire on push to cloud main via path filters.

GoReleaser for the cloud repo uses the `goreleaser-action@v6` `workdir: oss` parameter, which sets the working directory to the subtree root where `.goreleaser.yaml` lives with `dir: cli`. The `go-version-file` in `setup-go` needs the path `oss/cli/go.mod`. The `monorepo:` config key is NOT needed (and is Pro-only anyway). The free GoReleaser `builds.dir` parameter handles subdirectory builds without it.

**Primary recommendation:** Create 6 workflow files total -- 1 dispatch trigger in the public repo (new `sync.yml` on push to main), 1 sync receiver in the cloud repo, and 3 deploy workflows plus 1 release workflow in the cloud repo. Clean up public repo secrets and environment. The cloud repo already has squash merge disabled (verified), protecting subtree markers.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `peter-evans/repository-dispatch` | v4.0.1 | Send `repository_dispatch` events cross-repo | De facto standard for cross-repo GitHub Actions triggers; 3k+ stars, actively maintained |
| `actions/checkout` | v4 | Checkout repos in workflows | Standard; `fetch-depth: 0` required for subtree operations |
| `goreleaser/goreleaser-action` | v6 | Run GoReleaser in CI | Standard; `workdir` parameter supports subdirectory builds |
| `cloudflare/wrangler-action` | v3 | Deploy Workers | Already in use in existing workflows |
| `Azure/static-web-apps-deploy` | v1 | Deploy to Azure SWA | Already in use for dashboard and docs |
| `jtalk/url-health-check-action` | v4 | Post-deploy smoke tests | Already in use in existing workflows |
| `actions/setup-go` | v5 | Install Go for GoReleaser | `go-version-file` parameter points to `go.mod` |
| `pnpm/action-setup` | v4 | Install pnpm | Already in use |
| `actions/setup-node` | v4 | Install Node.js | Already in use |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `gh` CLI | (system) | Manage secrets, delete environments | Secret rotation and cleanup |
| `git subtree` | (built-in) | Pull OSS changes into cloud repo | Automated sync workflow |
| `dorny/paths-filter` | v3 | Path-based job conditional | Gateway deploy on specific path changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `peter-evans/repository-dispatch` | GitHub API call via `curl` | Works but requires manual auth header management; action handles it cleanly |
| `karlludwigweise/git-subtree@v1` | Manual git commands | The action (v1.1.1) simplifies auth but is less transparent; manual commands give full control and visibility |
| GoReleaser Pro `monorepo:` config | Free GoReleaser `builds.dir` + `workdir` | Pro is $240/year; not needed -- `workdir` in the action + `dir` in config achieves the same result for single-project builds |

**No new package installation needed** -- all tools are GitHub Actions or already available.

## Architecture Patterns

### Recommended Workflow Layout

```
progradetech/feelr (.github/workflows/):
  ci.yml          # EXISTING: PR quality gates (lint, typecheck, test)
  release.yml     # EXISTING: GoReleaser CLI releases on v* tag
  sync.yml        # NEW: Dispatch to cloud repo on push to main

progradetech/feelr-cloud (.github/workflows/):
  sync.yml        # NEW: Receive dispatch, subtree pull, build, test, push
  gateway.yml     # NEW: Deploy cloud gateway (staging on main push, production on v* tag)
  dashboard.yml   # NEW: Deploy dashboard to Azure SWA (staging + production)
  docs.yml        # NEW: Deploy docs to Azure SWA (staging + production)
  release.yml     # NEW: GoReleaser CLI releases from oss/cli/ on v* tag
```

### Pattern 1: Public Repo Dispatch Trigger (sync.yml)
**What:** On push to main, send a `repository_dispatch` event to the cloud repo with the commit SHA as payload.
**When to use:** Every merge to the public repo's main branch.
**Example:**
```yaml
# progradetech/feelr/.github/workflows/sync.yml
name: Sync to Cloud

on:
  push:
    branches: [main]

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v4
        with:
          token: ${{ secrets.CLOUD_REPO_PAT }}
          repository: progradetech/feelr-cloud
          event-type: oss-sync
          client-payload: '{"sha": "${{ github.sha }}", "ref": "${{ github.ref }}"}'
```
**Source:** [peter-evans/repository-dispatch README](https://github.com/peter-evans/repository-dispatch)

**Critical notes:**
- The `token` MUST be `CLOUD_REPO_PAT` (fine-grained PAT scoped to `feelr-cloud`), NOT `GITHUB_TOKEN` (which cannot dispatch to other repos)
- The `event-type` is an arbitrary string; the cloud repo workflow must listen for the same type
- Maximum 10 top-level properties in `client-payload`; maximum 65,535 characters
- Repository dispatch events only trigger workflows committed to the default branch

### Pattern 2: Cloud Repo Sync Receiver (sync.yml)
**What:** Receive the dispatch event, add the `oss` remote, run `git subtree pull`, build, test, and push.
**When to use:** Triggered automatically by the public repo dispatch.
**Example:**
```yaml
# progradetech/feelr-cloud/.github/workflows/sync.yml
name: Sync OSS

on:
  repository_dispatch:
    types: [oss-sync]
  workflow_dispatch: # Manual trigger for recovery

concurrency:
  group: oss-sync
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Add OSS remote and pull subtree
        run: |
          git remote add oss https://github.com/progradetech/feelr.git
          git fetch oss main
          git subtree pull --prefix=oss oss main --squash \
            -m "chore: sync OSS subtree to ${{ github.event.client_payload.sha }}"

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Build and test
        run: pnpm turbo run typecheck test

      - name: Push sync commit
        run: git push origin main
```
**Source:** [GitHub Actions checkout docs](https://github.com/actions/checkout), [git subtree man page](https://man.archlinux.org/man/git-subtree.1)

**Critical notes:**
- `fetch-depth: 0` is mandatory for `git subtree pull` to find the previous split point
- The `token` in `actions/checkout` must have push permissions (default `GITHUB_TOKEN` works for pushing to the same repo)
- The `oss` remote is added in-workflow because each runner starts fresh
- The public repo is public, so no special token is needed to fetch from it
- `concurrency.cancel-in-progress: false` prevents race conditions where two merges happen quickly
- The `workflow_dispatch` trigger enables manual recovery if sync fails
- `pnpm install --frozen-lockfile` may fail on first sync if the lockfile changes; consider using `pnpm install` without `--frozen-lockfile` for the sync workflow, or committing lockfile updates as part of the sync

### Pattern 3: Cloud Gateway Deploy (gateway.yml)
**What:** Deploy the cloud gateway with the billing overlay. Staging on push to main, production on v* tag.
**When to use:** After sync commits are pushed to cloud main (triggered by path filters).
**Example:**
```yaml
# progradetech/feelr-cloud/.github/workflows/gateway.yml
name: Gateway

on:
  push:
    branches: [main]
    paths:
      - "oss/apps/gateway/**"
      - "oss/packages/**"
      - "oss/connectors/**"
      - "cloud/gateway/**"
    tags:
      - "v*"
  workflow_dispatch:

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    concurrency:
      group: deploy-staging
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Deploy to staging
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: cloud/gateway
          command: deploy -c wrangler.cloud.toml --env staging
          packageManager: pnpm

      - name: Smoke test staging
        uses: jtalk/url-health-check-action@v4
        with:
          url: https://staging-api.feelr.dev/health
          max-attempts: 3
          retry-delay: 5s

  deploy-production:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Deploy to production
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: cloud/gateway
          command: deploy -c wrangler.cloud.toml --env production
          packageManager: pnpm

      - name: Smoke test production
        uses: jtalk/url-health-check-action@v4
        with:
          url: https://api.feelr.dev/health
          max-attempts: 5
          retry-delay: 10s
```
**Source:** Adapted from existing `gateway.yml` workflow in private repo.

**Critical difference from existing workflow:** The `workingDirectory` is `cloud/gateway` (not `apps/gateway`), and the command uses `-c wrangler.cloud.toml` to specify the cloud config. The path filters include `oss/` prefixed paths and `cloud/gateway/**`.

### Pattern 4: Cloud GoReleaser Release (release.yml)
**What:** Build CLI binaries from the subtree's `oss/cli/` directory and publish to `progradetech/feelr` as GitHub Releases.
**When to use:** When a v* tag is pushed to the cloud repo.
**Example:**
```yaml
# progradetech/feelr-cloud/.github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-go@v5
        with:
          go-version-file: oss/cli/go.mod

      - uses: goreleaser/goreleaser-action@v6
        with:
          args: release --clean
          workdir: oss
        env:
          GITHUB_TOKEN: ${{ secrets.HOMEBREW_TAP_GITHUB_TOKEN }}
```
**Source:** [GoReleaser Action README](https://github.com/goreleaser/goreleaser-action), existing release.yml workflow.

**Key:** `workdir: oss` sets GoReleaser's working directory to the subtree root. The `.goreleaser.yaml` at `oss/.goreleaser.yaml` has `dir: cli`, so GoReleaser resolves the Go module at `oss/cli/`. The `release.github.name: feelr` setting publishes releases to the public repo.

### Pattern 5: Fine-Grained PAT Configuration
**What:** A GitHub fine-grained PAT scoped to only `progradetech/feelr-cloud` with minimal permissions.
**When to use:** Stored as `CLOUD_REPO_PAT` in the public repo's secrets.

**Required permissions:**
- Repository access: Only `progradetech/feelr-cloud`
- `Contents`: Read and write (needed for `repository_dispatch` API endpoint)
- `Metadata`: Read-only (automatically selected)

**Source:** [GitHub Managing Personal Access Tokens docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [peter-evans/repository-dispatch README](https://github.com/peter-evans/repository-dispatch)

### Anti-Patterns to Avoid
- **Using `GITHUB_TOKEN` for cross-repo dispatch:** `GITHUB_TOKEN` is scoped to the current repository only. Cross-repo dispatch requires a PAT.
- **Using classic PAT with full `repo` scope:** Fine-grained PAT with `contents:write` on a single repo is more secure.
- **Running `pnpm install --frozen-lockfile` in sync workflow without considering lockfile changes:** A subtree pull may bring in dependency changes. The lockfile may need updating. Use `pnpm install` (without `--frozen-lockfile`) in the sync step, then commit the lockfile update.
- **Triggering deploy workflows from the sync workflow directly:** Let the sync workflow push to main, then let path-filtered deploy workflows trigger naturally on the push event. This decouples sync from deploy and allows manual pushes to also trigger deploys.
- **Putting deployment secrets in the public repo:** The public repo should only have `HOMEBREW_TAP_GITHUB_TOKEN` and `CLOUD_REPO_PAT`. All deployment secrets belong in the cloud repo.
- **Using `cancel-in-progress: true` for sync or deploy concurrency:** Canceling mid-deploy can leave infrastructure in a broken state. Queue deploys, never cancel them.
- **Forgetting `fetch-depth: 0` in subtree operations:** `git subtree pull` needs full history to find the split point. Shallow clones will fail with "can't squash-merge" errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-repo event dispatch | Manual `curl` to GitHub API | `peter-evans/repository-dispatch@v4` | Handles auth, error handling, retries; well-tested |
| Subtree authentication in CI | Complex git credential helper scripts | Public repos need no auth for fetch; checkout token suffices for push | The OSS repo is public -- `git fetch` works without a token |
| GoReleaser subdirectory builds | Custom build scripts or GoReleaser Pro monorepo config | `goreleaser-action@v6` `workdir` parameter | Free tier feature; no Pro license needed |
| Post-deploy health checks | Custom `curl` retry scripts | `jtalk/url-health-check-action@v4` | Handles retries, timeout, failure reporting |
| Secret management | Manual GitHub Settings UI | `gh secret set/delete` CLI commands | Scriptable, repeatable, auditable |

**Key insight:** The critical simplification is that the public repo is public -- no token is needed to `git fetch` from it. The sync workflow only needs push permissions to the cloud repo itself (provided by the default `GITHUB_TOKEN`).

## Common Pitfalls

### Pitfall 1: Subtree Pull Fails on First Sync After Fresh Checkout
**What goes wrong:** `git subtree pull --prefix=oss` fails with "can't squash-merge: 'oss' was never added" when the checkout does not have the full history including the original `git subtree add` commit.
**Why it happens:** The subtree split point markers (`git-subtree-dir`, `git-subtree-split`) are stored in commit messages. A shallow clone (`fetch-depth: 1`) does not include these commits.
**How to avoid:** Always use `fetch-depth: 0` in the checkout step for workflows that run `git subtree pull`.
**Warning signs:** Error message containing "can't squash-merge" or "fatal: ambiguous argument" in the sync workflow logs.

### Pitfall 2: Sync Lockfile Conflicts
**What goes wrong:** The subtree pull brings in OSS dependency changes (e.g., a new package added to an OSS workspace package). The cloud repo's `pnpm-lock.yaml` is now stale. `pnpm install --frozen-lockfile` fails.
**Why it happens:** The OSS repo generates its own lockfile. The cloud repo has a separate lockfile that must be regenerated when OSS dependencies change.
**How to avoid:** In the sync workflow, run `pnpm install` (without `--frozen-lockfile`) after the subtree pull, then `git add pnpm-lock.yaml` and amend the sync commit (or create a separate commit) before pushing.
**Warning signs:** CI failing after sync with "ERR_PNPM_FROZEN_LOCKFILE" or "Lockfile is up to date, resolution step is skipped" followed by build failures.

### Pitfall 3: Deploy Workflow Path Filters Don't Match Subtree Paths
**What goes wrong:** Existing deploy workflows use path filters like `apps/gateway/**`. In the cloud repo, the OSS code lives at `oss/apps/gateway/**`. The path filters don't match, so deploys never trigger.
**Why it happens:** Copy-pasting workflows from the old private repo without updating paths to include the `oss/` prefix.
**How to avoid:** Update all path filters to use `oss/` prefix: `oss/apps/gateway/**`, `oss/packages/**`, `oss/connectors/**`. Add `cloud/gateway/**` for cloud-specific changes.
**Warning signs:** Merges to cloud main don't trigger any deploy workflows despite containing gateway changes.

### Pitfall 4: Repository Dispatch Event Not Triggering Cloud Workflow
**What goes wrong:** The public repo's sync workflow runs successfully (dispatch sent), but the cloud repo's sync workflow never starts.
**Why it happens:** Three common causes: (1) the cloud repo's workflow file is not on the default branch (main); (2) the `event-type` string doesn't match between sender and receiver; (3) the fine-grained PAT lacks `contents:write` permission on the cloud repo.
**How to avoid:** (1) Push the sync workflow to cloud main first before testing; (2) use the exact same `event-type` string in both workflows; (3) verify PAT permissions include `Contents: Read and write`.
**Warning signs:** GitHub shows the dispatch action as successful in the public repo's workflow run, but no workflow appears in the cloud repo's Actions tab.

### Pitfall 5: GoReleaser Fails to Find Git Tags in Subtree
**What goes wrong:** GoReleaser running from `workdir: oss` cannot find the v* tag because tags exist at the repo root level, not in the subtree.
**Why it happens:** GoReleaser searches for git tags from its working directory. The `.git` directory is at the repo root, so tags are found regardless of `workdir`. However, GoReleaser may fail to match the tag to the subtree content if it expects the tag to be in the `oss/` subdirectory.
**How to avoid:** Tags are pushed to the cloud repo root (not to the subtree). GoReleaser running with `workdir: oss` can still see the repo-level tags because the `.git` directory is at the repo root. The free GoReleaser does not use `monorepo.tag_prefix`, so standard `v*` tags work. Verify with `goreleaser build --snapshot` before the first real release.
**Warning signs:** GoReleaser error "git doesn't contain any tags" or "no matches for tag prefix" when running from the cloud repo.

### Pitfall 6: Public Repo Still Has Deployment Secrets
**What goes wrong:** A malicious PR author could craft a workflow that exfiltrates deployment secrets (Cloudflare tokens, Azure SWA tokens) from the public repo.
**Why it happens:** The secrets from the pre-split era were not cleaned up. Even though the deploy workflow files were removed, the secrets still exist and are accessible to any workflow in the repo.
**How to avoid:** Delete all deployment secrets from the public repo: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `DASHBOARD_TOKEN`, `DOCS_TOKEN`, `SWA_DASHBOARD_DEPLOYMENT_TOKEN`, `SWA_DASHBOARD_STAGING_TOKEN`, `SWA_DOCS_DEPLOYMENT_TOKEN`, `SWA_DOCS_STAGING_TOKEN`. Also delete the `production` GitHub environment. Keep only `HOMEBREW_TAP_GITHUB_TOKEN` and add `CLOUD_REPO_PAT`.
**Warning signs:** Running `gh api repos/progradetech/feelr/actions/secrets --jq '.secrets[].name'` shows deployment-related secrets.

### Pitfall 7: Wrangler Deploy from Cloud Repo Uses Wrong Working Directory
**What goes wrong:** Wrangler deploys from the cloud repo fail because the `workingDirectory` points to `apps/gateway` instead of `cloud/gateway`, or because wrangler uses the OSS `wrangler.toml` instead of `wrangler.cloud.toml`.
**Why it happens:** Copy-pasting the gateway deploy workflow from the old repo without updating the working directory and config path.
**How to avoid:** Set `workingDirectory: cloud/gateway` and use `command: deploy -c wrangler.cloud.toml --env staging`. The cloud gateway's `wrangler.cloud.toml` has `main = "gateway-entry.ts"` which is the correct cloud entry point.
**Warning signs:** Wrangler deploys the OSS gateway (without billing) instead of the cloud gateway, or fails with "file not found" errors.

## Code Examples

Verified patterns from official sources:

### Cleaning Up Public Repo Secrets
```bash
# Source: gh CLI docs
# Delete all deployment secrets from the public repo
for secret in CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN DASHBOARD_TOKEN DOCS_TOKEN \
  SWA_DASHBOARD_DEPLOYMENT_TOKEN SWA_DASHBOARD_STAGING_TOKEN \
  SWA_DOCS_DEPLOYMENT_TOKEN SWA_DOCS_STAGING_TOKEN; do
  gh secret delete "$secret" --repo progradetech/feelr
done

# Delete the production environment
gh api --method DELETE repos/progradetech/feelr/environments/production

# Verify only expected secrets remain
gh api repos/progradetech/feelr/actions/secrets --jq '.secrets[].name'
# Expected output: HOMEBREW_TAP_GITHUB_TOKEN
```

### Setting Up Cloud Repo Secrets
```bash
# Source: gh CLI docs
# Add all deployment secrets to the cloud repo
# These values must come from the user's credential store
gh secret set CLOUDFLARE_API_TOKEN --repo progradetech/feelr-cloud
gh secret set CLOUDFLARE_ACCOUNT_ID --repo progradetech/feelr-cloud
gh secret set SWA_DASHBOARD_STAGING_TOKEN --repo progradetech/feelr-cloud
gh secret set SWA_DASHBOARD_DEPLOYMENT_TOKEN --repo progradetech/feelr-cloud
gh secret set SWA_DOCS_STAGING_TOKEN --repo progradetech/feelr-cloud
gh secret set SWA_DOCS_DEPLOYMENT_TOKEN --repo progradetech/feelr-cloud
gh secret set HOMEBREW_TAP_GITHUB_TOKEN --repo progradetech/feelr-cloud
# CF Analytics tokens for dashboard build
gh secret set CF_ANALYTICS_TOKEN_STAGING --repo progradetech/feelr-cloud
gh secret set CF_ANALYTICS_TOKEN_PRODUCTION --repo progradetech/feelr-cloud
```

### Creating the Fine-Grained PAT
```
Manual steps (cannot be automated via CLI):
1. Go to github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Name: "feelr-public-to-cloud-dispatch"
4. Expiration: Set per security policy (recommend 90 days with rotation reminder)
5. Repository access: "Only select repositories" -> progradetech/feelr-cloud
6. Permissions:
   - Contents: Read and write
   - Metadata: Read-only (auto-selected)
7. Generate token, copy value
8. Store as secret in public repo:
   gh secret set CLOUD_REPO_PAT --repo progradetech/feelr --body "<token-value>"
```

### GoReleaser Snapshot Test from Cloud Repo
```bash
# Source: goreleaser docs
# Test that GoReleaser can build from the cloud repo's subtree
cd /tmp/feelr-cloud
goreleaser build --snapshot --clean --single-target -f oss/.goreleaser.yaml
# Or using the action parameters:
# workdir: oss -> goreleaser runs from /tmp/feelr-cloud/oss/
# .goreleaser.yaml has dir: cli -> resolves to oss/cli/
# go.mod at oss/cli/go.mod -> Go build works
```

### Complete Secrets Inventory (Post-Migration)
```
PUBLIC REPO (progradetech/feelr) secrets:
  HOMEBREW_TAP_GITHUB_TOKEN  - GoReleaser pushes Homebrew formula to tap repo
  CLOUD_REPO_PAT             - peter-evans/repository-dispatch to cloud repo

PUBLIC REPO environments:
  (none)

CLOUD REPO (progradetech/feelr-cloud) secrets:
  CLOUDFLARE_API_TOKEN           - Wrangler deploy gateway
  CLOUDFLARE_ACCOUNT_ID          - Wrangler deploy gateway
  SWA_DASHBOARD_STAGING_TOKEN    - Azure SWA dashboard staging deploy
  SWA_DASHBOARD_DEPLOYMENT_TOKEN - Azure SWA dashboard production deploy
  SWA_DOCS_STAGING_TOKEN         - Azure SWA docs staging deploy
  SWA_DOCS_DEPLOYMENT_TOKEN      - Azure SWA docs production deploy
  CF_ANALYTICS_TOKEN_STAGING     - Dashboard build env var (staging)
  CF_ANALYTICS_TOKEN_PRODUCTION  - Dashboard build env var (production)
  HOMEBREW_TAP_GITHUB_TOKEN      - GoReleaser pushes Homebrew formula to tap repo

CLOUD REPO environments:
  production - GitHub environment with approval gate for production deploys
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Classic PAT with `repo` scope | Fine-grained PAT with per-repo permissions | GitHub GA 2023 | Minimum privilege; limits blast radius of token compromise |
| `peter-evans/repository-dispatch@v3` | `@v4` (v4.0.1, Nov 2025) | Nov 2025 | Minor; same API, version bump |
| GoReleaser Pro for monorepo | Free GoReleaser `builds.dir` + action `workdir` | Always available | No Pro license needed for single-project subdirectory builds |
| Manual subtree sync | Automated via `repository_dispatch` + workflow | Emerging pattern | Eliminates human step; sync happens within minutes of public merge |

**Deprecated/outdated:**
- `peter-evans/repository-dispatch@v3`: Superseded by v4; v3 still works but v4 is current
- `goreleaser/goreleaser-action@v5`: Superseded by v6
- GoReleaser `brews` key: Deprecated since v2.10 in favor of `homebrew_casks`, but still functional. Already noted in existing `.goreleaser.yaml` -- no action needed now

## Open Questions

1. **Should the sync workflow update the pnpm lockfile as part of the sync commit?**
   - What we know: Subtree pulls may bring in OSS dependency changes. The cloud lockfile would become stale.
   - What's unclear: Whether to run `pnpm install` in the sync job and commit lockfile changes, or let it fail and require manual intervention.
   - Recommendation: Run `pnpm install` (without `--frozen-lockfile`) after subtree pull, and if the lockfile changes, commit it as part of the sync. This keeps the sync fully automated. Use `git diff --quiet pnpm-lock.yaml || git add pnpm-lock.yaml && git commit --amend --no-edit` to fold lockfile changes into the sync commit.

2. **Should the cloud repo have its own CI workflow for PRs (like the public repo)?**
   - What we know: The cloud repo is private and currently only has one maintainer. The sync workflow handles build/test on every sync.
   - What's unclear: Whether PRs to the cloud repo (e.g., cloud overlay changes) need their own CI.
   - Recommendation: Yes, add a basic CI workflow for cloud PRs. It protects against broken cloud-specific changes (gateway-entry.ts, wrangler.cloud.toml). This is not an explicit requirement but prevents regressions.

3. **Where should CLI releases be triggered -- public repo or cloud repo?**
   - What we know: The public repo has a release.yml that runs GoReleaser on v* tags. The cloud repo would also need one if releases are managed from there. The `.goreleaser.yaml` has `release.github.name: feelr` which publishes to the public repo.
   - What's unclear: Whether tags should be pushed to the public repo or the cloud repo. Since GoReleaser publishes to `progradetech/feelr`, tagging the public repo directly makes sense. But CICD-06 says "GoReleaser builds the CLI binary from `oss/cli/` path in the cloud repo."
   - Recommendation: Keep the release workflow in the public repo (already exists and works with `dir: cli`). Additionally, create a release workflow in the cloud repo that uses `workdir: oss` for CICD-06 validation (`goreleaser build --snapshot` succeeds). The public repo release is the primary path; the cloud repo release is a backup/validation path.

4. **Should deploy scripts in public repo's `scripts/` directory be removed?**
   - What we know: The public repo contains `scripts/deploy-dashboard.sh`, `scripts/deploy-docs.sh`, `scripts/deploy-gateway-production.sh`, `scripts/deploy-gateway-staging.sh`, `scripts/rollback-gateway.sh`. These reference cloud infrastructure.
   - What's unclear: Whether these are useful for self-hosters or should be removed.
   - Recommendation: These scripts reference specific Cloudflare/Azure resources and are cloud-specific. They should be moved to the cloud repo or removed from the public repo. However, this is a cleanup task and not strictly required by Phase 28 requirements.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: All 5 existing workflow files, `.goreleaser.yaml`, Phase 27 research and verification documents
- [peter-evans/repository-dispatch README (v4.0.1)](https://github.com/peter-evans/repository-dispatch) -- Token requirements, input parameters, limitations, examples
- [GitHub Events that trigger workflows: repository_dispatch](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#repository_dispatch) -- Event format, types filtering, client_payload access, 65,535 char limit
- [GoReleaser Action README](https://github.com/goreleaser/goreleaser-action) -- `workdir` parameter documentation
- [GoReleaser Monorepo docs](https://goreleaser.com/customization/monorepo/) -- Confirmed monorepo feature is Pro-only
- [GoReleaser Go builds docs](https://goreleaser.com/customization/builds/go/) -- `dir` parameter for subdirectory builds
- GitHub API verification: Public repo has 9 secrets (7 deployment, 1 Homebrew, 1 dashboard/docs), cloud repo has 0 secrets, 0 workflows
- GitHub API verification: Cloud repo has squash merge disabled (protecting subtree markers)

### Secondary (MEDIUM confidence)
- [GoReleaser Private Monorepo Public Release cookbook](https://goreleaser.com/cookbooks/private-monorepo-public-release/) -- `release.github` to publish to a different repo
- [karlludwigweise/git-subtree action (v1.1.1)](https://github.com/karlludwigweise/git-subtree) -- Alternative approach for subtree operations in CI
- [GitHub Managing Personal Access Tokens docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) -- Fine-grained PAT permission model
- [GitHub community discussion: git subtree in actions](https://github.com/orgs/community/discussions/62592) -- Token challenges for cross-repo subtree operations

### Tertiary (LOW confidence)
- [GitHub community discussion: repository_dispatch and GITHUB_TOKEN limitations](https://github.com/orgs/community/discussions/42316) -- Cross-repo token scoping
- [goreleaser-action issue #223: subdirectory "not a git repository"](https://github.com/goreleaser/goreleaser-action/issues/223) -- Resolved in v2+; relevant for understanding `workdir` behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools verified via official docs and READMEs; versions confirmed; existing workflow patterns provide tested templates
- Architecture: HIGH -- Cross-repo dispatch is a well-documented pattern; subtree pull in CI has known solutions; GoReleaser `workdir` parameter is documented
- Pitfalls: HIGH -- All pitfalls verified against current codebase state (secrets inventory, path filters, fetch-depth); GitHub squash merge already disabled on cloud repo

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (stable domain -- GitHub Actions, GoReleaser, and git subtree are mature with slow evolution)
