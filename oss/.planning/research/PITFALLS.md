# Domain Pitfalls: Open-Core Repo Restructuring

**Domain:** Monorepo split into public open-source + private cloud overlay
**Researched:** 2026-02-13
**Confidence:** HIGH (verified with official docs, real-world incident reports, and codebase analysis)

---

## Critical Pitfalls

Mistakes that cause security incidents, data breaches, permanent history corruption, or require full repository recreation.

---

### Pitfall 1: Secrets Leaked in Git History When Making Repo Public

**What goes wrong:** The current private repo contains 363 commits of history. While actual secret values (Stripe keys, Cloudflare API tokens) are stored in GitHub Actions secrets and Cloudflare Worker secrets (not in source files), the git history may contain: (a) the `self-host/.env` file with `FEELR_ADMIN_TOKEN=test123` and `FEELR_ENCRYPTION_KEY=test456` that is currently tracked, (b) resource IDs in `wrangler.toml` (KV namespace IDs, D1 database IDs) -- these are safe to expose per Cloudflare's documentation, (c) planning documents that reference secret names or infrastructure details, and (d) commit messages or diffs that may reference tokens during debugging.

**Why it happens:** Developers assume "I never committed a real API key" but forget that `.env` files with test values, config files with resource identifiers, and planning docs with secret inventory lists are all in history. The `self-host/.env` file is currently **tracked in git** (it has test values but is still a tracked `.env` file). Even if current HEAD is clean, `git log -p` reveals everything ever committed.

**Consequences:** Once the repo is public, any secret in any historical commit is permanently exposed. GitHub scanning will flag it. Automated scrapers harvest credentials within minutes of a repo going public. Even "test" values train attackers on your secret naming patterns and infrastructure topology.

