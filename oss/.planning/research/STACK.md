# Technology Stack: Open-Core Repo Restructuring

**Project:** Feelr -- Splitting monorepo into public `progradetech/feelr` + private `progradetech/feelr-cloud` using git subtree
**Researched:** 2026-02-13
**Confidence:** HIGH (verified against official git docs, GitHub Actions docs, peter-evans/repository-dispatch repo, GitLab open-core precedent)

---

## Executive Summary

The open-core split requires three technology layers: (1) git subtree for consuming the public repo inside the private cloud repo, (2) GitHub Actions with `repository_dispatch` for automated cross-repo sync when the public repo merges, and (3) pnpm workspace overlay for the cloud repo to extend the public monorepo's packages with billing/Stripe/cloud-deployment code.

The recommended architecture is **public-primary with private overlay**: `progradetech/feelr` is the public repo containing gateway, connectors, CLI, self-hosting, and docs. `progradetech/feelr-cloud` is the private repo that uses `git subtree add --prefix=oss` to embed the entire public repo, then adds cloud-only packages alongside it. CI in the public repo fires a `repository_dispatch` event to the cloud repo on every merge to `main`, which triggers an automated `git subtree pull` to stay in sync.

This follows the GitLab model (single codebase with `/ee` directory for proprietary code) but inverted: the public code is the base, and the private repo wraps it with cloud extensions. Git subtree is preferred over git submodule because contributors to the public repo never encounter submodule metadata, and the cloud repo's CI can operate on a fully materialized codebase without extra clone steps.

---

## Recommended Stack

### Git Operations -- Subtree Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `git subtree` | Built into git 2.43+ (available on system) | Embed public repo into private cloud repo at a prefix path | Subtree embeds the full codebase inline -- no `.gitmodules`, no extra clone steps for CI, contributors to the public repo are unaffected. Unlike submodules, the cloud repo is fully self-contained after clone. |
| `--squash` flag | N/A | Condense public repo history into single merge commits | Prevents public repo's full commit history from cluttering the cloud repo log. Each sync becomes one squashed merge commit. Required for clean `git log` in cloud repo. |
| `--prefix=oss` | N/A | Mount point for public repo inside cloud repo | All public code lives under `oss/` in the cloud repo. Cloud-only code lives at root alongside it (e.g., `cloud/`, `infra/`). Clear boundary between open-source and proprietary. |

**Core commands:**

```bash
# Initial setup (run once in feelr-cloud repo)
git remote add oss git@github.com:progradetech/feelr.git
git subtree add --prefix=oss oss main --squash -m "chore: import feelr OSS at $(git -C . rev-parse --short HEAD)"

# Sync updates (run by CI or manually)
git fetch oss main
git subtree pull --prefix=oss oss main --squash -m "chore: sync feelr OSS $(date +%Y-%m-%d)"

# Push changes back to public repo (rare, for cloud-originated fixes)
git subtree push --prefix=oss oss main
```

### CI Cross-Repo Sync -- GitHub Actions

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `peter-evans/repository-dispatch` | v4.0.1 | Trigger cloud repo sync from public repo | Purpose-built action for cross-repo dispatch. Cleaner than raw `curl` or `actions/github-script`. Handles auth and payload formatting. MIT licensed, actively maintained (last release Nov 2025). |
| `actions/github-script` | v7 | Alternative/fallback for dispatch + subtree pull script in cloud repo | Built-in GitHub action for running Octokit scripts. Useful for the receiving workflow to post status back. |
| `actions/checkout` | v4 | Checkout repos in CI workflows | Standard checkout action. Cloud repo workflows use it with `fetch-depth: 0` for subtree operations (subtree needs full history for squash merges). |
| Fine-grained PAT | N/A | Cross-repo authentication | Required for dispatch from public to private repo. Scope: `contents: read+write` and `metadata: read` on `progradetech/feelr-cloud`. Fine-grained PATs reached GA March 2025. |

**Public repo dispatch workflow (trigger):**

```yaml
# .github/workflows/sync-cloud.yml (in progradetech/feelr)
name: Notify Cloud Repo
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
          event-type: oss-updated
          client-payload: >-
            {
              "sha": "${{ github.sha }}",
              "ref": "${{ github.ref }}",
              "actor": "${{ github.actor }}"
            }
```

**Cloud repo sync workflow (receiver):**

