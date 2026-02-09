# Project Research Summary

**Project:** Feelr v1.1 Milestone -- Production Deployment & CI/CD Infrastructure
**Domain:** Multi-service deployment architecture (Cloudflare Workers + Azure Static Web Apps + GitHub Actions CI/CD)
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

Deploying Feelr to production requires orchestrating three distinct services across two cloud platforms (Cloudflare and Azure), unified through GitHub Actions CI/CD and Cloudflare DNS. The research reveals a critical architectural constraint: **Cloudflare must manage the DNS zone for feelr.dev** because Workers Custom Domains require an active Cloudflare zone to auto-provision SSL certificates and DNS records for api.feelr.dev. Namecheap remains the domain registrar only, with nameservers pointed to Cloudflare.

The recommended deployment stack simplifies the original Azure App Service container plan. Both the dashboard and docs are static exports (`output: 'export'`), which means Azure Static Web Apps is the optimal hosting solution -- not App Service containers. SWA is purpose-built for static sites, globally distributed, costs $9/mo per app (vs $13+/mo for App Service), and eliminates container orchestration overhead entirely. The CI/CD pipeline pre-builds both apps in GitHub Actions using pnpm + Turborepo, then deploys the `out/` directories to SWA with `skip_app_build: true` to avoid monorepo compatibility issues with SWA's built-in Oryx builder.

The highest-risk deployment pitfalls center on Wrangler environment configuration and DNS/SSL sequencing. Wrangler bindings (KV, D1, DO, vars) are non-inheritable across environments, meaning staging and production bindings must be explicitly declared in separate `[env.*]` blocks -- forgetting this causes staging to silently read/write production data. For DNS, Cloudflare's orange-cloud proxy must be disabled (gray cloud) during Azure custom domain verification, then re-enabled after SSL certificates are issued. Enabling the proxy before Azure validates the domain causes verification to fail permanently. These pitfalls are well-documented but easy to miss during rapid deployment.

## Key Findings

### Recommended Stack

**DNS & Hosting Infrastructure:**
The stack consolidates on Cloudflare DNS (free plan) as the single source of truth for all DNS records. Cloudflare's CNAME flattening allows the apex domain (feelr.dev) to point to Azure Static Web Apps via CNAME despite RFC restrictions. For hosting, Azure Static Web Apps Standard ($9/mo per app) replaces the original Azure App Service container plan because both dashboard and docs are fully static -- no Node.js runtime needed at serving time. This reduces cost ($18/mo vs $26+/mo), eliminates cold starts, and provides global CDN distribution out of the box.

**Core technologies:**
- **Cloudflare DNS (Free):** Authoritative DNS for feelr.dev -- required for Workers Custom Domains; provides CNAME flattening for apex domain
- **Cloudflare Workers (Paid $5/mo):** Gateway hosting at api.feelr.dev with KV, D1, DO bindings; includes 10M requests/month
- **Azure Static Web Apps (Standard $9/mo each):** Dashboard at app.feelr.dev and docs at feelr.dev; pre-built with pnpm/turbo, deployed with skip_app_build
- **GitHub Actions (Free tier):** CI/CD orchestration with path-filtered workflows per service; uses cloudflare/wrangler-action v3 and Azure/static-web-apps-deploy v1
- **Wrangler CLI (^4.63.0):** Workers deployment, secrets management, D1 migrations; environment-based configs for staging/production

