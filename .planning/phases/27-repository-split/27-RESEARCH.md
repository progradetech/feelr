# Phase 27: Repository Split - Research

**Researched:** 2026-02-13
**Domain:** Git subtree, pnpm workspace overlay, monorepo split, Cloudflare Workers entry point composition
**Confidence:** HIGH

## Summary

Phase 27 splits the current private `progradetech/feelr` monorepo into two repositories: a public `progradetech/feelr` (MIT, fresh snapshot) and a private `progradetech/feelr-cloud` that embeds the public repo at `oss/` via `git subtree add --prefix=oss --squash`. The cloud repo layers a billing overlay by importing the OSS Hono app and registering `StripeBillingProvider` before deploying with its own `wrangler.cloud.toml`.

Phase 26 already extracted billing behind a pluggable `BillingProvider` interface with `NoopBillingProvider` (default) and `StripeBillingProvider` (cloud-only, isolated in `billing/stripe/`). The gateway's `tsconfig.json` already excludes `src/billing/stripe/**` from type checking, and `package.json` has no `stripe` npm dependency. The gateway exports its Hono app as a default export from `app.ts`, which both `index.ts` (cloud entry) and `self-hosted-entry.ts` already import. This architecture means the cloud overlay simply needs a new `gateway-entry.ts` that imports the app, instantiates `StripeBillingProvider`, injects it into the adapted environment, and re-exports the Worker.

Phase 25 produced a complete file classification matrix (in `docs/deployment/SECRETS-INVENTORY.md` Section 5B) marking every file/directory as PUBLIC, EXCLUDE, or PARTIAL. The fresh snapshot approach eliminates git history leakage risk. Key exclusions: `.planning/`, `feelr-strategy.md`, `docs/deployment/SECRETS-INVENTORY.md`, `docs/deployment/RUNBOOK.md`. The `wrangler.toml` production/staging environment blocks must be stripped from the public repo snapshot.

**Primary recommendation:** Create the public repo first (fresh snapshot with exclusions applied), then create the cloud repo with `git subtree add --prefix=oss`. The cloud repo's `pnpm-workspace.yaml` must list `oss/*` workspace paths explicitly (pnpm does not support nested workspace.yaml files). Wrangler's `-c/--config` flag enables the cloud repo to deploy using `wrangler.cloud.toml` without touching the OSS wrangler.toml.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git subtree | (built-in) | Embed public repo in cloud repo at `oss/` prefix | Built into git, no extra dependencies, works with standard git workflows |
| pnpm | 9.15.0 | Workspace management for both repos | Already in use; workspace protocol (`workspace:*`) handles cross-package resolution |
| Turborepo | latest | Build orchestration across unified workspace | Already in use; `turbo run build/test` resolves dependency graph automatically |
| wrangler | 4.x | Cloudflare Workers deployment with `--config` flag | `-c/--config` flag specifies custom config path (verified: `wrangler deploy --help` confirms `-c, --config`) |
| gh CLI | (system) | GitHub repo creation, settings configuration | `gh repo create` with `--public`/`--private` flags, `gh repo edit` for merge settings |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| esbuild | (devDep) | Bundle cloud gateway entry point | Same bundler already used in Dockerfile for self-hosted entry |
| stripe (npm) | latest | Stripe SDK for StripeBillingProvider | Cloud repo only -- not in public repo dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| git subtree | git submodule | Submodules require extra `git submodule init/update` steps; subtree is transparent to contributors who clone the cloud repo |
| git subtree | npm package publishing | Would require publishing `@feelr/*` packages to npm registry; adds complexity, versioning burden, and public dependency on npm availability |
| pnpm workspace overlay | Separate `node_modules` installs | Would duplicate dependencies and break `workspace:*` resolution between OSS and cloud packages |

**No installation needed** -- all tools are already available in the project or system.

## Architecture Patterns

