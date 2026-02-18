# Phase 14: Azure Static Web Apps Provisioning - Research

**Researched:** 2026-02-09
**Domain:** Azure Static Web Apps provisioning, custom domain verification, Cloudflare DNS integration, Next.js static export deployment
**Confidence:** HIGH

## Summary

Phase 14 provisions two Azure Static Web Apps resources and deploys pre-built Next.js static exports to them: the Feelr dashboard at `app.feelr.dev` and the docs/marketing site at `feelr.dev` (apex). Both apps already have `output: 'export'` configured in their `next.config` files and produce static HTML in an `out/` directory. The deployment flow is: create SWA resources via Azure CLI, retrieve deployment tokens, build locally with pnpm/turbo, deploy with the `Azure/static-web-apps-deploy@v1` GitHub Action using `skip_app_build: true`, then configure custom domains with TXT-based verification and CNAME/ALIAS DNS records in Cloudflare.

The critical sequencing constraint is the Cloudflare proxy (orange cloud) interaction with Azure domain verification and SSL certificate provisioning. Azure SWA uses DigiCert for managed SSL certificates, which performs HTTP-based validation at `/.well-known/pki-validation/`. When Cloudflare's proxy is enabled (orange cloud), DigiCert sees Cloudflare IPs instead of Azure's, causing validation to fail. The CNAME records for `app.feelr.dev` and the CNAME-flattened apex `feelr.dev` **must use DNS-only mode (gray cloud) permanently** for Azure's managed SSL to work with certificate renewals. A permanent TXT record with the `_dnsauth` prefix should also be maintained as a fallback validation method.

The apex domain (`feelr.dev`) requires special handling because DNS standards prohibit CNAME records at the zone apex. Cloudflare's CNAME flattening feature resolves this by accepting a CNAME record at the apex and automatically resolving it to A/AAAA records at query time. This is enabled by default on all Cloudflare plans and works transparently with Azure SWA. The TXT validation for the apex uses `_dnsauth` as the hostname in Cloudflare DNS (Cloudflare interprets `@` or blank host as the apex).

**Primary recommendation:** Create two SWA resources without GitHub integration (using `az staticwebapp create` with `--sku Standard` and no `--source`), then deploy via deployment tokens in CI. Use DNS-only (gray cloud) mode permanently for SWA custom domain records to avoid SSL certificate renewal failures.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Azure CLI (`az`) | latest | Provision SWA resources, manage hostnames, retrieve deployment tokens | Official Azure management tool; `az staticwebapp` commands handle full lifecycle |
| Azure/static-web-apps-deploy | @v1 | GitHub Actions deployment of pre-built static assets | Official Azure action; supports `skip_app_build`, `output_location`, deployment tokens |
| Next.js | ^15.3.0 | Framework for both dashboard and docs apps | Already configured with `output: 'export'` in both apps |
| Nextra | ^4.2.0 | Docs/marketing site framework (wraps Next.js) | Already configured with `output: 'export'` in docs app |
| pnpm | 9.15.0 | Package manager (monorepo) | Already used; `pnpm install --frozen-lockfile` in CI |
| Turborepo | latest | Monorepo build orchestration | Already used; `pnpm turbo run build --filter=@feelr/dashboard` for targeted builds |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| SWA CLI (`@azure/static-web-apps-cli`) | latest | Local deployment testing, token management | Optional for local testing; not needed if deploying via GitHub Actions |
| Cloudflare Dashboard | N/A | DNS record management (CNAME, TXT) | Manual domain verification and DNS configuration |
| curl | system | Verify deployed sites and SSL certificates | Post-deployment verification commands |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Azure/static-web-apps-deploy@v1` | SWA CLI (`swa deploy`) | SWA CLI is more flexible for local use but the GH Action is simpler in workflows and handles auth natively |
| Azure Static Web Apps | Azure App Service | App Service is overkill for static sites; higher cost, more config, no benefit for static exports |
| Azure Static Web Apps | Cloudflare Pages | Would simplify DNS but project decision is Azure SWA for frontend hosting |
| `skip_app_build: true` | Let SWA's Oryx builder handle it | Oryx builder adds complexity, doesn't understand pnpm monorepo easily, slower builds; pre-build gives full control |

**Installation:**
```bash
# Azure CLI (if not already installed)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# SWA CLI (optional, for local testing only)
npm install -g @azure/static-web-apps-cli
```

## Architecture Patterns

### Recommended Project Structure (No New Files Except Config)

```
apps/
  dashboard/
    out/                           # Next.js static export output (gitignored, built in CI)
    staticwebapp.config.json       # NEW: SWA routing config (custom 404, headers)
    next.config.ts                 # Already has output: 'export'
    package.json                   # Already has build script
  docs/
    out/                           # Nextra static export output (gitignored, built in CI)
    staticwebapp.config.json       # NEW: SWA routing config (custom 404, headers)
    next.config.mjs                # Already has output: 'export'
    package.json                   # Already has build script