**Prevention:**
1. Run `git log --all -p -- '*.env*' '*.secret*' '*.key*'` on the current repo to audit what test secrets exist in history
2. Decide on approach: **fresh history** (recommended for a 363-commit repo) or **git-filter-repo rewrite** (preserves history but risky)
3. For fresh history: create a new repo from a clean snapshot of the current HEAD, losing commit history but guaranteeing no secret leakage
4. For history preservation: use `git-filter-repo` with `--path` to include only the directories destined for public, combined with `--blob-callback` to scrub any remaining sensitive patterns
5. Before making public, run [Gitleaks](https://github.com/gitleaks/gitleaks) or [truffleHog](https://github.com/trufflesecurity/trufflehog) against the cleaned repo
6. Revoke and rotate ALL secrets referenced anywhere in the private repo's history before going public, even "test" values

**Detection:** Run secret scanning tools on the repo before flipping it to public. GitHub's push protection will also flag known secret patterns, but only for specific provider formats -- custom tokens like `ADMIN_TOKEN=test123` will not be caught.

**Feelr-specific notes:** The `self-host/.env` is tracked in git with test credentials. The `wrangler.toml` contains KV namespace IDs (`be026de3...`, `69c0aa37...`) and D1 database IDs (`7a385374...`, `3395e4fc...`) -- Cloudflare confirms these are safe to expose publicly as they are random UUIDs bound to your account and cannot be used without API authentication. The `.planning/` directory contains a `SECRETS-INVENTORY.md` and deployment runbooks that may reference secret names.

---

### Pitfall 2: Billing/Cloud Code Accidentally Included in Public Repo

**What goes wrong:** The open-core split requires extracting `apps/gateway/src/billing/` (stripe-client.ts, meter.ts, plan-enforcer.ts, types.ts), cloud-specific deployment configs (`wrangler.toml` with production/staging environments, `.github/workflows/gateway.yml` with Cloudflare deploy steps), and possibly cloud-specific entry points (`apps/gateway/src/index.ts`) into the private overlay. A single missed file or import means proprietary billing logic ships in the public repo.

**Why it happens:** The billing code is deeply integrated into the gateway middleware chain. `apps/gateway/src/app.ts` directly imports `planEnforcer` from `./billing/plan-enforcer`. The `createStripeClientFromEnv` function is called from plan-enforcer. The `STRIPE_SECRET_KEY` binding appears in the AppEnv type. Simply removing the `billing/` directory breaks the build. Developers add the billing directory to `.gitignore` or a filter list but forget about: (a) the import statement in `app.ts`, (b) the `STRIPE_SECRET_KEY` field in the types, (c) the `stripe` dependency in `package.json`, (d) the `billing.enabled` config checks scattered throughout middleware.

**Consequences:** Competitors see your exact billing implementation, plan tiers, pricing structure, and Stripe integration details. Not a security breach per se (no keys), but a significant business intelligence leak. Worse: if someone forks and deploys with their own Stripe keys, they have a turnkey billing system built on your work -- undermining the open-core value proposition.

**Prevention:**
1. **Compile a complete dependency graph** of billing code before extraction. Start from `app.ts` line 9 (`import { planEnforcer } from './billing/plan-enforcer'`) and trace every import
2. **Create a billing interface/no-op stub** in the public repo that the private overlay replaces. The public `plan-enforcer.ts` exports a passthrough middleware that always calls `next()`. The private overlay provides the real Stripe-backed implementation
3. **Use a CI check in the public repo** that greps for forbidden patterns: `stripe`, `STRIPE_SECRET_KEY`, `billing`, `meter`, `CustomerBilling` -- fail the build if any appear outside of documented no-op stubs
4. **Add CODEOWNERS** to the private repo's overlay paths requiring review from a specific maintainer for any changes touching the billing boundary

**Detection:** Add a `scripts/check-public-boundary.mjs` script (modeled on the existing `scripts/check-bindings.mjs`) that validates no private code leaked into the public paths. Run it in the public repo's CI.

---

### Pitfall 3: Git Subtree Merge Conflicts Cascade Into Unmaintainable State

**What goes wrong:** Git subtree is chosen for syncing the public repo content into the private overlay repo. Over time, merge conflicts accumulate because: (a) the public repo receives community PRs that touch shared boundaries, (b) the private repo modifies files near the overlay seam, and (c) git subtree's conflict resolution is all-or-nothing -- you cannot selectively backport changes.

**Why it happens:** Git subtree merge conflicts are particularly nasty because the subtree rewrite creates synthetic commits with altered paths. When the same file is modified in both repos (even in non-overlapping regions), git's merge algorithm sees divergent histories with no common ancestor for the specific path. The `--squash` flag makes this worse by destroying the fine-grained history that would help the merge algorithm resolve conflicts.

Additionally, GitHub's squash merge breaks git subtree entirely. As documented by Noah Allen (2024), GitHub's web UI adds CRLF line endings to squash merge commit messages, which corrupts the commit message markers that `git subtree` uses to identify subtree boundaries. Any PR merged via GitHub's "Squash and merge" button into the public repo will cause `git subtree pull` to fail silently or produce phantom conflicts.

**Consequences:** The private overlay repo's subtree pull fails. Manual conflict resolution becomes a recurring weekly chore. Eventually someone force-pushes or recreates the subtree, losing the merge checkpoint. This resets the clock and the next `git subtree split` must traverse the entire history (slow for large repos).

**Prevention:**
1. **Never use GitHub's "Squash and merge" on the public repo** if using git subtree. Configure the public repo to only allow "Create a merge commit" or "Rebase and merge"
2. **Always use `--rejoin`** with `git subtree split` to create checkpoints that prevent full-history traversal on subsequent splits
3. **Never mix `--squash` and `--rejoin`** -- the git subtree documentation explicitly warns these are incompatible: "If you do all your merges with --squash, don't use --rejoin when you split"
4. **Keep the overlay seam narrow** -- the fewer files modified in both repos, the fewer conflicts. The billing code should live entirely in the private repo with only a no-op interface in the public repo
5. **Automate subtree sync via GitHub Actions** (like Apollo GraphQL does) -- a workflow on the public repo's main branch triggers `git subtree split` + push to the private repo, catching conflicts in CI rather than during manual pulls

**Detection:** If `git subtree pull` takes progressively longer with each sync, the rejoin checkpoints are missing or corrupted. If conflicts appear in files that weren't touched in either repo, the squash merge corruption has occurred.

---

### Pitfall 4: CI/CD Breaks During Transition Period

**What goes wrong:** The current repo has 5 GitHub Actions workflows (ci.yml, gateway.yml, dashboard.yml, docs.yml, release.yml) that all assume a single monorepo. During the transition to two repos, there is an unavoidable period where: (a) the public repo needs CI but doesn't have deployment secrets yet, (b) the private repo needs to build the full monorepo (public code + overlay) but its CI doesn't know how to fetch the public repo, (c) deployment workflows reference secrets (`CLOUDFLARE_API_TOKEN`, `SWA_DASHBOARD_DEPLOYMENT_TOKEN`, etc.) that must NOT be in the public repo, and (d) the Go CLI release workflow (`release.yml`) uses `HOMEBREW_TAP_GITHUB_TOKEN` for cross-repo publishing.

**Why it happens:** CI/CD is the last thing people think about during a repo split. The focus is on code organization and git history, not on "which repo runs which workflow." The existing `gateway.yml` workflow deploys to Cloudflare on tag push -- if this workflow exists in the public repo, anyone who forks and tags will attempt deployment (and fail, but it is still noisy). If the workflow is only in the private repo, public PRs have no CI coverage.

**Consequences:** A gap in CI coverage during transition means untested code merges to the public repo. Deployment secrets accidentally configured in the public repo are a security incident. Missing CI on the public repo discourages community contributions (PRs cannot be validated).

**Prevention:**
1. **Design the CI split before the code split.** The public repo gets: lint, typecheck, test (no deploy secrets needed). The private repo gets: all of the above PLUS deployment workflows (gateway.yml, dashboard.yml, docs.yml)
2. **Create separate workflow files** for public CI (test-only) vs. private CI (test + deploy). Do not try to share workflows between repos
3. **The release workflow** stays in the private repo only -- GoReleaser needs `HOMEBREW_TAP_GITHUB_TOKEN` and produces binaries from the full codebase
4. **Use `workflow_dispatch`** in the private repo to trigger deployment after the public repo's CI passes, creating a fan-in pattern
5. **Test the entire CI pipeline on a branch** before the actual split. Create a test org with two repos and validate the full flow end-to-end

**Detection:** If the public repo's CI config references any `secrets.*` that are deployment-related (not just `GITHUB_TOKEN`), the split was done wrong. If PRs to the public repo show "Skipped" or "No status checks" on GitHub, the CI is misconfigured.

**Feelr-specific notes:** The current `ci.yml` runs `scripts/check-bindings.mjs` which reads `wrangler.toml` -- this is fine for the public repo. But `gateway-preview` in `ci.yml` deploys to staging using `CLOUDFLARE_API_TOKEN` -- this entire job must be removed from the public repo's CI. The Turborepo cache key uses `${{ github.sha }}` which will differ between repos, so cache sharing is impossible (this is fine, just be aware of it).

---

## Moderate Pitfalls

Mistakes that cause significant rework, multi-day delays, or ongoing maintenance burden.

---

### Pitfall 5: Broken Imports and Paths After Restructuring

**What goes wrong:** The monorepo uses `workspace:*` references throughout its `package.json` files. The pnpm workspace definition includes `apps/*`, `packages/*`, and `connectors/*`. After the split, the public repo contains these workspace packages, but the private overlay adds cloud-specific code that imports from them. Import paths break because: (a) the private overlay's `billing/plan-enforcer.ts` imports from `../lib/types` which is now in the public repo, (b) TypeScript path aliases in `tsconfig.base.json` reference paths relative to the monorepo root, (c) Turborepo's `turbo.json` task graph assumes all packages are in one repo.

**Why it happens:** pnpm workspaces resolve `workspace:*` at install time based on what exists in the filesystem. If the private repo uses `git subtree` to embed the public repo, the workspace root must be at the subtree-merged level, not at either repo's individual root. The `pnpm-workspace.yaml` must account for the subtree prefix.

**Prevention:**
1. **Define the overlay pattern upfront**: the private repo should be a thin overlay that extends the public monorepo, not a parallel monorepo. The private repo pulls in the public repo as a subtree at the root, then adds `cloud/` directory with cloud-specific packages
2. **The private repo's `pnpm-workspace.yaml`** should include both the public paths (via subtree) and the private paths: `apps/*`, `packages/*`, `connectors/*`, `cloud/*`
3. **Test `pnpm install` and `turbo build`** in the private repo after every subtree sync. Make this a CI step
4. **Avoid relative imports that cross the public/private boundary.** The billing code should import types from a shared package (`@feelr/types`) rather than using `../lib/types` relative paths

**Detection:** `pnpm install` fails with "workspace package not found." `tsc` fails with "Cannot find module." `turbo build` fails with "No workspace found for package."

---

### Pitfall 6: The `self-host/.env` File Is Currently Tracked in Git

**What goes wrong:** The file `self-host/.env` contains `FEELR_ADMIN_TOKEN=test123` and `FEELR_ENCRYPTION_KEY=test456`. It is currently tracked in git (not in `.gitignore`). While `.gitignore` covers `.env` and `.env.*` at the root level, the `self-host/.env` pattern is not excluded. When the repo goes public, this file -- and its entire history -- becomes visible.

**Why it happens:** The `.gitignore` at the repo root uses `.env` which matches files named `.env` in the root directory. Git's `.gitignore` does NOT match `self-host/.env` with a root-level `.env` entry unless the pattern is `**/.env` or `self-host/.env` is explicitly listed. The file was committed during self-hosting development and never removed from tracking.

**Consequences:** Test credentials exposed publicly. While they are test values, they reveal: (a) the environment variable naming convention, (b) that the admin token and encryption key are simple strings (not JWTs or structured tokens), and (c) the fact that `self-host/.env` is used for local configuration. More importantly, if anyone ever pasted a real secret into this file during local testing and committed it, that value is in history forever.

**Prevention:**
1. **Immediately** run `git rm --cached self-host/.env` and add `self-host/.env` to `.gitignore`
2. Update `.gitignore` to use `**/.env` pattern to catch ALL `.env` files in all subdirectories
3. Replace `self-host/.env` with `self-host/env.template` (which already exists) as the committed reference
4. Run `git log --all -p -- 'self-host/.env'` to verify no real secrets were ever committed to this file
5. If real secrets were ever in this file's history, the entire git history must be rewritten with `git-filter-repo` before going public

**Detection:** `git ls-files | grep '\.env'` should return zero results after the fix. The existing `env.template` already serves as documentation.

---

### Pitfall 7: Community Contribution Friction From Two-Repo Architecture

**What goes wrong:** A contributor wants to fix a bug in the gateway's connector dispatch logic. They fork the public repo, make the fix, open a PR. But the fix touches code near the billing boundary, and the maintainer realizes the private overlay's plan-enforcer needs a corresponding update. The contributor cannot test the full integration because they don't have access to the private repo. The PR sits for weeks while the maintainer coordinates the private-side changes.

**Why it happens:** Open-core architectures inherently create two classes of contributors: those with access to the full system and those without. The more deeply integrated the private overlay is with the public code, the more frequently this friction appears. The current Feelr architecture has billing middleware injected directly into the Hono middleware chain (`app.ts` line 58: `app.use('/v1/*', planEnforcer())`), making it impossible to test the full request flow without the billing stub or real implementation.

**Consequences:** Contributors abandon PRs. The project develops a reputation for being "open-source-ish" but not truly community-friendly. Core contributors burn out from context-switching between repos. The public repo's test suite cannot exercise the full middleware chain.

**Prevention:**
1. **Design the public repo to be fully functional standalone.** The self-hosted entry point (`self-hosted-entry.ts`) already demonstrates this -- billing is disabled, and the gateway works. Make the public repo's default configuration match this behavior
2. **The public repo's test suite must pass without any private code.** The billing no-op stub must be the default, not a special mode
3. **Create clear `CONTRIBUTING.md` documentation** that explains: "Changes to gateway middleware should not affect billing. If your change requires billing-side updates, note this in the PR and maintainers will handle the private-side changes"
4. **Keep the private overlay surface area minimal.** Only billing-specific files (4 files today) and deployment configs should be private. Everything else -- connectors, CLI, SDK, self-hosting, docs -- stays fully public and testable
5. **Avoid CLAs** (Contributor License Agreements). They add friction that kills contributions for minimal legal benefit when the core is MIT-licensed. If you need CLA-like protections later, use the DCO (Developer Certificate of Origin) sign-off model instead

**Detection:** Track the ratio of external PRs opened vs. merged. If less than 50% of opened PRs get merged, contribution friction is too high. Track time-to-merge for external PRs -- if it exceeds 7 days average, the two-repo architecture is creating bottlenecks.

---

### Pitfall 8: Wrangler.toml With Cloud-Specific Bindings in Public Repo

**What goes wrong:** The current `wrangler.toml` contains staging and production environments with real Cloudflare resource IDs (KV namespace IDs, D1 database IDs, custom domain routes). While these IDs are safe to expose publicly (confirmed by Cloudflare), the production configuration including custom domains (`api.feelr.dev`, `staging-api.feelr.dev`), environment-specific rate limit configs, and Workers Dev settings should not be in the public repo because: (a) it confuses contributors who might try to deploy using this config, (b) it couples the public project to Feelr's specific Cloudflare account, and (c) self-hosted users don't need or want cloud deployment configuration.

**Why it happens:** `wrangler.toml` serves dual purposes: it is both the development configuration (needed for `wrangler dev`) and the deployment configuration (used by `wrangler deploy`). These two purposes need to be split across the two repos.

**Prevention:**
1. **Public repo `wrangler.toml`**: minimal config with `name`, `main`, `compatibility_date`, and DO migrations. NO environment sections, NO KV/D1 IDs, NO custom domains. Include a comment: "Cloud deployment config is managed separately"
2. **Private overlay `wrangler.toml`**: full config with staging/production environments, resource IDs, custom domains, rate limit bindings. This file overrides or extends the public one during deployment
3. **Create a `wrangler.toml.example`** in the public repo that shows the structure of environment-specific configuration without real values, so self-hosters can create their own
4. The existing `scripts/check-bindings.mjs` stays in the public repo but should be updated to validate the overlay's `wrangler.toml` instead (or run in the private repo's CI)