### Recommended Cloud Repo Structure
```
feelr-cloud/
├── oss/                          # git subtree of progradetech/feelr
│   ├── apps/
│   │   ├── gateway/              # OSS gateway (app.ts exports Hono app)
│   │   ├── dashboard/
│   │   └── docs/
│   ├── cli/
│   ├── connectors/
│   ├── packages/
│   ├── chains/
│   ├── self-host/
│   ├── scripts/
│   ├── pnpm-workspace.yaml       # OSS workspace config (ignored by cloud pnpm)
│   ├── package.json               # OSS root package.json
│   ├── turbo.json                 # OSS turbo config
│   └── tsconfig.base.json
├── cloud/
│   ├── gateway/                   # Cloud overlay package
│   │   ├── gateway-entry.ts       # Imports OSS app, registers StripeBillingProvider
│   │   ├── wrangler.cloud.toml    # Staging + production Cloudflare config
│   │   ├── package.json           # Has stripe dependency
│   │   └── tsconfig.json          # Includes both OSS gateway and billing/stripe/
│   └── workflows/                 # Cloud-only CI/CD workflows
│       ├── gateway.yml            # Deploy cloud gateway (staging + production)
│       └── dashboard.yml          # Deploy dashboard (uses cloud secrets)
├── .github/
│   └── workflows/                 # Cloud repo CI
│       └── ci.yml                 # Runs pnpm install && pnpm build && pnpm test
├── pnpm-workspace.yaml            # Cloud root: references oss/* and cloud/*
├── package.json                   # Cloud root package.json
├── turbo.json                     # Cloud turbo config (extends or replaces OSS)
└── pnpm-lock.yaml                 # Single lockfile for entire cloud workspace
```

### Recommended Public Repo Structure
```
feelr/                             # progradetech/feelr (public, MIT)
├── apps/
│   ├── gateway/
│   │   ├── src/
│   │   │   ├── app.ts             # Hono app (default export)
│   │   │   ├── index.ts           # Cloud/dev entry point
│   │   │   ├── self-hosted-entry.ts
│   │   │   ├── billing/
│   │   │   │   ├── types.ts       # BillingPlan, PLAN_LIMITS
│   │   │   │   ├── provider.ts    # BillingProvider interface, NoopBillingProvider
│   │   │   │   ├── middleware.ts   # billingMiddleware (delegates to provider)
│   │   │   │   └── stripe/        # StripeBillingProvider (excluded from tsconfig)
│   │   │   │       ├── index.ts
│   │   │   │       ├── stripe-client.ts
│   │   │   │       └── meter.ts
│   │   │   └── ...
│   │   ├── wrangler.toml          # Dev-only config (no staging/production envs)
│   │   └── package.json           # No stripe dependency
│   ├── dashboard/
│   └── docs/
├── cli/
├── connectors/
├── packages/
├── chains/
├── self-host/
├── scripts/
├── .github/workflows/
│   ├── ci.yml                     # PR quality gates (lint, typecheck, test)
│   └── release.yml                # GoReleaser for CLI binary releases
├── LICENSE                         # MIT
├── README.md
├── CONTRIBUTING.md
├── .gitignore
├── .gitleaks.toml
├── .goreleaser.yaml
├── pnpm-workspace.yaml
├── package.json
├── turbo.json
├── tsconfig.base.json
└── pnpm-lock.yaml
```

### Pattern 1: Cloud Gateway Entry Point (gateway-entry.ts)
**What:** The cloud overlay imports the OSS Hono app, creates Cloudflare binding adapters, instantiates `StripeBillingProvider`, and injects it into the environment before passing to the app.
**When to use:** Cloud deployments where billing is enabled.
**Example:**
```typescript
// cloud/gateway/gateway-entry.ts
// Source: Based on existing apps/gateway/src/index.ts pattern
import app from '../../oss/apps/gateway/src/app'
import { handleScheduled } from '../../oss/apps/gateway/src/scheduled'
import { createCloudBindings } from '../../oss/apps/gateway/src/runtime/factory'
import { StripeBillingProvider } from '../../oss/apps/gateway/src/billing/stripe'

export { TokenCoordinator } from '../../oss/apps/gateway/src/durable-objects/token-coordinator'

export default {
  async fetch(request: Request, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    const adaptedEnv = createCloudBindings(rawEnv as never)
    // Inject StripeBillingProvider with STRIPE_SECRET_KEY from Worker secrets
    const stripeKey = (rawEnv as { STRIPE_SECRET_KEY: string }).STRIPE_SECRET_KEY
    adaptedEnv.BILLING_PROVIDER = new StripeBillingProvider(stripeKey)
    // Override FEELR_CONFIG to enable billing
    adaptedEnv.FEELR_CONFIG = {
      runtime: 'cloud',
      billing: { enabled: true },
      encryption: { enabled: true },
    }
    return app.fetch(request, adaptedEnv, ctx)
  },

  async scheduled(event: ScheduledEvent, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<void> {
    const adaptedEnv = createCloudBindings(rawEnv as never)
    return handleScheduled(event, adaptedEnv, ctx)
  },
}
```

