# Feelr Deployment Runbook

> **CI/CD is the primary deployment mechanism.** Use these procedures for first-time setup, emergency manual deploys, and reference. See `.github/workflows/` for the automated pipelines.

**Last verified:** 2026-02-10

---

## Prerequisites

### Required Tools

| Tool | Version | Install |
|------|---------|---------|
| wrangler | v4+ | `pnpm add -g wrangler` |
| az CLI | latest | [Install Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) |
| gh CLI | latest | [Install GitHub CLI](https://cli.github.com/) |
| pnpm | latest | `corepack enable && corepack prepare pnpm@latest --activate` |
| Node.js | 20 | [Download](https://nodejs.org/) or use `nvm install 20` |
| Go | 1.22+ | [Download](https://go.dev/dl/) |

### Required Accounts

- **Cloudflare** -- feelr.dev zone ownership (DNS + Workers)
- **Azure** -- Active subscription for Azure Static Web Apps
- **GitHub** -- Member of `progradetech` organization with write access to `progradetech/feelr`

### Required CLI Authentication

```bash
wrangler login          # Opens browser for Cloudflare OAuth
az login                # Opens browser for Azure OAuth
gh auth login           # Interactive GitHub authentication
```

---

## 1. First-Time Setup

End-to-end guide for deploying all Feelr services from scratch.

### 1.1 Cloudflare Account & DNS

Cloudflare is the DNS authority for `feelr.dev` and hosts the gateway Worker.

1. **Zone setup:** Create a zone for `feelr.dev` in Cloudflare Dashboard (already completed in Phase 11).

2. **Nameserver delegation:** Update nameservers at domain registrar (Namecheap) to Cloudflare-assigned nameservers (`braden.ns.cloudflare.com` and `ruth.ns.cloudflare.com`).

3. **SSL/TLS configuration:**
   - Set SSL/TLS mode to **Full** in Cloudflare Dashboard > SSL/TLS > Overview.
   - `.dev` domains enforce HSTS at the TLD level, so HTTPS is mandatory.

4. **Verify propagation:**
   ```bash
   dig NS feelr.dev +short
   # Should return Cloudflare nameservers
   ```

### 1.2 Gateway Resources (KV, D1, DO)

The gateway requires KV namespaces and D1 databases for each environment. Resource IDs are stored in `apps/gateway/wrangler.toml`.

**Create KV namespaces:**

```bash
npx wrangler kv namespace create AUTH_KV --env staging
npx wrangler kv namespace create AUTH_KV --env production
```

Record the returned namespace IDs and update `apps/gateway/wrangler.toml` under the corresponding `[[env.staging.kv_namespaces]]` and `[[env.production.kv_namespaces]]` sections.

**Create D1 databases:**

```bash
npx wrangler d1 create feelr-usage-staging
npx wrangler d1 create feelr-usage-production
```

Record the returned database IDs and update `apps/gateway/wrangler.toml` under the corresponding `[[env.staging.d1_databases]]` and `[[env.production.d1_databases]]` sections.

**Run D1 migrations:**

```bash
npx wrangler d1 migrations apply USAGE_DB --env staging
npx wrangler d1 migrations apply USAGE_DB --env production
```

Migration files are located in `apps/gateway/migrations/`.

**Durable Objects:** The `TokenCoordinator` Durable Object is auto-created on first deploy via the `[[migrations]]` section in `apps/gateway/wrangler.toml`. No manual creation is needed.

### 1.3 Gateway Secrets

Secrets are set per-environment. Staging and production **must** use different values.

**Required secrets (both environments):**

```bash
# Generate and set encryption key
openssl rand -base64 32 | npx wrangler secret put ENCRYPTION_KEY --env staging
openssl rand -base64 32 | npx wrangler secret put ENCRYPTION_KEY --env production

# Generate and set admin token
openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN --env staging
openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN --env production
```

**Optional secrets (OAuth connectors):**

```bash
# Slack OAuth (from Slack app dashboard: https://api.slack.com/apps)
npx wrangler secret put SLACK_CLIENT_ID --env staging
npx wrangler secret put SLACK_CLIENT_SECRET --env staging
npx wrangler secret put SLACK_CLIENT_ID --env production
npx wrangler secret put SLACK_CLIENT_SECRET --env production
```

**Optional secrets (production only -- billing):**

```bash
# Stripe (from Stripe dashboard: https://dashboard.stripe.com/apikeys)
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
```

### 1.4 Azure SWA Provisioning

The dashboard and docs sites are hosted on Azure Static Web Apps (Standard plan required for custom domains).

```bash
# Register the resource provider (one-time per subscription)
az provider register --namespace Microsoft.Web --wait

# Create resource group
az group create --name feelr-rg --location eastus2

# Create dashboard SWA
az staticwebapp create \
  --name feelr-dashboard \
  --resource-group feelr-rg \
  --sku Standard \
  --location eastus2

# Create docs SWA
az staticwebapp create \
  --name feelr-docs \
  --resource-group feelr-rg \
  --sku Standard \
  --location eastus2
```

Both SWAs require **Standard** plan (not Free) to support custom domain binding.

### 1.5 Azure SWA Custom Domains

> **IMPORTANT:** DNS-only mode (gray cloud) is **mandatory** for all SWA CNAME records in Cloudflare. Enabling the Cloudflare proxy (orange cloud) breaks Azure's managed SSL certificate provisioning.

**Dashboard (`app.feelr.dev`):**

1. Get the default hostname for the dashboard SWA from Azure Portal or CLI.

2. Add DNS records in Cloudflare Dashboard (DNS-only mode -- gray cloud):
   - **CNAME:** `app.feelr.dev` -> SWA default hostname
   - **TXT:** `_dnsauth.app.feelr.dev` -> validation token from Azure

3. Get the validation token:
   ```bash
   az staticwebapp hostname show \
     --name feelr-dashboard \
     --hostname app.feelr.dev
   ```

4. Map the custom domain:
   ```bash
   az staticwebapp hostname set \
     --name feelr-dashboard \
     --hostname app.feelr.dev
   ```

5. `_dnsauth` TXT records are **permanent** -- Azure uses them for managed SSL certificate renewal.

**Docs (`feelr.dev`):**

1. Add DNS records in Cloudflare Dashboard (DNS-only mode -- gray cloud):
   - **CNAME:** `feelr.dev` -> SWA default hostname (Cloudflare CNAME flattening at apex)
   - **TXT:** `_dnsauth.feelr.dev` -> validation token from Azure

2. Get the validation token:
   ```bash
   az staticwebapp hostname show \
     --name feelr-docs \
     --hostname feelr.dev
   ```

3. Map the custom domain:
   ```bash
   az staticwebapp hostname set \
     --name feelr-docs \
     --hostname feelr.dev
   ```

### 1.6 GitHub Actions Secrets

Retrieve SWA deployment tokens:

```bash
az staticwebapp secrets list \
  --name feelr-dashboard \
  --query "properties.apiKey" -o tsv

az staticwebapp secrets list \
  --name feelr-docs \
  --query "properties.apiKey" -o tsv
```

Set secrets in the `progradetech/feelr` repository:

```bash
# Cloudflare credentials (from Cloudflare Dashboard > My Profile > API Tokens)
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID

# Azure SWA deployment tokens (from az CLI output above)
gh secret set SWA_DASHBOARD_DEPLOYMENT_TOKEN
gh secret set SWA_DOCS_DEPLOYMENT_TOKEN

# Homebrew tap token (PAT with repo scope for andrewprograde/homebrew-tap)
gh secret set HOMEBREW_TAP_GITHUB_TOKEN
```

### 1.7 First Deployment

**Gateway:**

```bash
# Deploy staging
cd apps/gateway && npx wrangler deploy --env staging

# Deploy production
cd apps/gateway && npx wrangler deploy --env production

# Verify
curl https://feelr-gateway-staging.feelr.workers.dev/health
curl https://api.feelr.dev/health
```

Both should return a healthy response.

**Dashboard:**

```bash
NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev pnpm turbo run build --filter=@feelr/dashboard
```

Deploy via CI (push to main) or manually using the SWA CLI.

**Docs:**

```bash
pnpm turbo run build --filter=@feelr/docs
```

Deploy via CI (push to main) or manually using the SWA CLI.

---

## 2. Routine Deployments

CI/CD handles all routine deployments automatically. These sections describe what each workflow does and how to trigger manual deploys if needed.

### 2.1 Gateway Staging (automatic on push to main)

| Attribute | Value |
|-----------|-------|
| **Trigger** | Push to `main` affecting `apps/gateway/**`, `packages/**`, or `connectors/**` |
| **Workflow** | `.github/workflows/gateway.yml` (deploy-staging job) |
| **Concurrency group** | `deploy-staging` (shared with CI gateway-preview to prevent races) |
| **Verification** | Automatic smoke test: `https://feelr-gateway-staging.feelr.workers.dev/health` |

**Manual deploy:**

```bash
cd apps/gateway && npx wrangler deploy --env staging
```

### 2.2 Gateway Production (automatic on tag push)

| Attribute | Value |
|-----------|-------|
| **Trigger** | Push of `v*` tag |
| **Workflow** | `.github/workflows/gateway.yml` (deploy-production job) |
| **Approval** | GitHub environment approval gate on `production` environment |
| **Rollout** | `versions upload` -> 10% canary -> smoke test -> 100% rollout |

**Process:**

1. CI uploads a new version via `wrangler versions upload --env production`
2. Deploys at 10% traffic (canary)
3. Runs smoke test against `https://api.feelr.dev/health`
4. Promotes to 100% traffic on success

> **WARNING:** If the release includes new `[[migrations]]` in `apps/gateway/wrangler.toml` (e.g., a new Durable Object class), `versions upload` will fail. Use `npx wrangler deploy --env production` directly for DO migration releases. This bypasses the gradual rollout but is the only option for migration changes.

**Manual deploy (gradual rollout):**

```bash
cd apps/gateway

# Upload version
npx wrangler versions upload --env production --tag v1.x.x --message "Release v1.x.x"

# Get the version ID
VERSION_ID=$(npx wrangler versions list --env production --json --name feelr-gateway-production | jq -r '.[0].id')

# Deploy at 10%
npx wrangler versions deploy "${VERSION_ID}@10%" --env production --yes --message "Canary at 10%"

# Verify health
curl https://api.feelr.dev/health

# Promote to 100%
npx wrangler versions deploy "${VERSION_ID}@100%" --env production --yes --message "Full rollout"
```

### 2.3 Dashboard & Docs (automatic on push to main / tag push)

**Dashboard:**

| Attribute | Value |
|-----------|-------|
| **Staging trigger** | Push to `main` affecting `apps/dashboard/**` or `packages/tsconfig/**` |
| **Production trigger** | Push of `v*` tag (with environment approval gate) |
| **Workflow** | `.github/workflows/dashboard.yml` |
| **Build env** | Staging: `NEXT_PUBLIC_GATEWAY_URL=https://feelr-gateway-staging.feelr.workers.dev` |
| | Production: `NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev` |

**Docs:**

| Attribute | Value |
|-----------|-------|
| **Staging trigger** | Push to `main` affecting `apps/docs/**` |
| **Production trigger** | Push of `v*` tag (with environment approval gate) |
| **Workflow** | `.github/workflows/docs.yml` |
| **Build env** | No gateway URL needed (pure content site) |

Both workflows build the Next.js static export, copy `staticwebapp.config.json` into the `out/` directory, and deploy to Azure SWA. Staging deploys use `deployment_environment: staging`; production deploys omit it to target the default production slot.

### 2.4 CLI Release (automatic on tag push)

| Attribute | Value |
|-----------|-------|
| **Trigger** | Push of `v*` tag |
| **Workflow** | `.github/workflows/release.yml` |
| **Build** | GoReleaser builds binaries for linux/darwin/windows (amd64/arm64) |
| **Distribution** | GitHub Releases + Homebrew tap (`andrewprograde/homebrew-tap`) |

GoReleaser configuration is at `.goreleaser.yaml`. The `HOMEBREW_TAP_GITHUB_TOKEN` secret is required to push the Homebrew formula.

---

## 3. Rollback Procedures

### 3.1 Gateway Rollback

Cloudflare Workers maintains up to 100 versions of rollback history.

**List recent versions:**

```bash
npx wrangler versions list --env production --json
```

**Rollback to a specific version:**

```bash
npx wrangler rollback <VERSION_ID> --env production --yes --message "Rollback: <reason>"
```

**Interactive rollback (shows 10 most recent versions):**

```bash
npx wrangler rollback --env production
```

> **CRITICAL WARNING: Durable Object Migration Constraint**
>
> You **cannot** rollback across Durable Object migration boundaries. If a release included new `[[migrations]]` tags in `apps/gateway/wrangler.toml`, rollback to pre-migration versions is **blocked by Cloudflare**. The only option is to **fix-forward** -- deploy a new version that includes the fix.
>
> This is a Cloudflare platform constraint, not a configuration issue. Plan DO migrations carefully and test thoroughly in staging before production.

### 3.2 SWA Rollback (Dashboard / Docs)

Azure Static Web Apps has **no native rollback mechanism**. Use one of these approaches:

**Option A: Git revert (preferred -- triggers CI auto-deploy):**

```bash
git revert <BAD_COMMIT_SHA>
git push origin main
# CI automatically deploys the reverted code
```

**Option B: Manual redeploy of known-good commit:**

```bash
# Dashboard example
git checkout <GOOD_COMMIT_SHA>
NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev pnpm turbo run build --filter=@feelr/dashboard
cp apps/dashboard/staticwebapp.config.json apps/dashboard/out/
npx @azure/static-web-apps-cli deploy apps/dashboard/out --deployment-token <TOKEN>
git checkout main  # Return to main branch
```

For docs, the process is the same but without the `NEXT_PUBLIC_GATEWAY_URL` env var and using `@feelr/docs` as the filter.

### 3.3 CLI Rollback

The CLI is a client binary with no server-side state.

- **GitHub Releases:** Delete the bad release from the GitHub Releases page. Users on a prior version are unaffected.
- **Homebrew:** Remove the bad formula from the `andrewprograde/homebrew-tap` repository, or users can install a specific prior version.
- **Direct downloads:** Users who downloaded the binary directly are unaffected until they manually update.

---

## 4. Troubleshooting

Each entry follows the pattern: **Symptom** -> **Cause** -> **Fix**.

### 4.1 Gateway Issues

**`wrangler deploy` fails with "could not find binding"**
- **Cause:** Missing KV namespace or D1 database in `apps/gateway/wrangler.toml` for the target environment.
- **Fix:** Verify resource IDs in `apps/gateway/wrangler.toml` match actual Cloudflare resources:
  ```bash
  npx wrangler kv namespace list
  npx wrangler d1 list
  ```

**`versions upload` fails with migration error**
- **Cause:** New `[[migrations]]` tag present in `apps/gateway/wrangler.toml`. The `versions upload` command does not support Durable Object migrations.
- **Fix:** Use `npx wrangler deploy --env production` directly. This bypasses the gradual rollout but is required for DO migration releases.

**Health check returns 500 after deploy**
- **Cause:** Missing or expired Worker secrets (`ENCRYPTION_KEY`, `ADMIN_TOKEN`).
- **Fix:** Check and reset secrets:
  ```bash
  npx wrangler secret list --env <ENV>
  npx wrangler secret put <NAME> --env <ENV>
  ```

**OAuth token refresh fails**
- **Cause:** `SLACK_CLIENT_ID` or `SLACK_CLIENT_SECRET` not set or expired for the target environment.
- **Fix:** Verify secrets are set for the correct environment. Regenerate from the [Slack app dashboard](https://api.slack.com/apps) if needed.

### 4.2 SWA Issues

**SWA deploy succeeds but site shows old content**
- **Cause:** Browser cache or CDN cache.
- **Fix:** Hard refresh (`Ctrl+Shift+R`), or wait approximately 5 minutes for CDN propagation.

**Custom domain shows SSL error**
- **Cause:** Cloudflare proxy (orange cloud) is enabled on the CNAME record.
- **Fix:** Set the CNAME to DNS-only mode (gray cloud) in Cloudflare Dashboard. Azure SWA manages its own SSL certificates and the Cloudflare proxy interferes with this.

**Custom domain validation fails**
- **Cause:** `_dnsauth` TXT record is missing or has an incorrect value.
- **Fix:** Check the expected validation token and update DNS:
  ```bash
  az staticwebapp hostname show \
    --name <SWA_NAME> \
    --hostname <DOMAIN>
  ```

**Dashboard shows "Failed to fetch" or network errors**
- **Cause:** `NEXT_PUBLIC_GATEWAY_URL` was set to the wrong value during the build.
- **Fix:** Rebuild with the correct env var for the target environment:
  - Staging: `NEXT_PUBLIC_GATEWAY_URL=https://feelr-gateway-staging.feelr.workers.dev`
  - Production: `NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev`

### 4.3 CI/CD Issues

**Workflow does not trigger on push to main**
- **Cause:** Path filter in the workflow YAML does not match the changed files.
- **Fix:** Check the `paths:` section in the relevant workflow file (`.github/workflows/`) against the actual files changed in the push.

**Two deploys race on staging**
- **Cause:** Concurrency group conflict between CI preview and staging deploy.
- **Fix:** This is handled by design. Both `ci.yml` (gateway-preview job) and `gateway.yml` (deploy-staging job) share the `deploy-staging` concurrency group with `cancel-in-progress: false`. Deploys will queue, not race.

**Production deploy blocked / waiting**
- **Cause:** GitHub environment approval gate (expected behavior for production).
- **Fix:** Approve the deployment in the GitHub Actions UI under the `production` environment.

### 4.4 DNS & SSL Issues

**`api.feelr.dev` not resolving**
- **Cause:** Cloudflare custom domain not yet propagated, or Worker route not configured.
- **Fix:** Verify the production route in `apps/gateway/wrangler.toml`:
  ```toml
  [[env.production.routes]]
  pattern = "api.feelr.dev"
  custom_domain = true
  ```
  Check Cloudflare DNS for the corresponding record.

**SSL certificate error on `feelr.dev` or `app.feelr.dev`**
- **Cause:** Azure managed SSL certificate not yet provisioned (can take up to 24 hours), or CNAME is proxied through Cloudflare.
- **Fix:** Ensure DNS-only mode (gray cloud) on the CNAME record. Wait for Azure to provision the managed certificate. Check status:
  ```bash
  az staticwebapp hostname show \
    --name <SWA_NAME> \
    --hostname <DOMAIN>
  ```