```yaml
# .github/workflows/sync-oss.yml (in progradetech/feelr-cloud)
name: Sync OSS
on:
  repository_dispatch:
    types: [oss-updated]
  workflow_dispatch:  # Manual trigger fallback

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # REQUIRED for git subtree operations
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Sync OSS subtree
        run: |
          git remote add oss https://github.com/progradetech/feelr.git || true
          git fetch oss main
          git subtree pull --prefix=oss oss main --squash \
            -m "chore: sync feelr OSS ${{ github.event.client_payload.sha || 'manual' }}"

      - name: Push sync commit
        run: git push origin main

      - name: Run cloud build verification
        run: |
          cd oss && pnpm install --frozen-lockfile
          pnpm turbo run build test --filter='./cloud/*'
```

### Authentication -- Fine-Grained PAT Setup

| Token | Scope | Repository | Stored As | Used By |
|-------|-------|-----------|-----------|---------|
| Cloud Repo PAT | `contents: read+write`, `metadata: read` | `progradetech/feelr-cloud` only | `CLOUD_REPO_PAT` secret in `progradetech/feelr` | Public repo's `sync-cloud.yml` dispatch step |

**Why fine-grained PAT over classic PAT:** Fine-grained PATs (GA since March 2025) can be scoped to a single repository with minimal permissions. A classic PAT with `repo` scope grants access to ALL repositories the user owns -- excessive for this use case. Fine-grained PAT with `contents: write` on only `feelr-cloud` follows least-privilege principle.

**Why not a GitHub App installation token:** GitHub Apps are better for organization-wide automation, but Feelr uses a personal account (`progradetech`). A fine-grained PAT is simpler for single-owner, two-repo scenarios.

### Cloud Repo Structure -- Workspace Overlay

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pnpm workspaces | 9.15.0 (match existing) | Manage combined OSS + cloud packages | pnpm workspaces can reference packages inside `oss/` subdirectory. Cloud packages declare dependencies on `oss/packages/*` using workspace protocol. |
| Turborepo | latest (match existing) | Task orchestration across combined workspace | Turborepo's `--filter` flag enables building only cloud packages or only OSS packages. Task graph respects cross-boundary dependencies. |

**Cloud repo directory structure:**

```
feelr-cloud/
  oss/                          # git subtree of progradetech/feelr
    apps/
      gateway/                  # OSS gateway
      dashboard/                # OSS dashboard
      docs/                     # OSS docs
    packages/
      connector-sdk/            # OSS connector SDK
      tsconfig/                 # OSS shared tsconfig
    connectors/                 # OSS connectors
    cli/                        # OSS Go CLI
    ...
  cloud/                        # Cloud-only code (proprietary)
    apps/
      billing-worker/           # Stripe billing Worker
    packages/
      cloud-config/             # Cloud-specific configuration
      stripe-connector/         # Cloud-only Stripe billing connector
    infra/                      # Cloud deployment (Terraform, etc.)
  pnpm-workspace.yaml           # References both oss/* and cloud/*
  turbo.json                    # Extended config for cloud tasks
  package.json                  # Cloud repo root
```

**Cloud repo pnpm-workspace.yaml:**

```yaml
packages:
  - 'oss/apps/*'
  - 'oss/packages/*'
  - 'oss/connectors/*'
  - 'cloud/apps/*'
  - 'cloud/packages/*'
```