### Pattern 2: pnpm Workspace Overlay
**What:** The cloud repo's `pnpm-workspace.yaml` references both the embedded OSS packages and cloud-specific packages.
**When to use:** Any time the cloud repo has packages that depend on OSS packages.
**Critical:** pnpm does NOT support nested `pnpm-workspace.yaml` files. The cloud root workspace must explicitly list all package paths from the embedded OSS repo.

```yaml
# feelr-cloud/pnpm-workspace.yaml
packages:
  # OSS packages (embedded via git subtree at oss/)
  - 'oss/apps/*'
  - 'oss/packages/*'
  - 'oss/connectors/*'
  # Cloud-only packages
  - 'cloud/*'
```

**Implication:** The OSS repo's own `pnpm-workspace.yaml` (at `oss/pnpm-workspace.yaml`) is ignored by pnpm when running from the cloud root. This is correct behavior -- the cloud root is the workspace root.

### Pattern 3: wrangler.cloud.toml with --config Flag
**What:** Cloud deployments use a separate wrangler config file that specifies the cloud entry point and production/staging bindings.
**When to use:** Deploying the cloud gateway overlay.
**Verified:** `wrangler deploy -c wrangler.cloud.toml --env production` (confirmed via `wrangler deploy --help`: `-c, --config Path to Wrangler configuration file`)

```toml
# cloud/gateway/wrangler.cloud.toml
name = "feelr-gateway"
main = "gateway-entry.ts"
compatibility_date = "2026-02-05"

keep_vars = true

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TokenCoordinator"]

[triggers]
crons = ["0 3 * * *"]

# Staging
[env.staging]
workers_dev = false
# ... (same bindings as current wrangler.toml staging section)

# Production
[env.production]
workers_dev = false
# ... (same bindings as current wrangler.toml production section)
```

### Pattern 4: Fresh Snapshot for Public Repo
**What:** Copy current files (minus exclusions) to a new directory, `git init`, commit, push as initial commit.
**When to use:** Creating the public repo (SPLIT-01). Phase 25 decided on fresh snapshot to avoid git history secret leakage.
**Example:**
```bash
# Create temporary staging directory
mkdir /tmp/feelr-public
# Copy public files (rsync with exclude patterns)
rsync -av --exclude='.git' \
  --exclude='.planning' \
  --exclude='feelr-strategy.md' \
  --exclude='docs/deployment/SECRETS-INVENTORY.md' \
  --exclude='docs/deployment/RUNBOOK.md' \
  --exclude='node_modules' \
  --exclude='.wrangler' \
  --exclude='.turbo' \
  --exclude='.next' \
  --exclude='out' \
  --exclude='dist' \
  --exclude='*.tsbuildinfo' \
  --exclude='.env' \
  --exclude='.dev.vars' \
  ./ /tmp/feelr-public/

# Strip production/staging envs from wrangler.toml (keep only top-level config)
# Initialize git and push
cd /tmp/feelr-public
git init -b main
git add -A
git commit -m "Initial release: Feelr v1.0 - Agent-friendly API simplification layer"
git remote add origin git@github.com:progradetech/feelr.git
git push -u origin main
```

### Pattern 5: git subtree add
**What:** Embed the public repo into the cloud repo at the `oss/` prefix.
**When to use:** Setting up the cloud repo (SPLIT-03).
**Critical:** Always use `--squash` to collapse OSS history into a single merge commit.
**Example:**
```bash
cd feelr-cloud
git remote add oss git@github.com:progradetech/feelr.git
git fetch oss
git subtree add --prefix=oss oss main --squash -m "Add OSS repo as subtree at oss/"
```

**Updating the subtree later:**
```bash
git fetch oss
git subtree pull --prefix=oss oss main --squash -m "Update OSS subtree to latest main"
```

