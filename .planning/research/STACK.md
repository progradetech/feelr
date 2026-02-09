# Technology Stack: Deployment & CI/CD

**Project:** Feelr -- Production Deployment Infrastructure
**Researched:** 2026-02-09
**Confidence:** HIGH (all tools verified against official docs and current versions)

---

## Executive Summary

Deploying Feelr to production requires coordinating three services across two platforms (Cloudflare and Azure), unified through Cloudflare DNS and GitHub Actions CI/CD. The critical architectural decision is that **Cloudflare must be the DNS provider for feelr.dev** (not Namecheap) because Workers custom domains require an active Cloudflare zone. Namecheap remains the domain registrar only. Both the dashboard and docs site are static exports (`output: 'export'`) and should deploy to Azure Static Web Apps (not App Service) because SWA is cheaper ($0-9/mo vs $13+/mo), globally distributed, and purpose-built for static sites.

---

## Recommended Stack

### DNS & Domain Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare DNS (Free) | N/A | Authoritative DNS for feelr.dev | **Required** for Workers custom domains. Cloudflare must manage the zone to create DNS records and issue certificates for `api.feelr.dev`. Also provides CNAME flattening for apex domain, CDN proxy for Azure subdomains, and a single pane of glass for all DNS records. |
| Namecheap | N/A | Domain registrar only | Keep as registrar. Change nameservers in Namecheap to point to Cloudflare-assigned nameservers (e.g., `amy.ns.cloudflare.com`, `bob.ns.cloudflare.com`). Registrar handles domain renewal and WHOIS only. |

**DNS Record Layout (configured in Cloudflare dashboard):**

| Record | Type | Name | Value | Proxy |
|--------|------|------|-------|-------|
| API | Custom Domain | `api.feelr.dev` | (auto-created by Workers) | Orange cloud (proxied) |
| Dashboard | CNAME | `app` | `<swa-name>.azurestaticapps.net` | Gray cloud (DNS only) |
| Docs/Marketing | CNAME | `@` (apex via CNAME flattening) | `<swa-name>.azurestaticapps.net` | Gray cloud (DNS only) |
| Docs www redirect | CNAME | `www` | `<swa-name>.azurestaticapps.net` | Gray cloud (DNS only) |
| Domain verification | TXT | `_dnsauth` | (Azure provides value) | N/A |
| Domain verification | TXT | `_dnsauth.app` | (Azure provides value) | N/A |

**Why Cloudflare proxy must be DNS-only (gray cloud) for Azure subdomains:** Azure Static Web Apps requires direct CNAME resolution for domain validation and certificate issuance. Cloudflare orange-cloud proxy would intercept this and cause SSL conflicts (double proxy). The Workers `api.feelr.dev` custom domain uses orange cloud because Cloudflare manages that end-to-end.

**Why CNAME flattening works for apex:** Cloudflare automatically flattens CNAME records at the zone apex into A records when responding to DNS queries. This is RFC-compliant and enabled by default on all Cloudflare plans. This means `feelr.dev` can point to an Azure SWA hostname even though traditional DNS forbids CNAME at apex.

### Cloudflare Workers Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Wrangler CLI | ^4.63.0 | Workers deployment, secrets, D1 migrations | Already installed in project. Handles `wrangler deploy`, `wrangler secret bulk`, `wrangler d1 migrations apply --remote`. Supports environment-based configs for staging/production. |
| cloudflare/wrangler-action | v3 | GitHub Actions integration | Official Cloudflare action. Handles wrangler installation, authentication, and deployment in CI. Supports `environment` parameter, `secrets` injection, custom `command`. |
| Cloudflare API Token | N/A | CI/CD authentication | Create via Cloudflare dashboard > My Profile > API Tokens. Required permissions: Account: Workers Scripts (Edit), Workers KV Storage (Edit), D1 (Edit); Zone: Workers Routes (Edit), DNS (Edit). |

**Wrangler Environment Configuration (wrangler.toml):**

The existing `wrangler.toml` needs staging and production environments. Key design:
- Top-level config = development defaults
- `[env.staging]` = staging Worker deployed as `feelr-gateway-staging`
- `[env.production]` = production Worker with custom domain `api.feelr.dev`