**Detection:** If `wrangler.toml` in the public repo contains any `env.production` or `env.staging` sections with real resource IDs, it needs extraction.

---

### Pitfall 9: License Mismatch Between Public and Private Repos

**What goes wrong:** The current repo uses MIT license. The public repo should remain MIT for maximum adoption. But the private overlay (billing, cloud deployment) needs proprietary or restrictive licensing. If the private repo doesn't have its own license, or if it inadvertently includes MIT-licensed code from the public repo in a way that creates a derivative work, the licensing becomes ambiguous. Contributors to the public repo may also be confused about whether their MIT-licensed contributions can end up in the private commercial product.

**Why it happens:** MIT license is maximally permissive -- it explicitly allows commercial use, modification, and sublicensing. This means anyone can take the public repo, add their own billing, and compete with you. This is by design for open-core (the "open" part should be freely usable), but the **private overlay's license** must be clearly distinct. If the private repo contains files that are modifications of MIT-licensed public files (e.g., `app.ts` with billing middleware injected), there is a question about whether the modification is a derivative work under MIT or a new proprietary work.

**Prevention:**
1. **Public repo**: MIT license (keep current LICENSE file as-is)
2. **Private repo**: Add a clear `LICENSE` stating the overlay is proprietary / all rights reserved. Include a header in each private-only file: `// Copyright (c) 2026 Feelr. All rights reserved. Not open source.`
3. **The private repo should NOT modify public files.** It should only ADD new files (billing implementation) and EXTEND configuration (deployment configs). If the overlay needs to modify `app.ts` to inject billing middleware, do this via a build step or runtime plugin, not by forking the file
4. **Add a "Licensing" section to CONTRIBUTING.md** in the public repo explaining: "This project is MIT licensed. Contributions are accepted under MIT. A proprietary cloud service exists but does not affect the open-source project"