**Critical tooling decisions:**
- Pre-build with pnpm + Turborepo in GitHub Actions, deploy static output to SWA (not relying on SWA's built-in Oryx builder which has known pnpm monorepo issues)
- Wrangler environment blocks with explicit per-environment bindings (non-inheritable by design)
- Separate GitHub workflows per service (gateway.yml, dashboard.yml, docs.yml, release.yml) with path-based triggers
- Bulk secrets management via `wrangler secret bulk` piped from JSON in CI

### Expected Features

**Must have (table stakes):**
- Wrangler environment configuration for staging + production with separate KV/D1/DO bindings per environment
- Workers custom domain (api.feelr.dev) with auto-provisioned SSL
- Azure Static Web Apps with custom domains (app.feelr.dev, feelr.dev) and managed SSL
- GitHub Actions CI workflow (lint, typecheck, test on every PR)
- GitHub Actions CD workflow (staging on main push, production on tag push)
- DNS records for all three services (api/app/apex) in Cloudflare
- Health check endpoints for SWA availability probes
- Deployment secrets inventory (CLOUDFLARE_API_TOKEN, AZURE_SWA_*_TOKEN, DOCKER_HUB_*)
- Rollback procedures documented per service

**Should have (competitive differentiators):**
- Workers gradual rollouts (10% → 100% canary deploys via `wrangler versions`)
- Post-deploy smoke tests in CI (verify health endpoints after each deployment)
- Monorepo path-filtered deployments (only deploy changed services)
- Turborepo remote cache for CI (reuse build artifacts across runs)
- Workers preview URLs for PR verification (unique test URLs per PR)
- Concurrency controls on CI/CD (prevent deployment races)
- Internal deployment runbook (single-source guide for deploy, rollback, troubleshooting)

**Defer (anti-features or v2+):**
- Kubernetes / container orchestration (massive overhead for 3 services, solo developer)
- Multi-region Azure deployment (Workers are already global; Azure single-region is sufficient)
- Infrastructure as Code (Terraform/Pulumi adds state management burden for 3 services)
- Automated canary analysis (requires SRE-level metrics infrastructure)
- Production database migrations in CI (D1 migrations need manual review for staging, then production)

### Architecture Approach

Feelr's deployment architecture maps three deployment targets to two infrastructure providers, orchestrated by GitHub Actions. The critical insight: **each service uses a different deployment mechanism** (Wrangler for Workers, SWA action for static apps, GoReleaser for CLI), so CI/CD must coordinate heterogeneous deploys with dependency ordering. The gateway deploys via `wrangler deploy --env <env>`, dashboard/docs deploy via Azure SWA action uploading pre-built `out/` directories, and the CLI releases via GoReleaser to GitHub Releases + Homebrew tap.

**Major components:**
1. **Cloudflare Workers Gateway** -- Deployed via `wrangler deploy` with environment-specific KV/D1/DO bindings; D1 migrations run before deploy in CI; secrets set per-environment via `wrangler secret bulk`
2. **Azure Static Web Apps (dashboard + docs)** -- Two separate SWA resources with independent deployment tokens; pre-built static exports deployed via Azure/static-web-apps-deploy@v1 with `skip_app_build: true`; custom domains verified with CNAME + TXT records in Cloudflare DNS (gray cloud during verification)
3. **GitHub Actions CI/CD Hub** -- Path-filtered workflows per service (gateway.yml, dashboard.yml, docs.yml); separate from release.yml (CLI binaries); environment protection rules on production; concurrency groups prevent deployment races
4. **DNS Authority (Cloudflare)** -- Manages all DNS records for feelr.dev zone; Namecheap nameservers point to Cloudflare; Workers Custom Domain for api.feelr.dev; CNAME flattening for apex domain; gray-cloud CNAMEs for Azure (no double-proxy)

**Deployment dependency chain:**
```
DNS/SSL Setup → Cloudflare Resources (KV/D1/DO) → D1 Migrations → Gateway Deploy → Health Check → Dashboard/Docs Deploy
```

D1 migrations must complete before gateway deployment to avoid schema mismatch errors. Gateway must be healthy before dashboard deploys to prevent blank pages from API unavailability.

### Critical Pitfalls

1. **Wrangler environment bindings are NOT inherited -- staging hits production data** -- Bindings (kv_namespaces, d1_databases, durable_objects, vars) must be explicitly redeclared in each `[env.*]` block. Forgetting this causes staging to use production IDs or deploy with no bindings at all. Prevention: Create separate KV namespaces and D1 databases for each environment; structure wrangler.toml with explicit per-environment bindings; add CI linting that verifies no production IDs appear in staging blocks.

2. **Durable Object migrations are atomic and irreversible -- bad migration deletes all tokens** -- DO migrations cannot be gradually deployed or rolled back. A Delete migration permanently destroys all Durable Objects and data. SQLite storage choice (`new_sqlite_classes`) is permanent and cannot be changed after first deployment. Prevention: Test migrations against staging first; add pre-deploy CI step that diffs migration blocks and flags any `deleted_classes` entries for manual approval; document that SQLite storage is permanent.

3. **Cloudflare orange-cloud proxy blocks Azure custom domain verification** -- When Cloudflare proxies `app.feelr.dev` (orange cloud), Azure cannot verify the CNAME points to its `.azurestaticapps.net` hostname. Domain verification and SSL certificate provisioning fail. Prevention: Add CNAME in Cloudflare with proxy DISABLED (gray cloud); complete Azure domain verification and SSL provisioning; THEN enable orange cloud proxy; set Cloudflare SSL mode to "Full" (not "Full Strict" unless using Cloudflare Origin Certificate).

4. **Wrangler deploy overwrites dashboard-managed environment variables and secrets** -- If `keep_vars = true` is not set in wrangler.toml, `wrangler deploy` deletes any variables/secrets set via dashboard or CLI that are not in the config file. OAuth credentials stop working after deployment. Prevention: Add `keep_vars = true` to wrangler.toml; define all non-secret variables in config; use `wrangler secret put` for secrets and rely on keep_vars; add post-deploy verification that critical secrets exist.

5. **D1 migrations must run BEFORE Worker deploy, not during** -- Deploying Worker code that references new columns/tables before D1 migrations run causes a window where every request fails with SQL errors. The inverse is also dangerous: migrations applied but deploy fails leaves schema mismatched with running code. Prevention: Run migrations as a separate job BEFORE Worker deployment; make migrations backwards-compatible (additive only); test in staging first.

## Implications for Roadmap

Based on research, the deployment infrastructure work naturally splits into 6 sequential phases with clear boundaries and validation points.

### Phase 1: DNS & Cloudflare Zone Setup
**Rationale:** DNS is the foundation -- nothing resolves without it. Cloudflare zone setup must come first because Workers Custom Domains require an active zone to function. Nameserver propagation can take 24 hours, so this gates all other work.

**Delivers:**
- Cloudflare zone for feelr.dev (free plan)
- Nameservers at Namecheap updated to Cloudflare
- DNS records configured (api, app, apex) -- all gray cloud initially
- Zone propagation verified

**Table stakes features addressed:** DNS records for all three services

**Avoids pitfall:** Split DNS management confusion by establishing Cloudflare as sole DNS authority upfront

### Phase 2: Wrangler Environments & Gateway Infrastructure
**Rationale:** The gateway is the API backend that both dashboard and docs depend on. Its infrastructure (KV, D1, DO namespaces, environment config) must exist before any deployments can happen. This phase sets up staging + production environments with full isolation.

**Delivers:**
- `[env.staging]` and `[env.production]` blocks in wrangler.toml with explicit bindings
- Separate KV namespaces (feelr-auth-kv-staging, feelr-auth-kv-production)
- Separate D1 databases (feelr-usage-staging, feelr-usage-production)
- DO bindings declared per environment
- Secrets inventory documented
- `keep_vars = true` configured

**Table stakes features addressed:** Wrangler environment configuration, secrets management, rollback procedures

**Avoids pitfalls:** Binding inheritance trap, wrangler overwrites secrets, DO migration safety

### Phase 3: Gateway CI/CD Pipeline
**Rationale:** With infrastructure in place, automate gateway deployment. D1 migration ordering and secrets management patterns are established here and serve as templates for other services.

**Delivers:**
- `.github/workflows/gateway.yml` with path filters
- D1 migrations job (runs before deploy)
- Wrangler deploy step with environment targeting
- GitHub repository secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
- Post-deploy health check with retry
- Concurrency controls

**Table stakes features addressed:** CD workflow (deploy on merge/tag), health check endpoints

**Avoids pitfalls:** D1 migration ordering, first deploy 523 error, concurrency group cancels deploys

### Phase 4: Azure Static Web Apps Provisioning
**Rationale:** Both dashboard and docs need Azure SWA resources created before deployment automation can work. Custom domain verification must happen before SSL, and SSL must complete before enabling Cloudflare proxy.

**Delivers:**
- Two Azure SWA resources (feelr-dashboard, feelr-docs) on Standard plan
- Custom domains added (app.feelr.dev, feelr.dev)
- TXT records for domain verification in Cloudflare DNS
- CNAME records added (gray cloud)
- Azure domain verification completed
- SSL certificates provisioned
- Cloudflare proxy enabled (orange cloud) after SSL
- Deployment tokens retrieved for CI

**Table stakes features addressed:** Azure custom domains and managed SSL

**Avoids pitfall:** Cloudflare proxy blocks Azure domain verification, CNAME flattening + Full Strict SSL

### Phase 5: Dashboard & Docs CI/CD Pipelines
**Rationale:** With Azure infrastructure in place, automate frontend deployments. The pre-build strategy (pnpm/turbo in CI, skip SWA's Oryx builder) is critical for monorepo compatibility.

**Delivers:**
- `.github/workflows/dashboard.yml` with path filters
- `.github/workflows/docs.yml` with path filters
- Pre-build step (pnpm install + turbo build)
- Azure/static-web-apps-deploy action with `skip_app_build: true`
- GitHub repository secrets (AZURE_SWA_DASHBOARD_TOKEN, AZURE_SWA_DOCS_TOKEN)
- Environment variable handling (`NEXT_PUBLIC_GATEWAY_URL` injected at build time)
- Post-deploy smoke tests

**Table stakes features addressed:** CD workflow for frontend services, monorepo path-filtered deployments

**Avoids pitfall:** Next.js env vars not embedded, SWA monorepo builder issues

### Phase 6: Deployment Runbook & Hardening
**Rationale:** The infrastructure works, but operational knowledge is fragile. The runbook captures first-time setup, routine deploys, rollback procedures, and troubleshooting for future maintainers. Hardening adds safety features that aren't blocking but significantly reduce risk.

**Delivers:**
- Internal deployment runbook (markdown) covering:
  - First-time setup sequence
  - Routine deployment procedures per service
  - Rollback procedures (wrangler rollback, redeploy previous SWA version)
  - Troubleshooting guide (common errors + fixes)
  - Secrets inventory (what exists where, how to rotate)
- GitHub environment protection rules (production requires approval)
- Turborepo cache configuration (`.turbo` directory cached in CI)
- CI check for wrangler.toml binding isolation
- Post-deploy verification tests
- Deployment dependency diagram

**Table stakes features addressed:** Deployment secrets inventory, rollback procedures, internal deployment runbook

**Avoids pitfalls:** Secret drift between environments, Turborepo cache misses, monorepo rebuilds everything

### Phase Ordering Rationale

- **Sequential DNS→Gateway→Azure→Automation pattern:** Each phase depends on the previous phase's outputs. DNS must resolve before Workers Custom Domains work. Gateway infrastructure must exist before CI can deploy. Azure resources must exist before frontend CI can target them.

- **Explicit environment isolation from Phase 2:** Establishing staging + production separation early (in Wrangler config) prevents the highest-severity pitfall (staging hitting production data). All subsequent phases inherit this pattern.

- **Pre-build strategy validated in Phase 5:** The dashboard/docs deployment phase tests the pnpm + Turborepo + SWA pattern. If this fails, the workaround (SWA CLI instead of GitHub Action) is known and documented in STACK.md.

- **Runbook captures tribal knowledge before it's lost:** By Phase 6, all infrastructure is working. The runbook documents the implicit sequencing and gotchas while they're fresh. Waiting longer risks forgetting critical details.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 4 (Azure SWA provisioning):** DNS verification sequence with Cloudflare proxy toggling is high-risk. May need step-by-step validation during execution. Known issue: SWA pnpm support (GitHub issue #1594) may require SWA CLI fallback.
- **Phase 5 (Frontend CI/CD):** Environment variable injection for `NEXT_PUBLIC_GATEWAY_URL` at build time is non-standard. Test locally before automating.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (DNS setup):** Well-documented Cloudflare zone transfer process. Nameserver change is standard registrar operation.
- **Phase 2 (Wrangler environments):** Official Cloudflare docs cover this exhaustively. No ambiguity.
- **Phase 3 (Gateway CI/CD):** Wrangler GitHub Action is official Cloudflare tooling with clear examples.
- **Phase 6 (Runbook):** Documentation exercise, no technical unknowns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official Cloudflare, Azure, GitHub Actions docs. Version compatibility matrix confirmed. Azure Static Web Apps recommendation differs from original App Service plan but is better fit for static exports. |
| Features | HIGH | Table stakes features derived from official deployment guides. Differentiators (gradual rollouts, remote cache) are documented Cloudflare/Turborepo features. Anti-features based on scale analysis (solo developer, 3 services = no need for K8s). |
| Architecture | HIGH | DNS architecture constraints (Cloudflare zone requirement) verified in official Workers Custom Domains docs. SWA pre-build strategy confirmed via Azure SWA build configuration docs and community reports on pnpm monorepo issues. |
| Pitfalls | HIGH | All critical pitfalls sourced from official Cloudflare/Azure/GitHub documentation or verified community incident reports (CVE-2025-30066 for GitHub Actions, SWA issue #1594 for pnpm). Confidence levels assigned per pitfall based on source quality. |

**Overall confidence:** HIGH

### Gaps to Address

- **Azure Static Web Apps pnpm monorepo compatibility:** STACK.md flags known issue #1594. The pre-build + `skip_app_build` workaround is recommended but not fully verified against Feelr's exact monorepo structure. Validation needed during Phase 5 execution. Fallback: use SWA CLI (`swa deploy`) instead of GitHub Action if issue persists.

- **Cloudflare Workers gradual rollout limitations with Durable Objects:** STACK.md notes that gradual rollouts (traffic splitting) have limitations when Durable Objects are heavily used because DOs require single-version consistency. The TokenCoordinator DO is central to Feelr's auth vault. Phase 3 should include research on whether gradual rollouts are viable or if full-cutover deploys are required.

- **Environment variable drift detection tooling:** Pitfall #16 recommends CI verification that staging and production secrets match. The `wrangler secret list` diff approach is conceptual -- needs implementation and testing during Phase 6.

- **First-deploy 523 error handling:** Pitfall #15 documents transient 523 errors on first Workers Custom Domain deploy. The recommended retry health check needs timeout tuning during Phase 3 execution.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- zone requirement, auto-provisioning
- [Cloudflare Wrangler Environments](https://developers.cloudflare.com/workers/wrangler/environments/) -- non-inheritable bindings, environment naming
- [Cloudflare Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) -- keep_vars, binding definitions, secrets
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/) -- ordering, rollback behavior
- [Cloudflare Durable Objects Migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) -- atomic migrations, SQLite permanence
- [Cloudflare CNAME Flattening](https://developers.cloudflare.com/dns/cname-flattening/) -- apex domain CNAME support
- [Azure Static Web Apps Deploy (Next.js static export)](https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-nextjs-static-export) -- deployment guide
- [Azure SWA Build Configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration) -- skip_app_build, monorepo, output_location
- [Azure SWA Custom Domains (External)](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external) -- CNAME + TXT validation
- [Azure SWA Pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/) -- Free vs Standard comparison
- [GitHub Actions Concurrency](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) -- queue behavior
- [GitHub Actions Secrets](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions) -- secret scoping
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions) -- caching, remote cache
- [cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action) -- v3 inputs, environment parameter
- [Azure/static-web-apps-deploy](https://github.com/Azure/static-web-apps-deploy) -- v1 action documentation

### Secondary (MEDIUM confidence)
- [Azure SWA pnpm support (Issue #1594)](https://github.com/Azure/static-web-apps/issues/1594) -- pnpm monorepo issues with Oryx builder
- [CVE-2025-30066: tj-actions/changed-files compromise](https://checkmarx.com/zero-post/compromised-github-actions-leading-to-credential-leaks/) -- GitHub Actions supply chain attack
- [Cloudflare Community: KV binding not set in production](https://community.cloudflare.com/t/my-kv-binding-is-not-being-set-by-my-wrangler-toml-file-when-deploying-to-my-production-environment/488163)
- [Cloudflare Community: CNAME flattening + Full Strict SSL](https://community.cloudflare.com/t/cname-flattening-and-full-strict-ssl-causes-invalid-ssl-certificate-error-526/54760)

### Verified via Project Files (HIGH confidence)
- `apps/gateway/wrangler.toml` -- existing Workers config with KV, D1, DO bindings
- `apps/dashboard/next.config.ts` -- confirms `output: 'export'` (static site)
- `apps/docs/next.config.mjs` -- confirms `output: 'export'` (static site)
- `.goreleaser.yaml` -- existing CLI release config
- `.github/workflows/release.yml` -- existing GoReleaser workflow
- `package.json` -- pnpm 9.15.0, turbo scripts

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