```toml
# Top-level: development defaults
name = "feelr-gateway"
main = "src/index.ts"
compatibility_date = "2026-02-05"

[vars]
ENVIRONMENT = "development"

# ... KV, D1, DO bindings with dev IDs ...

# --- Staging Environment ---
[env.staging]
name = "feelr-gateway-staging"

[env.staging.vars]
ENVIRONMENT = "staging"

# Staging KV namespace (separate from production)
[[env.staging.kv_namespaces]]
binding = "AUTH_KV"
id = "<staging-kv-id>"

# Staging D1 (separate from production)
[[env.staging.d1_databases]]
binding = "USAGE_DB"
database_name = "feelr-usage-staging"
database_id = "<staging-d1-id>"

# Staging Durable Objects
[env.staging.durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]

# --- Production Environment ---
[env.production]
name = "feelr-gateway"

[[env.production.routes]]
pattern = "api.feelr.dev"
custom_domain = true

[env.production.vars]
ENVIRONMENT = "production"

# Production KV namespace
[[env.production.kv_namespaces]]
binding = "AUTH_KV"
id = "<production-kv-id>"

# Production D1
[[env.production.d1_databases]]
binding = "USAGE_DB"
database_name = "feelr-usage"
database_id = "<production-d1-id>"

# Production Durable Objects
[env.production.durable_objects]
bindings = [
  { name = "TOKEN_COORDINATOR", class_name = "TokenCoordinator" }
]
```

**Critical:** Bindings (kv_namespaces, d1_databases, durable_objects, vars) are **non-inheritable** in wrangler environments. They must be explicitly defined in each `[env.*]` section. Forgetting this causes the Worker to deploy without bindings and fail at runtime.

**D1 Migrations in CI:**

```bash
# Apply migrations to staging
npx wrangler d1 migrations apply feelr-usage-staging --remote --env staging

# Apply migrations to production
npx wrangler d1 migrations apply feelr-usage --remote --env production
```

**Secrets Management in CI:**

```bash
# Individual secret (piped via stdin for non-interactive CI)
echo "$ENCRYPTION_KEY" | npx wrangler secret put ENCRYPTION_KEY --env production

# Bulk secrets from JSON (preferred for multiple secrets)
echo '{"ENCRYPTION_KEY":"...","ADMIN_TOKEN":"...","SLACK_CLIENT_ID":"...","SLACK_CLIENT_SECRET":"...","STRIPE_SECRET_KEY":"...","STRIPE_WEBHOOK_SECRET":"..."}' | npx wrangler secret bulk --env production
```

### Azure Static Web Apps (Dashboard + Docs)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Azure Static Web Apps | Standard ($9/mo) | Host dashboard (app.feelr.dev) and docs site (feelr.dev) | Both apps use `output: 'export'` (static HTML). SWA is purpose-built: global CDN, free SSL, custom domains, staging environments from PRs. Cheaper than App Service ($9 vs $13+/mo), no container management needed. |
| Azure/static-web-apps-deploy | v1 | GitHub Actions deployment | Official Azure action. Handles upload, CDN invalidation, PR preview environments. Supports `skip_app_build` for pre-built monorepo apps. |
| SWA CLI (@azure/static-web-apps-cli) | latest | Alternative deploy tool | Use `swa deploy` in CI as a workaround if the official action has pnpm/monorepo issues. Supports `--output-location`, `--deployment-token`, `--env`. |

**Why Azure Static Web Apps, not Azure App Service:**

| Factor | Azure Static Web Apps | Azure App Service |
|--------|----------------------|-------------------|
| Pricing | Free plan or $9/mo Standard | $13+/mo (B1 Linux minimum) |
| Global CDN | Built-in, automatic | Requires Azure CDN add-on |
| SSL | Free, automatic | Free on B1+, manual on F1 |
| Custom domains | Free plan supports custom domains | B1+ only |
| Staging envs | Auto-created from PRs (3 free, more on Standard) | Requires deployment slots ($$$) |
| Container management | None (just upload static files) | Docker image build, registry, pull |
| Cold starts | None (CDN-served static files) | Container startup time |
| Static export fit | Perfect fit | Overkill for static files |

**Why not Azure App Service for static exports:** Both `@feelr/dashboard` and `@feelr/docs` use `output: 'export'` producing static HTML/CSS/JS in an `out/` directory. Running a container with a web server (nginx/node) to serve static files is unnecessary overhead. Azure SWA serves static files directly from CDN edge nodes with zero container management.

