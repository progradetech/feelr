# Project Research Summary

**Project:** Feelr — Open-Core Repository Restructuring
**Domain:** Monorepo split (public OSS + private cloud overlay)
**Researched:** 2026-02-13
**Confidence:** HIGH

## Executive Summary

Feelr's open-core restructuring requires splitting the current private monorepo into two repositories: a public `progradetech/feelr` (MIT-licensed, fully functional for self-hosting) and a private `progradetech/feelr-cloud` (proprietary billing overlay). The recommended architecture uses git subtree to embed the public repo inside the private repo at an `oss/` prefix, with cloud-only code living in a separate `cloud/` directory. This "private pulls public" pattern ensures the OSS codebase never references or depends on proprietary code, maintaining a clean boundary for community contributors.

The split introduces four critical technical dependencies: (1) git subtree sync automation via GitHub Actions with repository_dispatch triggers, (2) a billing provider interface pattern to replace concrete Stripe imports with pluggable implementations (no-op stub in public, real Stripe in private), (3) separate wrangler.toml configs (minimal dev config in public, full staging/production bindings in private), and (4) split CI/CD workflows where the public repo only runs tests while the private repo handles deployments. The existing codebase has already adopted the `billing.enabled` toggle pattern, providing a natural seam for this extraction.

The highest risks are secret leakage during history migration (the repo contains tracked `.env` files with test credentials), billing code accidentally included in the public repo (breaking the open-core value proposition), and git subtree merge conflicts if GitHub's squash merge is used on the public repo (which corrupts subtree markers). These are preventable with pre-split audits, automated boundary checks in CI, and enforcing merge-commit-only strategy. Community contribution infrastructure (scaffolding CLI, validation CI, contribution guides, issue templates) should be built after the repo split to avoid dual-maintenance burden during transition.

## Key Findings

### Recommended Stack

Git subtree provides one-way sync from public to private without the complexity of git submodules. The private `feelr-cloud` repo uses `git subtree add --prefix=oss --squash` to embed the entire public repo, then adds cloud-only packages in a parallel `cloud/` directory. A GitHub Actions workflow on the public repo fires `peter-evans/repository-dispatch@v4` to the private repo on every merge to main, triggering an automated `git subtree pull` to stay synchronized. The `--squash` flag prevents public commit history from cluttering the private repo, and the `--rejoin` flag maintains checkpoints for fast incremental syncs.

**Core technologies:**
- **git subtree** (built-in to git 2.43+): Embeds public repo inline at `oss/` prefix in private repo — no `.gitmodules`, fully materialized codebase, zero contributor friction in public repo
- **peter-evans/repository-dispatch@v4**: Triggers cross-repo sync from public to private — cleaner than raw curl, handles auth and payload formatting, MIT-licensed with active maintenance
- **Fine-grained PAT** (scoped to `feelr-cloud` with `contents: read+write`): Cross-repo dispatch authentication — follows least-privilege vs. classic PAT with full repo access
- **pnpm workspace overlay**: Cloud repo's `pnpm-workspace.yaml` references both `oss/*` and `cloud/*` packages — single dependency graph with clear boundaries
- **Provider registry pattern**: Billing interface defined in public repo, implementations registered by entry point — allows cloud overlay to replace no-op stubs with Stripe logic without forking shared code

### Expected Features

Community contribution infrastructure should enable self-service connector development while maintaining SDK compliance guarantees. Research shows every mature connector ecosystem (Airbyte, n8n, Activepieces) provides scaffolding tools and automated validation. The existing Feelr connector SDK already uses the right architectural patterns (Web Standard APIs only, single dependency on `@feelr/connector-sdk`), but lacks the contributor-facing tooling.