### Anti-Patterns to Avoid
- **Using GitHub squash merge on PRs that contain subtree markers:** GitHub's squash merge converts commit message line endings to CRLF, which corrupts `git-subtree-dir` and `git-subtree-split` markers. The cloud repo MUST disable squash merge or only use regular merge/rebase merge for PRs. ([Source](https://noahtallen.com/2024/02/19/github-breaks-git-subtrees-in-the-weirdest-way/))
- **Keeping the OSS pnpm-workspace.yaml as the workspace root in cloud:** pnpm does not support nested workspaces. The cloud root must have its own `pnpm-workspace.yaml` that explicitly lists all OSS and cloud package paths.
- **Putting billing/stripe/ files in the cloud repo:** The `billing/stripe/` directory should remain in the public repo (already excluded from tsconfig). This avoids import path fragility. The cloud entry point just imports and uses it.
- **Copying the full wrangler.toml to public repo:** Strip the `[env.staging]` and `[env.production]` sections. Public repo gets a dev-only config.
- **Including deploy workflows in the public repo:** `gateway.yml`, `dashboard.yml`, `docs.yml` deploy to cloud infrastructure and reference cloud-only secrets. Only `ci.yml` and `release.yml` belong in the public repo.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Repo creation | Manual GitHub UI steps | `gh repo create` CLI | Scriptable, repeatable, configurable in one command |
| File exclusion for snapshot | Custom git filter scripts | `rsync --exclude` | Simple, well-understood, no git history manipulation needed (fresh snapshot approach) |
| Entry point composition | Copy/paste OSS index.ts and modify | Import OSS app + compose | Single source of truth for the Hono app; cloud overlay is minimal |
| Workspace dependency resolution | Manual symlinks or path aliases | pnpm `workspace:*` protocol | Handles hoisting, deduplication, and cross-package resolution automatically |
| Config file selection for deploy | Environment variables to switch configs | `wrangler deploy -c path/to/config.toml` | First-class wrangler support; clean separation |

**Key insight:** The OSS app.ts already exports the Hono app as a default export, and the billing middleware already checks `BILLING_PROVIDER` from env bindings. The cloud overlay is genuinely minimal -- it only needs to inject `StripeBillingProvider` and set `FEELR_CONFIG.billing.enabled = true`. No modifications to OSS code are required.

## Common Pitfalls

### Pitfall 1: GitHub Squash Merge Corrupts Subtree Markers
**What goes wrong:** After `git subtree add --prefix=oss --squash`, the merge commit contains `git-subtree-dir: oss` and `git-subtree-split: <sha>` markers in its commit message. If a subsequent PR is merged using GitHub's "Squash and Merge" button, the commit message gets CRLF line endings, which breaks `git subtree pull` -- it can no longer find the previous split point.
**Why it happens:** GitHub's web UI always adds CRLF to squash merge commit messages, regardless of the original commit's line endings.
**How to avoid:** Disable squash merge on the cloud repo: `gh repo edit progradetech/feelr-cloud --enable-squash-merge=false`. Use regular merge or rebase merge instead.
**Warning signs:** `git subtree pull --prefix=oss` fails with "can't squash-merge: 'oss' was never added" or "fatal: ambiguous argument" errors.

### Pitfall 2: pnpm Lockfile Conflict with Nested Workspace
**What goes wrong:** The OSS repo has its own `pnpm-lock.yaml` at `oss/pnpm-lock.yaml`. When running `pnpm install` from the cloud root, pnpm uses the cloud root's lockfile. The nested lockfile is ignored but can cause confusion or CI cache misses.
**Why it happens:** pnpm finds the nearest `pnpm-workspace.yaml` going up from the working directory and uses that as the workspace root. The nested one is invisible.
**How to avoid:** Add `oss/pnpm-lock.yaml` to the cloud repo's `.gitignore` so it does not get committed from the subtree pull. Or accept it exists and document that only the root lockfile matters.
**Warning signs:** CI cache misses despite no dependency changes; `pnpm install` taking unexpectedly long in the cloud repo.