**Why two separate SWA resources (not one):**
- `app.feelr.dev` (dashboard) and `feelr.dev` (docs) have different build pipelines, different deploy cadences, and different content
- SWA custom domains are per-resource, so each needs its own SWA instance
- Independent staging environments for dashboard vs docs PRs

**Monorepo Deployment Strategy:**

The pnpm monorepo with shared workspace dependencies does not work well with Azure SWA's built-in Oryx builder. The solution: **pre-build in GitHub Actions, then deploy the `out/` folder with `skip_app_build: true`**.

```yaml
# Build step (GitHub Actions)
- run: pnpm install --frozen-lockfile
- run: pnpm turbo build --filter=@feelr/dashboard

# Deploy step (skip SWA's built-in build)
- uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_SWA_DASHBOARD_TOKEN }}
    action: upload
    app_location: apps/dashboard/out
    output_location: ""
    skip_app_build: true
```

### GitHub Actions CI/CD

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| actions/checkout | v4 | Repository checkout | Standard. Use `fetch-depth: 0` for GoReleaser changelog. |
| actions/setup-node | v4 | Node.js setup | Required for pnpm install and turbo build. Pin to Node 22 (LTS). |
| pnpm/action-setup | v4 | pnpm installation | Installs pnpm in CI. Reads version from `packageManager` field in root package.json. |
| cloudflare/wrangler-action | v3 | Workers deployment | See above. |
| Azure/static-web-apps-deploy | v1 | SWA deployment | See above. |
| goreleaser/goreleaser-action | v6 | CLI binary release | Already in use (`.github/workflows/release.yml`). v6 defaults to GoReleaser v2. |
| actions/setup-go | v5 | Go toolchain | Already in use. Reads version from `cli/go.mod`. |

**Workflow Architecture:**

```
Trigger                  Workflow                          Deploys To
--------                 --------                          ----------
push to main     -->     ci.yml                    -->     (tests only, no deploy)
push to main     -->     deploy-staging.yml        -->     staging (all services)
push tag v*      -->     deploy-production.yml     -->     production (all services)
push tag v*      -->     release.yml (existing)    -->     GitHub Releases (CLI binaries)
pull_request     -->     ci.yml                    -->     (tests + SWA preview)
```

**Recommended: 4 workflow files:**

1. **`ci.yml`** -- Runs on all pushes and PRs. Lint, typecheck, test. SWA preview deploy on PRs.
2. **`deploy-staging.yml`** -- Runs on push to `main`. Deploys Workers (staging env), dashboard SWA (staging), docs SWA (staging).
3. **`deploy-production.yml`** -- Runs on tag `v*`. Deploys Workers (production env), dashboard SWA (production), docs SWA (production). Runs D1 migrations before deploy.
4. **`release.yml`** (existing) -- Runs on tag `v*`. GoReleaser builds CLI binaries.

**Concurrency Control:**

```yaml
concurrency:
  group: deploy-staging-${{ github.ref }}
  cancel-in-progress: false  # Never cancel active deployments
```

Use `cancel-in-progress: false` for deployment workflows. Active deployments should complete to avoid inconsistent state (e.g., D1 migration applied but Worker not deployed).

### Go CLI Release (Existing -- No Changes Needed)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| GoReleaser | v2 (via goreleaser-action v6) | Cross-compile + release | Already configured in `.goreleaser.yaml`. Builds for linux/darwin/windows on amd64/arm64. Publishes to GitHub Releases + Homebrew tap. |
| goreleaser/goreleaser-action | v6 | GitHub Actions integration | Already in `.github/workflows/release.yml`. v6.4.0 is latest stable. |

The existing release workflow is correct and complete. No changes needed for production deployment.

---

## Secrets & Environment Variables

### GitHub Actions Secrets Required