**Must have (table stakes):**
- **Connector scaffolding CLI** (`pnpm create-connector <name>`) — contributors expect automated project setup, not manual template copying
- **Connector validation CI job** — automated verification that connectors meet SDK contract before review (validates exports, dependency restrictions, test coverage)
- **PR and issue templates** — structured contribution flow with connector-specific checklists and "Connector Request" form for community voting
- **Contributor guide** — expanded docs covering all auth types with worked examples, testing patterns, response normalization rules
- **"Good first issue" labels** — pre-seeded connector requests for well-documented APIs (Todoist, OpenWeatherMap) to onboard new contributors

**Should have (competitive differentiators):**
- **Connector compliance test suite** (`@feelr/connector-test-utils`) — shared package that auto-generates SDK contract tests, contributors run `pnpm test` and get pass/fail without reading docs
- **Auto-generated connector catalog** — docs site page listing all connectors with actions/params extracted from registry metadata
- **Connector sandbox environment** — `pnpm dev:connector <name>` local development setup with hot-reloading

**Defer (v2+):**
- **Automated changelog via changesets** — useful but adds contributor friction (must run `changeset` command)
- **Reviewdog inline comments** — nice-to-have inline PR feedback, but validation CI job covers same ground
- **Connector compatibility matrix** — cross-runtime testing (Workers/Node/Deno) proves self-hosting works but not blocking contributions
- **Interactive playground** — embedded docs playground has high complexity, sandbox environment serves same need

**Anti-features (explicitly NOT building):**
- **CLA (Contributor License Agreement)** — adds friction, MIT license already covers legal requirements
- **Runtime plugin system** — dynamic connector loading introduces security risks, defeats type safety
- **Connector marketplace** — over-engineering for 4 connectors, needs 50+ for ROI
- **Separate connector npm packages** — monorepo with workspace packages is the distribution model

### Architecture Approach

The architecture inverts typical open-core patterns: the **private** cloud repo is the deployment source, pulling the **public** OSS repo as a git subtree. The public repo remains fully functional standalone (no billing, self-hostable), while the cloud repo layers proprietary billing code via a provider interface. This "public-primary with private overlay" pattern ensures OSS contributors never encounter cloud concerns.

**Major components:**

1. **Billing provider interface** (`oss/apps/gateway/src/billing/`) — Defines `BillingProvider` interface with `enforceQuota()` and `recordUsage()` methods, ships `NoopBillingProvider` as default that always allows requests, cloud overlay registers `StripeBillingProvider` at startup via registry pattern
2. **Cloud gateway entry point** (`cloud/gateway-entry.ts`) — Imports the Hono app from `oss/apps/gateway/src/app.ts`, registers `StripeBillingProvider` if `STRIPE_SECRET_KEY` is present, exports Worker fetch/scheduled handlers that wrap the OSS app with cloud bindings
3. **Dual wrangler configs** — Public repo has minimal `wrangler.toml` (name, main, compatibility_date, DO migrations only), private repo has `cloud/wrangler.cloud.toml` with full staging/production environments, resource IDs, and custom domains
4. **Workspace overlay** — Private repo's `pnpm-workspace.yaml` includes `oss/apps/*`, `oss/packages/*`, `oss/connectors/*`, plus `cloud/*`, creating unified dependency graph where cloud packages import from OSS packages via workspace protocol
5. **Cross-repo CI sync** — Public repo's `notify-cloud.yml` fires `repository_dispatch` to private repo on merge to main, triggering `sync-oss.yml` workflow that runs `git subtree pull --prefix=oss --squash`, verifies combined build passes, and pushes to private main

### Critical Pitfalls

The research identified 12 pitfalls ranging from critical (security incidents, permanent corruption) to minor (hours of debugging). Five require prevention before the split executes:

1. **Secrets in git history** — The repo contains 363 commits including tracked `self-host/.env` with test credentials (`ADMIN_TOKEN=test123`, `ENCRYPTION_KEY=test456`). Making the repo public exposes this file and its entire history. Must run `git log --all -p -- '*.env*'` to audit, then either start with fresh history (recommended) or use `git-filter-repo` to scrub. Run Gitleaks/truffleHog before going public, rotate ALL referenced secrets even test values.