**Detection:** If any file in the private repo has the same path as a file in the public repo AND is a modified version of it, the licensing is ambiguous. Every private file should either be in a unique directory (`cloud/`) or have a clear proprietary header.

---

## Minor Pitfalls

Issues that cause hours of debugging or minor inconvenience but are easily fixed.

---

### Pitfall 10: Git Subtree Split Performance Degrades Over Time

**What goes wrong:** `git subtree split` must traverse the entire commit history to identify commits that touch the subtree path. For Feelr's 363 commits, this is fast (seconds). But as the public repo grows and accumulates thousands of commits from community contributions, each `git subtree pull` in the private repo becomes progressively slower. Without `--rejoin` checkpoints, a repo with 5,000+ commits can take 10+ minutes per split.

**Prevention:**
1. Always use `git subtree split --rejoin` to create checkpoint commits that limit the traversal window
2. Use the same `--annotate` value on every split (or don't use it at all) -- changing annotation breaks checkpoint matching
3. Consider automating subtree sync to run on every merge to main (GitHub Actions), so the checkpoint is always recent and splits are fast
4. If performance becomes unacceptable, consider switching to a `git filter-repo`-based workflow or a simple file-copy CI sync instead of git subtree

**Detection:** Time your `git subtree split` commands. If they take more than 30 seconds, checkpoints are missing or stale.

---

### Pitfall 11: GoReleaser Config References Private Repo Paths

**What goes wrong:** The current GoReleaser configuration (referenced in `release.yml`) builds the Go CLI from `cli/` directory and publishes to the Homebrew tap at `andrewprograde/homebrew-feelr`. If the public repo contains the GoReleaser config but the release workflow runs in the private repo, the `.goreleaser.yml` paths may reference directories that exist in the public repo's layout but not in the private repo's overlay layout (or vice versa).

**Prevention:**
1. GoReleaser config stays in the public repo (the CLI is open source)
2. The release workflow stays in the private repo (it needs `HOMEBREW_TAP_GITHUB_TOKEN`)
3. The private repo's release workflow checks out the public repo's code (via subtree), then runs GoReleaser against it
4. Test the release workflow with `goreleaser check` and `goreleaser build --snapshot` in CI before actual releases

**Detection:** `goreleaser check` fails, or `goreleaser build --snapshot` produces empty/wrong binaries.

---

### Pitfall 12: `.planning/` Directory Exposes Internal Strategy in Public Repo

**What goes wrong:** The `.planning/` directory contains 24 phases of development plans, research documents, milestone audits, architecture decisions, and a `SECRETS-INVENTORY.md`. Making this public reveals: roadmap details, internal decision rationale, infrastructure topology, and security posture documentation.

**Prevention:**
1. **Decide explicitly**: is `.planning/` public or private? For an open-source project, transparent planning can build community trust. But `SECRETS-INVENTORY.md` and deployment runbooks should never be public
2. **Recommended approach**: Keep `.planning/` in the public repo (transparency is good) but move sensitive files to the private repo: `docs/deployment/SECRETS-INVENTORY.md`, `docs/deployment/RUNBOOK.md`, and any files that reference specific secret values or infrastructure credentials
3. **Audit every file** in `.planning/` before the repo goes public. Grep for: secret names, API keys, account IDs, internal URLs, IP addresses

**Detection:** Search for patterns like `sk_`, `token`, `secret`, `password`, `credential` in `.planning/` files before going public.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| History cleanup | Secrets in git history (#1) | CRITICAL | Run git-filter-repo or start fresh; scan with Gitleaks before going public |
| Code extraction | Billing code in public repo (#2) | CRITICAL | Build dependency graph of billing imports; create no-op stubs; CI boundary check |
| Subtree setup | Squash merge breaks subtree (#3) | CRITICAL | Disable squash merge on public repo; always use `--rejoin`; automate sync |
| CI/CD migration | Deployment secrets in public CI (#4) | CRITICAL | Design CI split before code split; separate test-only vs. deploy workflows |
| Path restructuring | Broken imports after split (#5) | MODERATE | Test pnpm install + turbo build in overlay repo; avoid cross-boundary relative imports |
| Pre-public audit | Tracked .env file (#6) | MODERATE | `git rm --cached self-host/.env`; update .gitignore to `**/.env` |
| Community setup | Contributor friction (#7) | MODERATE | Public repo fully functional standalone; clear CONTRIBUTING.md; no CLA |
| Config extraction | wrangler.toml dual purpose (#8) | MODERATE | Split into minimal public + full private configs |
| Licensing | License ambiguity (#9) | MODERATE | Proprietary header on all private files; overlay adds, never modifies public files |
| Long-term maintenance | Subtree performance (#10) | MINOR | Always use `--rejoin`; automate sync via CI |
| Release pipeline | GoReleaser path mismatch (#11) | MINOR | Test with `goreleaser check` in CI |
| Documentation | Planning docs exposure (#12) | MINOR | Audit .planning/ for secrets; move SECRETS-INVENTORY.md to private repo |

---

## Recommended Phase Ordering Based on Pitfalls

Based on the severity and dependency analysis of these pitfalls, the open-core restructuring should follow this order:

1. **Pre-split audit and cleanup** (addresses #1, #6, #12) -- Fix tracked .env, audit history for secrets, audit .planning/ docs. Must happen FIRST because everything after depends on a clean starting point.

2. **Code boundary design** (addresses #2, #5, #9) -- Define the billing no-op interface, create the overlay pattern, establish import conventions. Must happen before any code moves because it determines the architecture of the split.

3. **CI/CD design** (addresses #4, #11) -- Design which workflows go where, create test-only CI for public repo, plan the deployment fan-in pattern. Must happen before the actual split so both repos have CI from day one.

4. **Execute the split** (addresses #1, #2, #3, #8) -- Create the public repo (fresh or filtered history), set up the private overlay with subtree, split wrangler.toml. The high-risk phase where most critical pitfalls manifest.

5. **Community preparation** (addresses #7, #9) -- Update CONTRIBUTING.md, verify the public repo builds standalone, set up issue templates, configure merge strategy (no squash merge).

6. **Long-term sync automation** (addresses #3, #10) -- GitHub Actions workflow to automate subtree sync, performance monitoring, conflict alerting.

---

## Sources

- [Cloudflare Workers Secrets Documentation](https://developers.cloudflare.com/workers/configuration/secrets/) -- KV/D1 IDs safe to expose; secrets management guidance
- [Cloudflare wrangler.toml Discussion #7115](https://github.com/cloudflare/workers-sdk/discussions/7115) -- Confirmation that resource IDs are safe in public repos
- [GitHub Breaks Git Subtrees (Noah Allen, 2024)](https://noahtallen.com/2024/02/19/github-breaks-git-subtrees-in-the-weirdest-way/) -- Squash merge CRLF corruption of subtree markers
- [Mastering Git Subtrees (Christophe Porteneuve)](https://medium.com/@porteneuve/mastering-git-subtrees-943d29a798ec) -- --squash and --rejoin incompatibility, annotation requirements
- [Apollo GraphQL Monorepo Subtree Automation](https://www.apollographql.com/blog/how-apollo-manages-swift-packages-in-a-monorepo-with-git-subtrees) -- CI-based subtree split and push pattern
- [git-filter-repo (newren/git-filter-repo)](https://github.com/newren/git-filter-repo) -- Path-based filtering, --blob-callback for secret scrubbing
- [GitGuardian: Why Exposed Secrets Stay Valid](https://blog.gitguardian.com/why-exposed-secrets-stay-valid/) -- 70% of exposed secrets remain valid; statistics on secret leakage
- [Cleaning Git History to Remove Leaked Secrets](https://systemweakness.com/cleaning-git-history-to-remove-leaked-secrets-388ea049e10c) -- BFG vs git-filter-repo comparison
- [Atlassian Git Subtree Tutorial](https://www.atlassian.com/git/tutorials/git-subtree) -- General subtree best practices and limitations
- [Dual Licensing vs Open Core (TermsFeed)](https://www.termsfeed.com/blog/dual-licensing-vs-open-core/) -- License model distinctions for open-core projects
- [Why You Probably Shouldn't Add a CLA (Ben Balter)](https://ben.balter.com/2018/01/02/why-you-probably-shouldnt-add-a-cla-to-your-open-source-project/) -- CLA friction analysis
- [Git Subtree Man Page](https://man.archlinux.org/man/git-subtree.1) -- Official documentation on --rejoin, --squash, --annotate behavior