| Secret | Used By | How to Obtain |
|--------|---------|---------------|
| `CLOUDFLARE_API_TOKEN` | wrangler-action (all Workers deploys) | Cloudflare Dashboard > My Profile > API Tokens > Create Token. Permissions: Account Workers Scripts (Edit), Workers KV Storage (Edit), D1 (Edit); Zone Workers Routes (Edit). |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler-action | Cloudflare Dashboard > any zone > Overview sidebar (right side). |
| `AZURE_SWA_DASHBOARD_TOKEN` | SWA deploy (dashboard) | Azure Portal > Static Web App (dashboard) > Overview > Manage deployment token. |
| `AZURE_SWA_DOCS_TOKEN` | SWA deploy (docs) | Azure Portal > Static Web App (docs) > Overview > Manage deployment token. |
| `GITHUB_TOKEN` | GoReleaser, PR comments | Auto-provided by GitHub Actions. No manual setup. |
| `HOMEBREW_TAP_GITHUB_TOKEN` | GoReleaser Homebrew tap | Already configured (existing release.yml). PAT with repo scope on `andrewprograde/homebrew-feelr`. |

### Cloudflare Worker Secrets (set via wrangler, not in wrangler.toml)

| Secret | Environment | Purpose |
|--------|-------------|---------|
| `ENCRYPTION_KEY` | staging, production | AES-256 key for credential vault encryption |
| `ADMIN_TOKEN` | staging, production | Admin API authentication |
| `SLACK_CLIENT_ID` | staging, production | Slack OAuth app ID |
| `SLACK_CLIENT_SECRET` | staging, production | Slack OAuth secret |
| `DISCORD_CLIENT_ID` | staging, production | Discord OAuth app ID |
| `DISCORD_CLIENT_SECRET` | staging, production | Discord OAuth secret |
| `STRIPE_SECRET_KEY` | production only | Stripe API key (use test key for staging) |
| `STRIPE_WEBHOOK_SECRET` | production only | Stripe webhook endpoint secret |

**Secrets are per-environment in Cloudflare.** Setting a secret with `--env staging` sets it only for the `feelr-gateway-staging` Worker. Production secrets are separate. This is correct and desirable.

### Dashboard Environment Variables (build-time)

| Variable | Value (staging) | Value (production) |
|----------|-----------------|-------------------|
| `NEXT_PUBLIC_GATEWAY_URL` | `https://feelr-gateway-staging.<account>.workers.dev` | `https://api.feelr.dev` |

Set in the GitHub Actions workflow as build-time env vars before `next build`.

---

## Azure Resource Provisioning

Two Azure Static Web Apps resources need to be created before the first deployment:

### Resource 1: Dashboard SWA

```bash
az staticwebapp create \
  --name feelr-dashboard \
  --resource-group feelr-prod \
  --location eastus2 \
  --sku Standard \
  --source https://github.com/andrewprograde/feelr \
  --branch main \
  --app-location "apps/dashboard" \
  --output-location "out" \
  --login-with-github
```