2. **Billing code in public repo** — The gateway directly imports Stripe SDK in `plan-enforcer.ts` and `meter.ts`. Simply removing `billing/` directory breaks builds because `app.ts` imports from it. Must create billing provider interface first, convert current code to `StripeBillingProvider` in cloud repo, ship `NoopBillingProvider` in public repo. Add CI check that greps for forbidden patterns (`stripe`, `STRIPE_SECRET_KEY`, `billing`) outside allowed stubs.

3. **Git subtree conflicts** — GitHub's squash merge button corrupts git subtree markers by adding CRLF to commit messages, breaking future `git subtree pull` commands. Must disable "Squash and merge" on public repo, only allow "Create a merge commit" or "Rebase and merge". Always use `git subtree pull --squash --rejoin` to maintain checkpoints. Never mix `--squash` and non-squash pulls.

4. **CI/CD split timing** — Current workflows deploy to Cloudflare Workers and Azure SWA from the private repo using `CLOUDFLARE_API_TOKEN` and `SWA_DEPLOYMENT_TOKEN`. If these workflows exist in public repo, contributors see deployment config and secrets are at risk. Must design CI split before code split: public repo gets test-only CI (lint/typecheck/test), private repo gets test + deploy CI.

5. **Tracked `.env` file** — The `.gitignore` uses `.env` pattern which matches root-level files only, not `self-host/.env`. Must immediately run `git rm --cached self-host/.env`, update `.gitignore` to `**/.env`, verify with `git ls-files | grep '\.env'`. The existing `env.template` already serves as documentation.

## Implications for Roadmap

The split requires five sequential phases, not parallel work. Each phase must complete before the next because dependencies flow strictly downward (cannot split code before designing interfaces, cannot migrate CI before repos exist).

### Phase 1: Pre-Split Audit and Cleanup
**Rationale:** All subsequent phases depend on a clean starting state. Secret leaks and tracked dotfiles must be resolved before any code moves or repos are created. This phase has zero code changes — pure audit, documentation, and git hygiene.

**Delivers:**
- Audit report from `git log --all -p` scan for secrets
- Cleaned git history (fresh snapshot or filtered via `git-filter-repo`)
- `self-host/.env` removed from tracking, `.gitignore` updated to `**/.env`
- `.planning/SECRETS-INVENTORY.md` moved to private docs (not in public repo)
- Secret scanning report from Gitleaks/truffleHog
- Decision log: fresh history vs. preserved history

**Addresses:**
- Pitfall #1 (secrets in history) — prevents security incident
- Pitfall #6 (tracked .env) — prevents test credential exposure
- Pitfall #12 (.planning/ exposure) — prevents internal strategy leak

**Avoids:** Making repo public with any historical secrets, requiring repo deletion and recreation after public launch

**Research flags:** No further research needed, standard git hygiene practices

### Phase 2: Billing Interface Extraction
**Rationale:** The billing code is deeply integrated into the gateway middleware chain. Cannot split repos until this coupling is broken. Must convert concrete Stripe imports to pluggable providers while keeping current functionality working. This is the highest-risk code change.

**Delivers:**
- `BillingProvider` interface in `apps/gateway/src/billing/billing-provider.ts`
- `NoopBillingProvider` implementation (always allows, no Stripe)
- `StripeBillingProvider` implementation (current logic extracted)
- Provider registry (`registerBillingProvider()`, `getBillingProvider()`)
- `plan-enforcer.ts` refactored to use registry instead of direct Stripe imports
- All existing tests passing with `NoopBillingProvider` as default
- CI boundary check script (`scripts/check-public-boundary.mjs`) that fails on Stripe imports

**Addresses:**
- Pitfall #2 (billing in public) — establishes the clean interface boundary
- Pitfall #5 (broken imports) — ensures workspace structure supports overlay pattern
- Pitfall #9 (license mismatch) — separates MIT billing interface from proprietary implementation