```

### Pattern 1: SWA Resource Provisioning Without GitHub Integration

**What:** Create Azure SWA resources using `az staticwebapp create` without linking to a GitHub repo. This decouples resource provisioning from CI/CD, allowing custom GitHub Actions workflows (Phase 15) to handle deployment.

**When to use:** When you want full control over the build and deploy pipeline rather than using Azure's auto-generated workflow.

**Commands:**
```bash
# Source: https://learn.microsoft.com/en-us/cli/azure/staticwebapp?view=azure-cli-latest

# Login to Azure
az login

# Create resource group (if not exists)
az group create --name feelr-rg --location centralus

# Create SWA for dashboard (Standard plan for 5 custom domains, SLA)
az staticwebapp create \
  --name feelr-dashboard \
  --resource-group feelr-rg \
  --sku Standard \
  --location centralus

# Create SWA for docs site (Standard plan)
az staticwebapp create \
  --name feelr-docs \
  --resource-group feelr-rg \
  --sku Standard \
  --location centralus

# Retrieve deployment tokens
az staticwebapp secrets list \
  --name feelr-dashboard \
  --resource-group feelr-rg \
  --query "properties.apiKey" -o tsv

az staticwebapp secrets list \
  --name feelr-docs \
  --resource-group feelr-rg \
  --query "properties.apiKey" -o tsv
```

### Pattern 2: Pre-Built Static Deployment via GitHub Actions

**What:** Build the Next.js apps in CI using pnpm/turbo, then upload the pre-built `out/` directory to SWA using the official action with `skip_app_build: true`.

**When to use:** Always for this project. The requirement is to skip Oryx builder and use pnpm/turbo.

**Example workflow (simplified -- Phase 15 will create full CI/CD):**
```yaml
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration

- name: Build dashboard
  run: pnpm turbo run build --filter=@feelr/dashboard
  env:
    NEXT_PUBLIC_GATEWAY_URL: https://api.feelr.dev

- name: Deploy dashboard to SWA
  uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.SWA_DASHBOARD_DEPLOYMENT_TOKEN }}
    repo_token: ${{ secrets.GITHUB_TOKEN }}
    action: upload
    app_location: apps/dashboard/out   # Pre-built output directory
    output_location: ""                 # Empty -- already built
    skip_app_build: true
```

### Pattern 3: Custom Domain TXT Verification Flow (Apex + Subdomain)

**What:** Add custom domains to SWA using TXT record validation (required for new domains), then create CNAME records for traffic routing.

**When to use:** For all custom domain setups on Azure SWA.

**Subdomain flow (app.feelr.dev):**
```bash
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external

# Step 1: Initiate hostname with TXT validation
az staticwebapp hostname set \
  --name feelr-dashboard \
  --hostname app.feelr.dev \
  --validation-method dns-txt-token \
  --no-wait

# Step 2: Get the validation token
az staticwebapp hostname show \
  --name feelr-dashboard \
  --resource-group feelr-rg \
  --hostname app.feelr.dev \
  --query "validationToken" -o tsv

# Step 3: Add TXT record in Cloudflare DNS
# Name: _dnsauth.app   Type: TXT   Value: <validation-token>
# Proxy: DNS-only (gray cloud)

# Step 4: Add CNAME record in Cloudflare DNS (after TXT propagates)
# Name: app   Type: CNAME   Value: <swa-default-hostname>.azurestaticapps.net
# Proxy: DNS-only (gray cloud) -- MUST stay gray for SSL renewal