After creation:
1. Get deployment token: Azure Portal > feelr-dashboard > Manage deployment token
2. Add custom domain: Azure Portal > feelr-dashboard > Custom domains > Add > `app.feelr.dev`
3. Azure will provide a TXT record value for domain validation
4. Add TXT record in Cloudflare DNS: `_dnsauth.app` -> (Azure's validation value)
5. Add CNAME record in Cloudflare DNS: `app` -> `<auto-hostname>.azurestaticapps.net` (DNS only, gray cloud)

### Resource 2: Docs SWA

```bash
az staticwebapp create \
  --name feelr-docs \
  --resource-group feelr-prod \
  --location eastus2 \
  --sku Standard \
  --source https://github.com/andrewprograde/feelr \
  --branch main \
  --app-location "apps/docs" \
  --output-location "out" \
  --login-with-github
```

After creation:
1. Get deployment token: Azure Portal > feelr-docs > Manage deployment token
2. Add custom domains: `feelr.dev` (apex) and `www.feelr.dev`
3. For apex: Add TXT record `_dnsauth` -> (Azure's validation value)
4. For www: Add TXT record `_dnsauth.www` -> (Azure's validation value)
5. Add CNAME records in Cloudflare (both DNS only, gray cloud)

**SKU choice: Standard ($9/mo per app = $18/mo total)**
- Free plan works but limited to 2 custom domains per app and 3 staging environments
- Standard adds SLA (99.95%), unlimited custom domains, 10 staging environments, password-protected environments
- For production launch, Standard is worth $9/mo for SLA and staging previews

### Cloudflare Resource Provisioning

```bash
# Add feelr.dev zone to Cloudflare (free plan)
# Done via Cloudflare Dashboard > Add a Site > feelr.dev > Free plan
# Then update Namecheap nameservers to Cloudflare-assigned values

# Create production KV namespace
npx wrangler kv namespace create AUTH_KV --env production
# Output: id = "abc123..." -> put in wrangler.toml [env.production]

# Create staging KV namespace
npx wrangler kv namespace create AUTH_KV --env staging

# Create production D1 database
npx wrangler d1 create feelr-usage
# Output: database_id = "def456..." -> put in wrangler.toml [env.production]

# Create staging D1 database
npx wrangler d1 create feelr-usage-staging

# Apply D1 migrations
npx wrangler d1 migrations apply feelr-usage --remote --env production
npx wrangler d1 migrations apply feelr-usage-staging --remote --env staging

# Deploy Workers
npx wrangler deploy --env staging
npx wrangler deploy --env production

# Set production secrets
echo '{"ENCRYPTION_KEY":"...","ADMIN_TOKEN":"..."}' | npx wrangler secret bulk --env production

# Configure custom domain (after DNS is active)
# This happens automatically on `wrangler deploy --env production` because
# wrangler.toml [env.production] has routes with custom_domain = true
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| DNS Provider | Cloudflare DNS (Free) | Namecheap BasicDNS | Workers custom domains **require** Cloudflare zone. Cannot use external DNS for `api.feelr.dev` Worker. |
| Dashboard Hosting | Azure Static Web Apps | Azure App Service (container) | Dashboard is static export. SWA is cheaper ($9 vs $13+), globally distributed, zero container overhead. |
| Dashboard Hosting | Azure Static Web Apps | Vercel | Previous research suggested Vercel. Azure SWA chosen to consolidate Azure billing and avoid Vercel vendor lock-in. Both are valid; SWA wins on cost control. |
| Docs Hosting | Azure Static Web Apps | Cloudflare Pages | Could work, but would split hosting across vendors. SWA keeps dashboard + docs on same platform with same billing. |
| Docs Hosting | Azure Static Web Apps | GitHub Pages | Lacks staging environments, custom headers, and redirect rules. SWA is more capable for a production marketing site. |
| CI/CD Approach | Pre-build + skip_app_build | Let SWA Oryx build | SWA's built-in builder does not support pnpm monorepos well (known issue #1594). Pre-building with pnpm/turbo gives full control. |
| SWA Deploy Method | Azure/static-web-apps-deploy@v1 | SWA CLI (`swa deploy`) | Official action is simpler for GitHub Actions. SWA CLI is a fallback if the action has issues with monorepo output paths. |
| Workers CI Deploy | cloudflare/wrangler-action@v3 | Raw `npx wrangler deploy` | Action handles caching, auth, and provides deployment URL output. Slightly more convenient than raw commands. |
| Secrets Management | wrangler secret bulk (JSON) | Individual `wrangler secret put` per secret | Bulk is faster in CI (single API call) and easier to maintain as secret count grows. |
| Environment Strategy | wrangler.toml environments | Separate wrangler.toml files | Single file with `[env.*]` sections is the Cloudflare-recommended pattern. Easier to see all config in one place. |

---

## Version Compatibility Matrix

| Tool | Pinned Version | Compatible With | Notes |
|------|---------------|-----------------|-------|
| wrangler | ^4.63.0 | Cloudflare Workers, KV, D1, DO | Already installed in gateway. Latest stable. |
| cloudflare/wrangler-action | v3 | wrangler ^4.x | Installs wrangler automatically. Supports `environment` input. |
| Azure/static-web-apps-deploy | v1 | Azure SWA Standard | Only v1 exists. Supports `skip_app_build`. |
| goreleaser/goreleaser-action | v6 | GoReleaser v2 | v6 defaults to GoReleaser v2. Already working. |
| actions/checkout | v4 | All workflows | Standard. |
| actions/setup-node | v4 | Node 22 LTS | Use `node-version: 22`. |
| pnpm/action-setup | v4 | pnpm 9.15.0 | Reads version from `packageManager` in package.json. |
| actions/setup-go | v5 | Go (from go.mod) | Already in use. |
| Node.js | 22 (LTS) | pnpm 9.x, turbo, next 15.x, nextra 4.x | LTS until April 2027. |
| pnpm | 9.15.0 | Monorepo, frozen lockfile | Matches `packageManager` field in root package.json. |

---

## Cost Summary

| Service | Plan | Monthly Cost | Notes |
|---------|------|-------------|-------|
| Cloudflare Workers (Paid) | $5/mo | $5 | Includes 10M requests, KV, D1, DO allowances |
| Cloudflare DNS | Free | $0 | Free zone management |
| Azure SWA (Dashboard) | Standard | $9 | `app.feelr.dev` |
| Azure SWA (Docs) | Standard | $9 | `feelr.dev` |
| Namecheap (Registrar) | Annual | ~$1/mo | Domain renewal only |
| GitHub Actions | Free tier | $0 | 2,000 min/mo free for private repos |
| **Total** | | **~$24/mo** | |

Note: Azure SWA Free plan could reduce cost to $5/mo total (Workers only), but loses SLA and staging environment depth. Start with Standard for production launch; downgrade if cost is a concern.

---

## Sources

### Official Documentation (HIGH confidence)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- zone requirement, wrangler.toml config
- [Cloudflare Wrangler Environments](https://developers.cloudflare.com/workers/wrangler/environments/) -- inheritable vs non-inheritable keys, naming
- [Cloudflare Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) -- full wrangler.toml reference
- [Cloudflare DNS Full Setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/) -- nameserver change process
- [Cloudflare CNAME Flattening](https://developers.cloudflare.com/dns/cname-flattening/) -- apex domain CNAME support
- [Cloudflare Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/) -- secret put, secret bulk, d1 migrations
- [Cloudflare D1 Wrangler Commands](https://developers.cloudflare.com/d1/wrangler-commands/) -- migrations apply --remote
- [Cloudflare API Token Permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) -- token scoping
- [Azure Static Web Apps Deploy (Next.js static export)](https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-nextjs-static-export) -- static export deployment guide
- [Azure SWA Build Configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration) -- skip_app_build, monorepo, output_location
- [Azure SWA Custom Domains (External)](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external) -- CNAME + TXT validation
- [Azure SWA Apex Domain (External)](https://learn.microsoft.com/en-us/azure/static-web-apps/apex-domain-external) -- apex domain with external DNS
- [Azure SWA Pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/) -- Free vs Standard plan comparison
- [Azure SWA Hosting Plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans) -- feature comparison
- [cloudflare/wrangler-action README](https://github.com/cloudflare/wrangler-action) -- v3 inputs, secrets, environment
- [Azure/static-web-apps-deploy](https://github.com/Azure/static-web-apps-deploy) -- v1 action documentation
- [goreleaser/goreleaser-action](https://github.com/goreleaser/goreleaser-action) -- v6 features
- [Namecheap: DNS with Cloudflare](https://www.namecheap.com/support/knowledgebase/article.aspx/9607/2210/how-to-set-up-dns-records-for-your-domain-in-a-cloudflare-account/) -- nameserver change guide
- [GitHub Actions Environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) -- protection rules, approvals
- [GitHub Actions Concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) -- cancel-in-progress for deployments

### Verified via Project Files (HIGH confidence)
- `apps/gateway/wrangler.toml` -- existing Workers config with KV, D1, DO bindings
- `apps/dashboard/next.config.ts` -- confirms `output: 'export'` (static site)
- `apps/docs/next.config.mjs` -- confirms `output: 'export'` (static site)
- `apps/gateway/package.json` -- wrangler ^4.0.0, deploy script exists
- `.goreleaser.yaml` -- existing CLI release config
- `.github/workflows/release.yml` -- existing GoReleaser workflow
- `self-host/Dockerfile` -- existing self-host build (separate from cloud deploy)
- `package.json` -- pnpm 9.15.0, turbo scripts

### Known Issues (flag for validation)
- [Azure SWA pnpm support (Issue #1594)](https://github.com/Azure/static-web-apps/issues/1594) -- pnpm monorepos do not work with SWA's built-in Oryx builder. Workaround: pre-build with pnpm/turbo, deploy with `skip_app_build: true`. **LOW confidence** this is fully resolved.
- [Wrangler secret bulk hanging (Issue #10555)](https://github.com/cloudflare/workers-sdk/issues/10555) -- Some reports of `wrangler secret bulk` hanging in CI. If encountered, fall back to individual `echo | wrangler secret put` calls.

---

*Deployment stack research for: Feelr -- Production Deployment Infrastructure*
*Researched: 2026-02-09*