**Avoids:** Forking shared files between repos, fragile path aliasing, billing logic leaking into public

**Research flags:** Standard dependency injection pattern, no additional research

### Phase 3: Repository Creation and Subtree Setup
**Rationale:** With billing extracted and history cleaned, create both repos and establish the subtree sync. This is a one-time operation that sets the foundation for all future work. Must get the subtree direction and squash strategy right on first attempt.

**Delivers:**
- New public repo `progradetech/feelr` (MIT license)
- New private repo `progradetech/feelr-cloud` (proprietary license)
- Subtree setup: `git subtree add --prefix=oss oss main --squash`
- Cloud repo directory structure: `oss/` (subtree), `cloud/` (overlay)
- Cloud `pnpm-workspace.yaml` referencing both `oss/*` and `cloud/*`
- Cloud `wrangler.cloud.toml` with staging/production bindings
- Cloud `gateway-entry.ts` importing OSS app and registering `StripeBillingProvider`
- Manual subtree sync verification (pull, build, test)

**Addresses:**
- Pitfall #3 (subtree conflicts) — establishes correct --squash + --rejoin pattern
- Pitfall #8 (wrangler.toml dual purpose) — separates dev config (public) from deploy config (private)
- Pitfall #5 (broken imports) — validates workspace overlay actually works

**Avoids:** Bidirectional subtree sync (only public→private), submodules, manual copy-paste

**Research flags:** Git subtree mechanics well-documented, but test sync workflow before proceeding

### Phase 4: CI/CD Migration
**Rationale:** With both repos created, migrate CI workflows to follow the split architecture. Public repo gets test-only CI (no secrets), private repo gets test + deploy CI. Cross-repo dispatch automates subtree sync. This phase is pure DevOps, no product code changes.

**Delivers:**
- Public repo: `ci.yml` (lint/typecheck/test only), `notify-cloud.yml` (dispatch to private)
- Private repo: `ci.yml` (full test), `sync-oss.yml` (subtree pull), `deploy-gateway.yml`, `deploy-dashboard.yml`, `deploy-docs.yml`
- Fine-grained PAT created and stored as `CLOUD_REPO_PAT` in public repo secrets
- Repository dispatch tested: merge to public main triggers private sync
- Deployment secrets removed from public repo
- GoReleaser workflow validated in private repo (builds from `oss/cli/`)
- Staging deployment validated from private repo

**Addresses:**
- Pitfall #4 (CI split timing) — ensures no deployment secrets in public, public PRs get CI coverage
- Pitfall #11 (GoReleaser paths) — verifies release workflow works from cloud repo
- Pitfall #3 (subtree conflicts) — automates sync to prevent manual errors

**Avoids:** Gap in CI coverage during transition, deployment secrets in public repo, manual subtree sync

**Research flags:** repository_dispatch pattern well-documented, test with manual trigger first

### Phase 5: Community Contribution Infrastructure
**Rationale:** With repo split complete and CI working, build the tooling that enables community contributions. This comes last to avoid maintaining parallel versions during the split (e.g., scaffolding CLI that works in both old and new repo structures). All features target the public repo only.

**Delivers:**
- Connector scaffolding CLI: `pnpm create-connector <name>` (reads `_template`, outputs ready-to-develop connector)
- Connector validation CI job (validates SDK contract, dependency restrictions, test coverage)
- Issue templates: `connector-request.yml`, `bug-report.yml`, `feature-request.yml`
- PR template: `connector.md` with SDK compliance checklist
- Expanded `CONTRIBUTING.md` or new `docs/contributing/connectors.md` covering all auth types
- "Good first issue" labels, 3-5 pre-seeded connector requests
- Developer docs section in Nextra site: SDK reference, "Your First Connector" tutorial, testing guide
- Connector compliance test suite (`packages/connector-test-utils`) with `testConnector(definition)` auto-test generator