### Pitfall 3: wrangler.toml Production Secrets in Public Repo
**What goes wrong:** The current `wrangler.toml` has staging and production sections with KV namespace IDs, D1 database IDs, custom domain routes, and rate limit configurations. While Cloudflare resource IDs are safe to expose, the production routing configuration and rate limit values give operational intelligence.
**Why it happens:** Developers copy the wrangler.toml as-is to the public repo because "it works" and KV/D1 IDs are technically safe.
**How to avoid:** Strip the public wrangler.toml to top-level config only (name, main, compatibility_date, migrations). No `[env.staging]` or `[env.production]` sections. Add a comment pointing to the self-host docs for local development.
**Warning signs:** Public repo wrangler.toml containing `api.feelr.dev` domain routes or actual KV/D1 namespace IDs.

### Pitfall 4: GoReleaser release.github Pointing to Wrong Repo
**What goes wrong:** The current `.goreleaser.yaml` has `release.github.owner: progradetech` and `release.github.name: homebrew-feelr`. This means GitHub Releases are created on the Homebrew tap repo, not the main repo. When the public repo is created, releases should be published to `progradetech/feelr`.
**Why it happens:** The GoReleaser config was set up before the repo split was planned; releases were published to the tap repo for convenience.
**How to avoid:** Update `.goreleaser.yaml` in the public repo to `release.github.name: feelr` (keeping `owner: progradetech`). The `brews` section should continue pointing to `homebrew-feelr` for the Homebrew formula.
**Warning signs:** GitHub Releases appearing on `homebrew-feelr` instead of `feelr` after the split.

### Pitfall 5: billing/stripe/ Import Path Breakage in Cloud Entry
**What goes wrong:** The cloud `gateway-entry.ts` imports from `../../oss/apps/gateway/src/billing/stripe`. If the TypeScript path resolution or esbuild bundling does not resolve these deep relative imports correctly, the build fails.
**Why it happens:** The cloud entry point lives at `cloud/gateway/gateway-entry.ts` while the OSS code lives at `oss/apps/gateway/src/`. The relative path traversal is deep.
**How to avoid:** Use TypeScript `paths` mapping in the cloud tsconfig to create clean aliases like `@feelr/gateway/*` pointing to `../../oss/apps/gateway/src/*`. Or use pnpm workspace protocol since the OSS packages are part of the workspace.
**Warning signs:** TypeScript `TS2307: Cannot find module` errors or esbuild `Could not resolve` errors during cloud build.

### Pitfall 6: Circular Package Name Conflict
**What goes wrong:** Both the OSS root `package.json` (name: `feelr`) and the cloud root `package.json` might use the same name. pnpm workspace packages must have unique names.
**Why it happens:** Both repos are "the feelr project" from their respective viewpoints.
**How to avoid:** Use `name: "feelr"` for the OSS root and `name: "feelr-cloud"` for the cloud root. Internal packages like `@feelr/gateway` keep their names since they exist in the OSS tree and are referenced by the cloud workspace.
**Warning signs:** pnpm install errors about duplicate package names in the workspace.

### Pitfall 7: check-bindings.mjs Fails Without Production Env
**What goes wrong:** The CI check script `scripts/check-bindings.mjs` validates that staging and production KV/D1 IDs are different. In the public repo, the wrangler.toml will not have staging/production sections, so this script will fail.
**Why it happens:** The script was written for the private monorepo where both envs exist.
**How to avoid:** Either remove `check-bindings.mjs` from the public repo CI or make it gracefully skip when environment sections are missing. The cloud repo should have its own validation.
**Warning signs:** CI fails on the public repo immediately after the split.

## Code Examples

### Creating the Public Repository
```bash
# Source: gh CLI docs + project decisions
gh repo create progradetech/feelr \
  --public \
  --license MIT \
  --description "Agent-friendly API simplification layer"

# Disable squash merge is NOT needed on public repo
# (squash merge issue only affects repos WITH subtrees)
```

### Creating the Cloud Repository
```bash
# Source: gh CLI docs
gh repo create progradetech/feelr-cloud \
  --private \
  --description "Feelr cloud billing overlay"

# CRITICAL: Disable squash merge to protect subtree markers
gh repo edit progradetech/feelr-cloud --enable-squash-merge=false
```

### Setting Up git subtree in Cloud Repo
```bash
# Source: git-subtree man page
cd feelr-cloud
git remote add oss git@github.com:progradetech/feelr.git
git fetch oss
git subtree add --prefix=oss oss main --squash \
  -m "Add progradetech/feelr as OSS subtree at oss/"

# Verify subtree markers exist
git log --oneline -1
# Should show: Add progradetech/feelr as OSS subtree at oss/
git log --format='%B' -1 | grep 'git-subtree-dir'
# Should show: git-subtree-dir: oss
```