**Cloud repo turbo.json (extends OSS):**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "extends": ["//"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "out/**"],
      "env": ["NEXT_PUBLIC_GATEWAY_URL", "STRIPE_SECRET_KEY"]
    },
    "deploy:cloud": {
      "dependsOn": ["build", "test"],
      "cache": false
    }
  }
}
```

### Build Integration -- Cloud Overlay Pattern

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript path aliases | 5.7+ (existing) | Cloud packages import from OSS packages | `cloud/packages/cloud-config` can import from `@feelr/connector-sdk` (which lives in `oss/packages/connector-sdk`). pnpm workspace protocol resolves these automatically. |
| Turborepo `--filter` | latest | Selective builds | `pnpm turbo run build --filter='./cloud/*'` builds only cloud packages. `pnpm turbo run build` builds everything. CI can filter based on what changed. |
| dorny/paths-filter | v3 | Detect which packages changed in CI | Already used in existing CI. Cloud repo CI uses it to determine whether OSS sync affected cloud packages. |

---

## Critical Architecture Decision: Subtree Direction

### Option A (RECOMMENDED): Private repo consumes public repo via subtree

```
feelr-cloud (private) --[subtree pull]--> feelr (public)
```

The private cloud repo pulls the public repo into an `oss/` prefix. Cloud-only code lives alongside at `cloud/`.

**Advantages:**
- Public repo is clean -- zero awareness of cloud repo's existence
- Contributors to public repo never see subtree metadata
- Cloud repo has full materialized codebase for builds
- CI in cloud repo can run full integration tests against OSS + cloud together

**Disadvantages:**
- Cloud repo has larger git history (mitigated by `--squash`)
- `fetch-depth: 0` required in cloud CI for subtree operations

### Option B (NOT RECOMMENDED): Public repo splits from monorepo via subtree

```
feelr (public) <--[subtree split]-- feelr-monorepo (private)
```

Keep the current monorepo as the single source of truth, use `git subtree split` to publish OSS portions to the public repo.

**Why not:** This makes the private repo the development hub. Open-source contributors would submit PRs to the public repo, which then need to be manually merged back into the private monorepo. Two-way sync is error-prone. The public repo becomes a read-only mirror, which discourages community contribution.

### Option C (NOT RECOMMENDED): Git submodules

```
feelr-cloud (private) --[submodule ref]--> feelr (public)
```

**Why not:** Submodules require explicit `git submodule update --init` after clone. CI needs extra steps. Contributors who clone the cloud repo get an empty `oss/` directory until they init submodules. Subtree embeds code inline -- simpler for everyone.

---

## Token and Secret Requirements

### New Secrets for Public Repo (`progradetech/feelr`)

| Secret Name | Value Source | Purpose |
|-------------|-------------|---------|
| `CLOUD_REPO_PAT` | Fine-grained PAT scoped to `progradetech/feelr-cloud` with `contents: read+write`, `metadata: read` | Dispatch `oss-updated` event to cloud repo on merge to main |

### New Secrets for Cloud Repo (`progradetech/feelr-cloud`)

| Secret Name | Value Source | Purpose |
|-------------|-------------|---------|
| `CLOUDFLARE_API_TOKEN` | Same as existing | Deploy cloud Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Same as existing | Deploy cloud Workers |
| `STRIPE_SECRET_KEY` | Stripe dashboard | Billing Worker runtime |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard | Webhook signature verification |

### Existing Secrets (Move to Public Repo)

All current secrets in `progradetech/feelr` remain -- they serve the OSS CI/CD pipelines. The cloud repo gets copies of infrastructure secrets plus cloud-specific ones.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Repo embedding | git subtree | git submodule | Submodules require explicit init after clone, add `.gitmodules` file to cloud repo, require extra CI steps. Subtree embeds code inline -- cloud repo is self-contained. |
| Repo embedding | git subtree | npm package (publish OSS as npm packages, consume in cloud) | Adds build/publish latency. Cloud repo would depend on published artifacts, not source. Harder to debug, impossible to make atomic cross-boundary changes. |
| Repo embedding | git subtree | Copy-paste / manual sync | Obviously unscalable. Divergence guaranteed. |
| Cross-repo trigger | `peter-evans/repository-dispatch@v4` | Raw `curl` to GitHub API | repository-dispatch action handles auth headers, error handling, payload serialization. Curl works but is more code and harder to maintain. |
| Cross-repo trigger | `peter-evans/repository-dispatch@v4` | `actions/github-script@v7` with `createDispatchEvent` | github-script is heavier (loads full Octokit). repository-dispatch is single-purpose and clearer in intent. |
| Cross-repo trigger | `repository_dispatch` | `workflow_dispatch` | `workflow_dispatch` is designed for manual triggers with form inputs. `repository_dispatch` is designed for programmatic triggers with arbitrary JSON payloads. Better semantic fit. |
| Cross-repo trigger | `repository_dispatch` | Polling/cron schedule | Polling wastes CI minutes and adds latency. Dispatch is instant and event-driven. |
| Auth | Fine-grained PAT | Classic PAT with `repo` scope | Classic PAT grants access to ALL repos. Fine-grained PAT scopes to single repo with minimal permissions. |
| Auth | Fine-grained PAT | GitHub App installation token | Over-engineered for two repos under one account. GitHub Apps are better for organization-wide automation across many repos. |
| Cloud repo structure | `oss/` prefix with separate `cloud/` | Flat merge (OSS files at root, cloud files alongside) | No clear boundary between open-source and proprietary. Easy to accidentally leak proprietary code. `oss/` prefix makes the boundary visible in `ls`. |
| Cloud repo structure | `oss/` prefix with separate `cloud/` | GitLab-style `/ee` directory in same repo | GitLab merged CE+EE into one repo because they had 55 engineers. Feelr is small -- separating repos keeps the public repo clean and the private repo focused. The GitLab model is for when you outgrow the two-repo approach. |
| Sync direction | Public-primary (cloud pulls from public) | Private-primary (public is split/mirror from private) | Private-primary makes the public repo a read-only mirror, discouraging open-source contributions. Public-primary treats OSS as the real development hub. |

---

## Version Compatibility Matrix

| Tool | Current in Project | Required for Open-Core | Change Needed? |
|------|-------------------|----------------------|----------------|
| git | 2.43.0 | 1.7.11+ (for subtree) | No |
| git subtree | Built-in | Built-in | No |
| pnpm | 9.15.0 | 9.15.0 | No (same version in cloud repo) |
| Turborepo | latest | latest | No (same version in cloud repo) |
| Node.js (CI) | 20 | 20 | No |
| `actions/checkout` | v4 | v4 | No (but add `fetch-depth: 0` for subtree ops) |
| `peter-evans/repository-dispatch` | N/A (new) | v4.0.1 | **Add to public repo workflows** |
| `actions/github-script` | v7 (existing) | v7 | No |
| `dorny/paths-filter` | v3 (existing) | v3 | No |
| `pnpm/action-setup` | v4 (existing) | v4 | No |
| `actions/setup-node` | v4 (existing) | v4 | No |
| `actions/cache` | v4 (existing) | v4 | No |

---

## Key Constraints and Limitations

### git subtree limitations

1. **`fetch-depth: 0` required in CI** -- Subtree operations need full git history to compute the merge base. Shallow clones (`fetch-depth: 1`, the GitHub Actions default) will cause `git subtree pull` to fail. This increases checkout time but is unavoidable.

2. **No native conflict resolution UI** -- If cloud repo has modified files under `oss/` (not recommended but possible), subtree pull creates merge conflicts that must be resolved manually. Prevention: never edit files under `oss/` directly in the cloud repo.

3. **Squash consistency** -- If using `--squash` (recommended), you MUST always use `--squash`. Mixing squash and non-squash pulls causes history divergence and broken future pulls.

4. **inode cache bug** -- Known bug in git-subtree where `.git/subtree-cache/` directory grows unbounded. In CI this is irrelevant (fresh clone each time). For local dev, occasional `rm -rf .git/subtree-cache/*` may be needed.

5. **Push back is expensive** -- `git subtree push` rewrites history to extract the subtree. For large repos this is slow. For Feelr's ~21K LOC this is manageable but should be rare (most changes flow public -> cloud, not reverse).

### repository_dispatch limitations

1. **Default branch only** -- Repository dispatch events ONLY trigger workflows committed to the default branch. Cannot use this to trigger workflows on feature branches.

2. **Payload size** -- Maximum 10 top-level properties in `client_payload`. Maximum 65,535 characters total. For passing commit SHA and actor, this is more than sufficient.

3. **No built-in completion callback** -- The dispatching workflow does not wait for the receiving workflow to complete. If the cloud sync fails, the public repo workflow does not know. Mitigation: cloud repo posts failure notifications to Slack/Discord.

4. **Token expiration** -- Fine-grained PATs have a maximum expiration of 1 year. Must be rotated before expiry. Set a calendar reminder.

---

## Installation / Setup Commands

```bash
# ============================================================
# ONE-TIME SETUP: Create feelr-cloud repo and initialize subtree
# ============================================================

# 1. Create private repo on GitHub
gh repo create progradetech/feelr-cloud --private --description "Feelr Cloud Platform"

# 2. Clone and initialize
git clone git@github.com:progradetech/feelr-cloud.git
cd feelr-cloud

# 3. Create initial structure
mkdir -p cloud/apps cloud/packages cloud/infra

# 4. Initialize package.json and workspace
cat > package.json << 'EOF'
{
  "name": "feelr-cloud",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "sync:oss": "./scripts/sync-oss.sh"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
EOF

cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'oss/apps/*'
  - 'oss/packages/*'
  - 'oss/connectors/*'
  - 'cloud/apps/*'
  - 'cloud/packages/*'
EOF

# 5. Commit initial structure
git add -A && git commit -m "chore: initialize feelr-cloud repo structure"

# 6. Add public repo as subtree
git remote add oss git@github.com:progradetech/feelr.git
git fetch oss main
git subtree add --prefix=oss oss main --squash \
  -m "chore: import feelr OSS codebase"

# 7. Push
git push -u origin main

# ============================================================
# ONGOING: Sync script (scripts/sync-oss.sh in cloud repo)
# ============================================================
cat > scripts/sync-oss.sh << 'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

echo "Fetching latest from progradetech/feelr..."
git fetch oss main

echo "Pulling subtree updates..."
git subtree pull --prefix=oss oss main --squash \
  -m "chore: sync feelr OSS $(date +%Y-%m-%d)"

echo "Installing dependencies..."
pnpm install

echo "Running build verification..."
pnpm turbo run build test

echo "OSS sync complete."
SCRIPT
chmod +x scripts/sync-oss.sh

# ============================================================
# TOKEN SETUP
# ============================================================

# 1. Create fine-grained PAT at https://github.com/settings/personal-access-tokens/new
#    - Token name: feelr-cloud-dispatch
#    - Expiration: 1 year (set calendar reminder to rotate)
#    - Repository access: Only select repositories -> progradetech/feelr-cloud
#    - Permissions: Contents (read+write), Metadata (read)

# 2. Add PAT as secret to public repo
gh secret set CLOUD_REPO_PAT --repo progradetech/feelr -b "<paste-pat-here>"
```

---

## Sources

### Official Documentation (HIGH confidence)
- [git-subtree(1) man page](https://man.archlinux.org/man/git-subtree.1) -- Complete command reference, all options, behavioral notes
- [Atlassian Git Subtree Tutorial](https://www.atlassian.com/git/tutorials/git-subtree) -- add/pull/push commands, squash option, remote setup
- [GitHub Docs: Triggering a workflow](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow) -- repository_dispatch, workflow_dispatch, token requirements
- [GitHub Docs: Fine-grained PAT permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens) -- Required scopes per API endpoint
- [peter-evans/repository-dispatch v4.0.1](https://github.com/peter-evans/repository-dispatch) -- Action inputs, token requirements, payload limits, fine-grained PAT compatibility
- [actions/checkout v4](https://github.com/actions/checkout) -- Multi-repo checkout, token parameter, fetch-depth

### Verified via Project Files (HIGH confidence)
- `package.json` -- pnpm 9.15.0, Turborepo latest, existing scripts
- `pnpm-workspace.yaml` -- Current workspace glob patterns: `apps/*`, `packages/*`, `connectors/*`
- `turbo.json` -- Current task definitions: build, dev, test, typecheck, deploy, lint
- `.github/workflows/ci.yml` -- Current CI: checkout@v4, pnpm/action-setup@v4, dorny/paths-filter@v3, actions/github-script@v7

### Community/Precedent Sources (MEDIUM confidence)
- [GitLab: Single Codebase for CE and EE](https://about.gitlab.com/blog/a-single-codebase-for-gitlab-community-and-enterprise-edition/) -- Open-core precedent: `/ee` directory pattern, module injection for EE features
- [GitLab: EE Features Implementation Guide](https://docs.gitlab.com/development/ee_features/) -- How EE code is separated within single codebase
- [Cross-Repository Workflows Guide (Dec 2025)](https://oneuptime.com/blog/post/2025-12-20-cross-repository-workflows-github-actions/view) -- repository_dispatch, workflow_dispatch, reusable workflows patterns
- [Repository Dispatch Deep Dive (Dec 2025)](https://oneuptime.com/blog/post/2025-12-20-repository-dispatch-github-actions/view) -- Payload handling, token setup, best practices
- [peter-evans/repository-dispatch#127](https://github.com/peter-evans/repository-dispatch/issues/127) -- Fine-grained PAT permissions: `contents: write` + `metadata: read`
- [git-subsplit](https://github.com/dflydev/git-subsplit) -- Automated subtree split tooling (evaluated, not recommended for this use case)
- [Elio Struyf: Dispatch with github-script](https://www.eliostruyf.com/dispatch-github-action-workflow-script-action/) -- Working `createDispatchEvent` example with actions/github-script@v7

---

*Stack research for: Feelr -- Open-Core Repo Restructuring*
*Researched: 2026-02-13*