**Addresses:**
- Features: all table stakes + compliance test suite differentiator
- Pitfall #7 (contributor friction) — ensures public repo is fully functional standalone, clear docs reduce maintainer bottleneck

**Avoids:** Building contribution tools in both repos, CLA friction, connector marketplace over-engineering

**Research flags:** Connector ecosystems (Airbyte, n8n) already researched, standard patterns

### Phase Ordering Rationale

- **Audit first** because any secrets in history invalidate all subsequent work (would need to recreate repos)
- **Interface second** because splitting repos with tightly coupled billing code is architecturally unsound
- **Repos third** because CI migration requires both repos to exist
- **CI fourth** because community infrastructure should deploy via the new CI, not dual-maintained
- **Community fifth** because it is purely additive (does not block the split) and benefits from stable CI

**Critical path dependencies:**
- Phase 2 depends on Phase 1 (cannot extract billing until history is clean)
- Phase 3 depends on Phase 2 (cannot split repos until billing interface exists)
- Phase 4 depends on Phase 3 (cannot migrate CI until repos exist)
- Phase 5 depends on Phase 4 (contributor tooling needs working CI)

**Parallelization opportunities:** None. This is a strictly sequential waterfall where each phase gates the next.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (Repository Creation)** — Git subtree mechanics are well-documented, but the specific subtree add + pull + squash + rejoin workflow should be tested in a throwaway repo first to verify the sequence works as expected. The Noah Allen blog post about GitHub squash merge corruption is a critical edge case.
- **Phase 4 (CI Migration)** — The `repository_dispatch` + `git subtree pull` automation should be prototyped in test repos before deploying to production. Validate that PAT permissions are correct and dispatch payload reaches the private repo.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Audit)** — Standard git hygiene and secret scanning, well-covered by Gitleaks/truffleHog docs
- **Phase 2 (Billing Interface)** — Provider pattern is a standard dependency injection approach, Hono middleware supports this natively
- **Phase 5 (Community Infrastructure)** — All feature requirements already researched (FEATURES.md), implementation is straightforward scripting + docs

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Git subtree officially documented, peter-evans/repository-dispatch actively maintained, pnpm workspace overlay verified in Turborepo docs. All core technologies have official documentation and real-world usage examples. |
| Features | HIGH | Feature research cross-referenced three major connector ecosystems (Airbyte, n8n, Activepieces), validated against existing Feelr codebase. Table stakes vs. differentiators classification based on what 100% of mature ecosystems provide vs. what only leaders provide. |
| Architecture | HIGH | Architecture patterns verified against Cal.com /ee precedent (for what NOT to do), GitLab single-codebase model (adapted for two-repo context), and Apollo GraphQL subtree automation. Provider interface pattern is standard Hono middleware approach. Codebase analysis confirms billing.enabled toggle already exists. |
| Pitfalls | HIGH | All critical pitfalls sourced from incident reports (GitHub squash merge breaking subtrees, secrets in history exposure statistics), official docs (Cloudflare resource ID safety, git subtree --squash/--rejoin incompatibility), and direct codebase inspection (tracked .env file, billing import graph). |

**Overall confidence:** HIGH

All four research dimensions have official documentation or real-world precedent. The git subtree approach is proven by Apollo GraphQL's monorepo. The billing provider interface is a standard pattern in Hono/Express middleware. The pitfalls are drawn from documented incidents and official warnings, not speculation.

### Gaps to Address

**Git subtree squash merge incompatibility:** The Noah Allen blog post (Feb 2024) documenting GitHub's CRLF corruption of subtree markers is a critical edge case. Must validate this still occurs and decide mitigation: (a) disable squash merge on public repo, (b) use merge commits only, or (c) abandon subtree for file-copy sync. Test in throwaway repo during Phase 3 planning.