### Cloud Workspace pnpm-workspace.yaml
```yaml
# Source: pnpm docs + codebase analysis
packages:
  # OSS packages (via git subtree at oss/)
  - 'oss/apps/*'
  - 'oss/packages/*'
  - 'oss/connectors/*'
  # Cloud-specific packages
  - 'cloud/*'
```

### Cloud Root package.json
```json
{
  "name": "feelr-cloud",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "deploy:staging": "cd cloud/gateway && npx wrangler deploy -c wrangler.cloud.toml --env staging",
    "deploy:production": "cd cloud/gateway && npx wrangler deploy -c wrangler.cloud.toml --env production"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

### Stripping wrangler.toml for Public Repo
```toml
# Public repo: apps/gateway/wrangler.toml (dev-only)
# Production/staging config lives in the cloud repo.
# For self-hosted deployment, see self-host/README.md.

name = "feelr-gateway"
main = "src/index.ts"
compatibility_date = "2026-02-05"

keep_vars = true

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TokenCoordinator"]

[triggers]
crons = ["0 3 * * *"]

# Local development: use `wrangler dev` with .dev.vars for secrets
```

### Public Repo .goreleaser.yaml Fix
```yaml
# release section must point to the public repo (not homebrew-feelr)
release:
  github:
    owner: progradetech
    name: feelr      # Changed from homebrew-feelr

# brews section still points to the tap repo
brews:
  - name: feelr
    repository:
      owner: progradetech
      name: homebrew-feelr
      token: "{{ .Env.GITHUB_TOKEN }}"
```

### Workflow Classification for Public vs Cloud
```
PUBLIC REPO (.github/workflows/):
  ci.yml       - PR quality gates (lint, typecheck, test)
  release.yml  - GoReleaser CLI binary releases on tag push

CLOUD REPO (.github/workflows/):
  ci.yml       - Cloud repo CI (pnpm install && pnpm build && pnpm test)
  gateway.yml  - Cloud gateway deploy (staging on main push, production on tag)
  dashboard.yml - Dashboard deploy to Azure SWA (staging + production)
  docs.yml     - Docs deploy to Azure SWA (staging + production)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| git submodule for multi-repo | git subtree (or monorepo) | Long-standing | Subtree is simpler for contributors; no `submodule init` step |