# Step 5: Wait for Azure to validate and provision SSL certificate
```

**Apex domain flow (feelr.dev):**
```bash
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/apex-domain-external

# Step 1: Initiate hostname with TXT validation
az staticwebapp hostname set \
  --name feelr-docs \
  --hostname feelr.dev \
  --validation-method dns-txt-token \
  --no-wait

# Step 2: Get the validation token
az staticwebapp hostname show \
  --name feelr-docs \
  --resource-group feelr-rg \
  --hostname feelr.dev \
  --query "validationToken" -o tsv

# Step 3: Add TXT record in Cloudflare DNS
# Name: _dnsauth   Type: TXT   Value: <validation-token>
# Proxy: N/A (TXT records are never proxied)

# Step 4: Add CNAME record at apex in Cloudflare (CNAME flattening)
# Name: @   Type: CNAME   Value: <swa-default-hostname>.azurestaticapps.net
# Proxy: DNS-only (gray cloud) -- MUST stay gray for SSL renewal
# NOTE: Cloudflare automatically flattens this CNAME at the apex

# Step 5: Wait for Azure to validate and provision SSL certificate
```

### Pattern 4: staticwebapp.config.json for Static Export Apps

**What:** Minimal SWA configuration for Next.js static exports. Do NOT use `navigationFallback` -- it conflicts with Next.js's per-page HTML files.

**When to use:** For both dashboard and docs apps.

**Example:**
```json
// Source: https://learn.microsoft.com/en-us/azure/static-web-apps/configuration
{
  "responseOverrides": {
    "404": {
      "rewrite": "/404.html"
    }
  },
  "globalHeaders": {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  }
}
```

### Anti-Patterns to Avoid

- **Using `navigationFallback` with Next.js static export:** Next.js generates individual HTML files for each route (e.g., `/overview.html`, `/keys.html`). The `navigationFallback` rewrites all unmatched requests to `index.html`, which breaks direct URL access and causes incorrect page loads. Do NOT configure `navigationFallback` for static exports.
- **Using Cloudflare orange cloud (proxy) for SWA domains:** DigiCert cannot reach Azure's validation endpoint through Cloudflare's proxy. SSL certificate provisioning and renewal will fail. Always use gray cloud (DNS-only) for SWA custom domain records.
- **Using A records for the apex domain:** An A record points to a single IP, losing Azure SWA's global distribution. Use Cloudflare's CNAME flattening instead.
- **Letting SWA create a GitHub workflow automatically:** When creating via Azure Portal with GitHub integration, SWA generates a workflow file. This conflicts with the project's custom CI/CD approach (Phase 15). Create SWA without GitHub integration.
- **Storing deployment tokens in code:** Deployment tokens are secrets. Store as GitHub Actions secrets (`SWA_DASHBOARD_DEPLOYMENT_TOKEN`, `SWA_DOCS_DEPLOYMENT_TOKEN`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSL certificate management | Custom cert provisioning/renewal | Azure SWA managed SSL | Auto-provisioned after domain verification; auto-renewed with proper DNS config |
| Static file serving with CDN | Custom CDN configuration | Azure SWA built-in global distribution | SWA serves from edge locations automatically on Standard plan |
| SPA routing for static exports | Custom server-side routing | Next.js per-page HTML generation | `output: 'export'` generates `/page.html` for every route -- no server needed |
| DNS CNAME at apex | Custom DNS proxy/redirect | Cloudflare CNAME flattening | Enabled by default on all Cloudflare plans; transparent and standards-compliant |
| Build pipeline for SWA | Custom Oryx build config | `skip_app_build: true` with pre-built output | Oryx doesn't understand pnpm monorepos well; pre-building is simpler and faster |

**Key insight:** Phase 14 is primarily operational (Azure CLI commands + DNS record management), not code-heavy. The only new files are two `staticwebapp.config.json` files and an initial deploy. Full CI/CD automation comes in Phase 15.

## Common Pitfalls

### Pitfall 1: Cloudflare Orange Cloud Blocks Azure SSL Verification

**What goes wrong:** Custom domain shows as "Validating" indefinitely in Azure portal. SSL certificate is never provisioned. After initial setup works, certificate renewal fails 6 months later.
**Why it happens:** Cloudflare's proxy (orange cloud) intercepts HTTP requests to the domain. DigiCert's HTTP validation at `/.well-known/pki-validation/fileauth.txt` reaches Cloudflare, not Azure, so validation fails.
**How to avoid:** Set CNAME records for `app.feelr.dev` and `feelr.dev` to DNS-only mode (gray cloud) **permanently**. Also keep the `_dnsauth` TXT records permanently as a fallback validation method.
**Warning signs:** Azure portal shows "Validating" for more than 1 hour after DNS propagation; SSL status does not change to "Ready."

### Pitfall 2: Missing TXT Validation Record (_dnsauth)

**What goes wrong:** `az staticwebapp hostname set` command hangs or returns validation error. Domain is never verified.
**Why it happens:** Azure now requires TXT record validation for new custom domains. The TXT record must be at `_dnsauth.app` (for subdomain) or `_dnsauth` (for apex), not at the domain itself.
**How to avoid:** Always use `--validation-method dns-txt-token` when setting hostnames via CLI. Create the TXT record before or immediately after running the hostname set command. Use `--no-wait` to avoid the command blocking.
**Warning signs:** `az staticwebapp hostname set` blocks indefinitely; Cloudflare DNS shows no `_dnsauth` TXT record.

### Pitfall 3: CNAME Flattening Confusion for Apex Domain

**What goes wrong:** Developer tries to create an ALIAS or A record for `feelr.dev` apex domain instead of using Cloudflare's CNAME flattening.
**Why it happens:** Azure docs recommend ALIAS/ANAME records for apex domains, but Cloudflare uses CNAME flattening (a different mechanism that achieves the same result). Cloudflare does not support ALIAS/ANAME record types in its UI.
**How to avoid:** In Cloudflare, create a standard CNAME record with Name `@` and Value `<swa-hostname>.azurestaticapps.net`. Cloudflare automatically flattens this at the zone apex. Set to DNS-only (gray cloud).
**Warning signs:** Cannot find "ALIAS" or "ANAME" record type in Cloudflare DNS UI (these do not exist in Cloudflare; CNAME flattening replaces them).

### Pitfall 4: Turbo Build Outputs Not Cached for Next.js `out/` Directory

**What goes wrong:** Turborepo does not cache Next.js static export output, causing unnecessary rebuilds.
**Why it happens:** The current `turbo.json` specifies `"outputs": ["dist/**"]` for the build task, but Next.js static export outputs to `out/` (not `dist/`). The gateway (Cloudflare Worker) uses `dist/`, but the Next.js apps use `out/`.
**How to avoid:** Update `turbo.json` build outputs to include both: `"outputs": ["dist/**", "out/**"]`. Alternatively, use `.next/**` and `out/**` for more precise caching.
**Warning signs:** `turbo run build --filter=@feelr/dashboard` shows "cache miss" on repeated builds with no changes.

### Pitfall 5: `NEXT_PUBLIC_GATEWAY_URL` Not Set During Production Build

**What goes wrong:** Dashboard loads but cannot connect to the API. All API calls go to `http://localhost:8787` (the default from `config.ts`).
**Why it happens:** `NEXT_PUBLIC_GATEWAY_URL` is a build-time environment variable (Next.js inlines `NEXT_PUBLIC_*` vars at build time). If not set during `next build`, the fallback `http://localhost:8787` is baked into the static output.
**How to avoid:** Set `NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev` as an environment variable during the build step. For Phase 14 (initial deploy), set it manually. Phase 15 will handle environment-aware builds in CI.
**Warning signs:** Browser DevTools Network tab shows requests to `localhost:8787` from the deployed dashboard.

### Pitfall 6: Existing Cloudflare A Records for feelr.dev Apex

**What goes wrong:** After adding the CNAME for apex domain CNAME flattening, the old A records still exist, causing DNS conflict.
**Why it happens:** Phase 11 DNS verification log shows `feelr.dev` resolving to Cloudflare proxy IPs `104.21.59.106` and `172.67.223.12`. These A records (likely auto-generated by Cloudflare for the proxied zone) may conflict with the new CNAME record.
**How to avoid:** Before adding the CNAME for the apex, check and remove any existing A/AAAA records for `feelr.dev` in Cloudflare DNS. Cloudflare does not allow both A and CNAME records at the same name.
**Warning signs:** Cloudflare DNS dashboard shows "record already exists" error when adding CNAME for `@`.

### Pitfall 7: Standard Plan Required for Custom Domains Beyond 2

**What goes wrong:** Cannot add a third custom domain (if needed later).
**Why it happens:** Free plan allows only 2 custom domains per SWA app. Standard plan allows 5. Since each SWA app needs at most 1 custom domain in this phase, Free plan would work -- but Standard is specified in requirements for SLA and future flexibility.
**How to avoid:** Use `--sku Standard` when creating SWA resources as specified in requirements. Standard costs $9/app/month.
**Warning signs:** Azure portal shows "Custom domain limit reached" error.

## Code Examples

Verified patterns from official sources:

### Complete SWA Provisioning Script

```bash
# Source: https://learn.microsoft.com/en-us/cli/azure/staticwebapp

# Prerequisites: az login completed, subscription selected

# 1. Create resource group
az group create --name feelr-rg --location centralus

# 2. Create SWA for dashboard (no GitHub integration)
az staticwebapp create \
  --name feelr-dashboard \
  --resource-group feelr-rg \
  --sku Standard \
  --location centralus

# 3. Create SWA for docs (no GitHub integration)
az staticwebapp create \
  --name feelr-docs \
  --resource-group feelr-rg \
  --sku Standard \
  --location centralus

# 4. Get default hostnames (needed for DNS CNAME targets)
az staticwebapp show --name feelr-dashboard --resource-group feelr-rg \
  --query "defaultHostname" -o tsv
# Output example: purple-river-0ab1c2d3e.3.azurestaticapps.net

az staticwebapp show --name feelr-docs --resource-group feelr-rg \
  --query "defaultHostname" -o tsv
# Output example: happy-meadow-0f1e2d3c.3.azurestaticapps.net

# 5. Get deployment tokens (store as GitHub Actions secrets)
az staticwebapp secrets list --name feelr-dashboard --resource-group feelr-rg \
  --query "properties.apiKey" -o tsv

az staticwebapp secrets list --name feelr-docs --resource-group feelr-rg \
  --query "properties.apiKey" -o tsv
```

### Initial Manual Deploy (Pre-CI/CD)

```bash
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration

# Build dashboard with production gateway URL
cd /home/eternaldays/claudeRepos/feelr
NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev pnpm turbo run build --filter=@feelr/dashboard

# Deploy using SWA CLI (alternative to GitHub Action for initial setup)
npx @azure/static-web-apps-cli deploy apps/dashboard/out \
  --deployment-token <TOKEN_FROM_STEP_5> \
  --env production

# Build docs
pnpm turbo run build --filter=@feelr/docs

# Deploy docs
npx @azure/static-web-apps-cli deploy apps/docs/out \
  --deployment-token <TOKEN_FROM_STEP_5> \
  --env production
```

### Custom Domain Verification -- Complete Sequence

```bash
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external
# Source: https://learn.microsoft.com/en-us/azure/static-web-apps/apex-domain-external

# --- SUBDOMAIN: app.feelr.dev -> feelr-dashboard ---

# Initiate TXT validation (non-blocking)
az staticwebapp hostname set \
  --name feelr-dashboard \
  --hostname app.feelr.dev \
  --validation-method dns-txt-token \
  --no-wait

# Get validation token
DASHBOARD_TOKEN=$(az staticwebapp hostname show \
  --name feelr-dashboard \
  --resource-group feelr-rg \
  --hostname app.feelr.dev \
  --query "validationToken" -o tsv)
echo "Add TXT record: _dnsauth.app -> $DASHBOARD_TOKEN"

# In Cloudflare Dashboard:
#   Type: TXT | Name: _dnsauth.app | Content: $DASHBOARD_TOKEN | TTL: Auto
#   Type: CNAME | Name: app | Content: <dashboard-default-hostname>.azurestaticapps.net | Proxy: DNS only

# --- APEX: feelr.dev -> feelr-docs ---

# Initiate TXT validation (non-blocking)
az staticwebapp hostname set \
  --name feelr-docs \
  --hostname feelr.dev \
  --validation-method dns-txt-token \
  --no-wait

# Get validation token
DOCS_TOKEN=$(az staticwebapp hostname show \
  --name feelr-docs \
  --resource-group feelr-rg \
  --hostname feelr.dev \
  --query "validationToken" -o tsv)
echo "Add TXT record: _dnsauth -> $DOCS_TOKEN"

# In Cloudflare Dashboard:
#   Remove existing A/AAAA records for @ (if any)
#   Type: TXT | Name: _dnsauth | Content: $DOCS_TOKEN | TTL: Auto
#   Type: CNAME | Name: @ | Content: <docs-default-hostname>.azurestaticapps.net | Proxy: DNS only
#   (Cloudflare auto-flattens CNAME at apex)
```

### staticwebapp.config.json for Dashboard

```json
// Source: https://learn.microsoft.com/en-us/azure/static-web-apps/configuration
// NOTE: Do NOT use navigationFallback with Next.js static export
{
  "responseOverrides": {
    "404": {
      "rewrite": "/404.html"
    }
  },
  "globalHeaders": {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  },
  "routes": [
    {
      "route": "/_next/static/*",
      "headers": {
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    }
  ]
}
```

### Verification Commands (Post-Deploy)

```bash
# Verify dashboard loads with valid SSL
curl -sI https://app.feelr.dev | head -5
# Expected: HTTP/2 200, valid SSL handshake

# Verify docs loads with valid SSL
curl -sI https://feelr.dev | head -5
# Expected: HTTP/2 200, valid SSL handshake

# Verify custom domains in Azure
az staticwebapp hostname list --name feelr-dashboard --resource-group feelr-rg
az staticwebapp hostname list --name feelr-docs --resource-group feelr-rg

# Check DNS resolution
curl "https://dns.google/resolve?name=app.feelr.dev&type=CNAME"
curl "https://dns.google/resolve?name=feelr.dev&type=A"
# Apex should return A records (flattened CNAME)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CNAME-only domain validation | TXT token validation (`_dnsauth` prefix) | Early 2024 | Must create TXT record for domain ownership proof before CNAME routing works |
| Azure SWA 1-year certificates | 6-month certificate lifecycle | 2025 | More frequent auto-renewals; DNS config must stay correct for renewal to succeed |
| `routes.json` for SWA config | `staticwebapp.config.json` | Deprecated | Old `routes.json` is ignored if `staticwebapp.config.json` exists |
| SWA Free plan for everything | Standard plan for production | N/A | Standard ($9/mo) adds SLA, 5 custom domains, 10 staging environments |
| SWA Dedicated plan | Retired | October 31, 2025 | Dedicated plan no longer available; use Standard instead |

**Deprecated/outdated:**
- `routes.json`: Replaced by `staticwebapp.config.json`; ignored if both exist
- CNAME-only domain validation: TXT validation now required for new domains
- SWA Dedicated plan: Retired October 2025; use Standard

## Open Questions

1. **Azure subscription and resource group naming**
   - What we know: Azure CLI commands require a resource group. The project does not appear to have existing Azure infrastructure.
   - What's unclear: Whether the user has an Azure subscription, what resource group name to use, what region to prefer
   - Recommendation: Use `feelr-rg` in `centralus` as defaults. The plan should include a human checkpoint for Azure login and subscription setup.

2. **Existing A/AAAA records for feelr.dev apex**
   - What we know: DNS verification log shows `feelr.dev` resolving to `104.21.59.106` and `172.67.223.12` (Cloudflare proxy IPs). These are likely auto-generated by Cloudflare when the zone was created.
   - What's unclear: Whether these are explicit A records or Cloudflare-generated proxy records that will be automatically removed when proxy is disabled
   - Recommendation: Check Cloudflare DNS dashboard for explicit A/AAAA records at `@` before adding the CNAME. Remove any that exist.

3. **SWA app naming collision**
   - What we know: SWA app names must be globally unique within Azure (they form part of the default hostname)
   - What's unclear: Whether `feelr-dashboard` and `feelr-docs` are available
   - Recommendation: Try the preferred names; if taken, use `feelr-app-dashboard` and `feelr-app-docs` as fallbacks.

4. **Turbo build cache for `out/` directory**
   - What we know: Current `turbo.json` caches `dist/**` but not `out/**`. Next.js static export outputs to `out/`.
   - What's unclear: Whether updating turbo.json is in scope for Phase 14 or should wait for Phase 15
   - Recommendation: Fix `turbo.json` outputs in Phase 14 since it affects build correctness. Add `"out/**"` to the build task outputs.

## Sources

### Primary (HIGH confidence)
- [Azure Static Web Apps Custom Domain (External Provider)](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external) - Subdomain CNAME + TXT verification flow
- [Azure Static Web Apps Apex Domain (External Provider)](https://learn.microsoft.com/en-us/azure/static-web-apps/apex-domain-external) - Apex domain ALIAS/CNAME flattening + TXT verification
- [Azure Static Web Apps Custom Domains Overview](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain) - TXT validation requirement, SSL auto-provisioning
- [Azure Static Web Apps Build Configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration) - `skip_app_build`, `output_location`, pre-built deployment pattern
- [Azure CLI `az staticwebapp` Reference](https://learn.microsoft.com/en-us/cli/azure/staticwebapp?view=azure-cli-latest) - `create`, `secrets list`, `hostname set/show/list`
- [Azure CLI `az staticwebapp hostname` Reference](https://learn.microsoft.com/en-us/cli/azure/staticwebapp/hostname?view=azure-cli-latest) - `--validation-method dns-txt-token`, `--no-wait`
- [Azure Static Web Apps Plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans) - Free vs Standard feature comparison
- [Azure Static Web Apps Configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration) - `staticwebapp.config.json` schema, `navigationFallback`, `responseOverrides`
- [Next.js on Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs) - `IS_STATIC_EXPORT`, `output: 'export'`, output directory
- [Cloudflare CNAME Flattening](https://developers.cloudflare.com/dns/cname-flattening/) - Default behavior on all plans, zone apex support
- [SWA CLI `swa deploy` Reference](https://azure.github.io/static-web-apps-cli/docs/cli/swa-deploy/) - `--deployment-token`, `--output-location`, `--env`

### Secondary (MEDIUM confidence)
- [Azure SWA Certificate Renewal with Cloudflare](https://learn.microsoft.com/en-us/answers/questions/5517292/azure-static-web-app-certificate-renewal-failing-t) - Gray cloud requirement, `_dnsauth` TXT permanence, 6-month cert lifecycle
- [Azure/static-web-apps-deploy GitHub Action](https://github.com/Azure/static-web-apps-deploy) - @v1 latest, Oryx-based with skip options
- [Azure Static Web Apps Pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/) - Standard plan at $9/app/month

### Verified via Project Files (HIGH confidence)
- `apps/dashboard/next.config.ts` - `output: 'export'` already configured, `images.unoptimized: true`
- `apps/docs/next.config.mjs` - `output: 'export'` already configured via Nextra wrapper
- `apps/dashboard/package.json` - Next.js ^15.3.0, build script `next build`
- `apps/docs/package.json` - Next.js ^15.3.0, Nextra ^4.2.0, build script `next build`
- `apps/dashboard/src/config.ts` - `NEXT_PUBLIC_GATEWAY_URL` env var with `http://localhost:8787` fallback
- `apps/dashboard/out/` - Existing static export output (index.html, connectors.html, keys.html, etc.)
- `apps/dashboard/.gitignore` - `/out/` is gitignored (must be built in CI)
- `turbo.json` - Build outputs currently `dist/**` only (needs `out/**` added)
- `.planning/phases/11-dns-cloudflare-zone-setup-cicd-audit/11-01-dns-verification.log` - Cloudflare nameservers confirmed (braden.ns + ruth.ns), feelr.dev resolving to Cloudflare IPs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools are official Azure/Microsoft tooling verified against current docs
- Architecture: HIGH - Patterns verified against multiple official Microsoft Learn docs and confirmed with project file analysis
- Pitfalls: HIGH - Cloudflare+Azure SWA proxy issue confirmed by multiple Microsoft Q&A threads and Cloudflare community posts; TXT validation requirement confirmed in official docs
- Domain verification: HIGH - CLI commands verified against `az staticwebapp hostname` reference docs
- turbo.json fix: HIGH - Verified by reading actual turbo.json (outputs `dist/**`) and Next.js config (`output: 'export'` -> `out/`)

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- Azure SWA and Cloudflare DNS are stable services with infrequent breaking changes)