**Contributor onboarding without cloud access:** Open-core inherently creates two-class contributors. The research recommends "public repo fully functional standalone" but there is no empirical data on whether this actually reduces friction vs. other open-core projects. Track external PR merge rate and time-to-merge as KPIs during Phase 5 to validate the architectural choice. If merge rate < 50% or time-to-merge > 7 days, the boundary is too coupled.

**GoReleaser path resolution from subtree:** The existing `release.yml` builds Go CLI from `cli/` directory. After subtree split, the private repo's release workflow must build from `oss/cli/` path. The `.goreleaser.yml` config may need path adjustments. Validate with `goreleaser build --snapshot` during Phase 4.

**Stripe dependency removal from public repo:** Research recommends removing `stripe` from `apps/gateway/package.json` after billing interface extraction. Verify this does not break TypeScript type resolution (the interface references `stripe` types). May need to publish billing interface types to a separate package or use conditional types.

## Sources

### Primary (HIGH confidence)
- [git-subtree(1) man page](https://man.archlinux.org/man/git-subtree.1) — Complete command reference, --squash/--rejoin behavior, limitations
- [Atlassian Git Subtree Tutorial](https://www.atlassian.com/git/tutorials/git-subtree) — add/pull/push commands, squash option
- [GitHub Docs: Triggering a workflow](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow) — repository_dispatch, token requirements
- [GitHub Docs: Fine-grained PAT permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens) — Required scopes per endpoint
- [peter-evans/repository-dispatch v4.0.1](https://github.com/peter-evans/repository-dispatch) — Action inputs, token requirements, payload limits
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — KV/D1 IDs safe to expose
- [Hono Middleware](https://hono.dev/docs/guides/middleware) — Context injection patterns
- [Turborepo Package Configurations](https://turborepo.dev/docs/reference/package-configurations) — Workspace filtering
- [Airbyte: Contribute a New Connector](https://docs.airbyte.com/platform/contributing-to-airbyte/submit-new-connector) — Contribution workflow
- [n8n: Community Node Verification](https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/) — Quality gates
- Feelr codebase: `apps/gateway/src/billing/`, `wrangler.toml`, `.github/workflows/`, `self-host/.env` — Direct inspection

### Secondary (MEDIUM confidence)
- [Noah Allen: GitHub Breaks Git Subtrees](https://noahtallen.com/2024/02/19/github-breaks-git-subtrees-in-the-weirdest-way/) — Squash merge CRLF corruption
- [Christophe Porteneuve: Mastering Git Subtrees](https://medium.com/@porteneuve/mastering-git-subtrees-943d29a798ec) — --squash/--rejoin incompatibility warnings
- [Apollo GraphQL: Monorepo Subtree Automation](https://www.apollographql.com/blog/how-apollo-manages-swift-packages-in-a-monorepo-with-git-subtrees) — CI-based subtree workflow
- [Cal.com /ee Enterprise Directory](https://github.com/calcom/cal.com/tree/main/packages/features/ee) — Open-core precedent (analyzed for contrast)
- [GitLab: Single Codebase for CE and EE](https://about.gitlab.com/blog/a-single-codebase-for-gitlab-community-and-enterprise-edition/) — /ee pattern (adapted for two-repo)
- [GitGuardian: Why Exposed Secrets Stay Valid](https://blog.gitguardian.com/why-exposed-secrets-stay-valid/) — 70% of exposed secrets remain valid
- [Ben Balter: Why You Shouldn't Add a CLA](https://ben.balter.com/2018/01/02/why-you-probably-shouldnt-add-a-cla-to-your-open-source-project/) — Contribution friction analysis

### Tertiary (LOW confidence)
- [CNCF: Open Source Project Structure](https://www.cncf.io/blog/2023/04/03/outlining-the-structure-of-your-open-source-software-project/) — core/contrib split patterns
- [TermsFeed: Dual Licensing vs Open Core](https://www.termsfeed.com/blog/dual-licensing-vs-open-core/) — License model distinctions

---
*Research completed: 2026-02-13*
*Ready for roadmap: yes*