| Separate npm packages for OSS/cloud | Workspace overlay with git subtree | Emerging pattern | Single `pnpm install` resolves everything; no publishing step |
| `.env`-based config switching | `wrangler deploy -c config.toml` | Wrangler v3+ | First-class support for multiple config files |
| pnpm nested workspace support | Not supported (open issue #10302) | Current | Must list all paths explicitly in the cloud root workspace.yaml |

**Deprecated/outdated:**
- `git subtree` does not have a `--rejoin` option in all git versions; the `--squash` approach with explicit markers is the stable path
- GoReleaser `brews` key is deprecated since v2.10 in favor of `homebrew_casks`, but still functional

## Open Questions

1. **Should billing/stripe/ remain in the public repo or move to cloud?**
   - What we know: Phase 26 already excluded `billing/stripe/` from the gateway tsconfig. The files are present in the public repo but never compiled or used without explicit cloud entry point setup. The `stripe` npm package is NOT in gateway's package.json.
   - What's unclear: Whether having unused Stripe integration code in the public repo is confusing to contributors, or if it serves as documentation/reference.
   - Recommendation: Keep it in the public repo. Moving it to cloud creates import path complexity and means the cloud overlay must patch file locations. Keeping it is simpler and the tsconfig exclude means it has zero impact on public builds.

2. **Should the public repo's CI deploy a staging preview?**
   - What we know: Current `ci.yml` has a `gateway-preview` job that deploys to staging on PRs. This uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
   - What's unclear: Whether the public repo should have its own Cloudflare staging environment or only run lint/typecheck/test.
   - Recommendation: Remove the `gateway-preview` job from the public repo CI. Public repo CI runs lint, typecheck, and test only. Cloud-specific deployments happen from the cloud repo.

3. **How should the cloud repo's CI handle the subtree update workflow?**
   - What we know: `git subtree pull --prefix=oss` updates the embedded OSS code. This needs to happen when the public repo changes.
   - What's unclear: Whether to automate this (GitHub Action on public repo push triggers cloud repo update) or make it manual.
   - Recommendation: Defer automation to Phase 28 (CI/CD Migration). For Phase 27, document the manual `git subtree pull` command.

4. **Should the docs/deployment/ directory be completely removed or only specific files?**
   - What we know: Phase 25 classified `SECRETS-INVENTORY.md` and `RUNBOOK.md` as EXCLUDE. The `docs/deployment/` directory only contains these two files.
   - What's unclear: Whether the directory should be completely removed from the public repo or kept empty for future contributor deployment docs.
   - Recommendation: Remove the entire `docs/deployment/` directory from the public snapshot. If deployment docs are needed for contributors, create them in Phase 29 (Community Contribution Infrastructure).

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `apps/gateway/src/index.ts`, `apps/gateway/src/app.ts`, `apps/gateway/src/billing/`, `pnpm-workspace.yaml`, `turbo.json`, all workflow files, `wrangler.toml`, `.goreleaser.yaml`
- Phase 25 research and verification: `.planning/phases/25-pre-split-audit-cleanup/25-RESEARCH.md`, `docs/deployment/SECRETS-INVENTORY.md` Section 5
- Phase 26 verification: `.planning/phases/26-billing-interface-extraction/26-VERIFICATION.md` -- confirmed BillingProvider interface, NoopBillingProvider, StripeBillingProvider isolation, billing/stripe/ tsconfig exclude
- `wrangler deploy --help` output: Confirmed `-c, --config Path to Wrangler configuration file` flag exists
- [Cloudflare Wrangler Configuration docs](https://developers.cloudflare.com/workers/wrangler/configuration/) -- `main` field specifies entry point
- [gh repo create manual](https://cli.github.com/manual/gh_repo_create) -- `--public`, `--private`, `--license` flags
- [gh repo edit manual](https://cli.github.com/manual/gh_repo_edit) -- `--enable-squash-merge` flag
- [GoReleaser Release customization](https://goreleaser.com/customization/release/) -- `release.github.name` vs `brews.repository.name`

### Secondary (MEDIUM confidence)
- [GitHub Breaks Git Subtrees (Noah Allen, 2024)](https://noahtallen.com/2024/02/19/github-breaks-git-subtrees-in-the-weirdest-way/) -- CRLF corruption of subtree markers on squash merge
- [Atlassian git subtree tutorial](https://www.atlassian.com/git/tutorials/git-subtree) -- Subtree best practices and `--squash` behavior
- [pnpm extending child workspaces issue #10302](https://github.com/pnpm/pnpm/issues/10302) -- Confirms nested workspace.yaml not supported
- [Git Subtree man page (Arch)](https://man.archlinux.org/man/git-subtree.1) -- `git-subtree-dir` and `git-subtree-split` marker format
- [The Multi-Monorepo pattern](https://vjpr.medium.com/the-multi-monorepo-209041932fbf) -- Top-level folder separation by access rights
- [Turborepo structuring docs](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) -- Workspace package layout patterns
- [pnpm workspace docs](https://pnpm.io/workspaces) -- Single lockfile behavior, workspace protocol

### Tertiary (LOW confidence)
- [Mastering Git Subtrees (Porteneuve)](https://medium.com/@porteneuve/mastering-git-subtrees-943d29a798ec) -- All-or-nothing push limitation
- [Git Subtrees CraftQuest tutorial](https://craftquest.io/guides/git/git-workflow-tools/git-subtrees) -- General subtree workflow patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools already in use or verified via help output; no new dependencies needed
- Architecture: HIGH -- Cloud overlay pattern directly follows existing entry point composition (index.ts vs self-hosted-entry.ts); billing provider injection is the exact pattern described in Phase 26's StripeBillingProvider JSDoc
- Pitfalls: HIGH -- GitHub squash merge issue verified via multiple sources; pnpm nested workspace limitation confirmed via open GitHub issue; wrangler.toml stripping validated by Phase 25 file classification

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (stable domain -- git subtree, pnpm workspace, and wrangler CLI are mature tools with slow evolution)
