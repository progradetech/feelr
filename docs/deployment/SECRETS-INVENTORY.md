# Feelr Secrets Inventory

> **WARNING:** This document catalogs secret metadata only. Never add actual secret values, API keys, or tokens to this file.

This inventory documents every deployment secret across all systems. Use it to understand what secrets exist, where they are stored, who uses them, and how to rotate them.

## Summary Table

| Secret | System | Environment | Critical | Rotation Complexity |
|--------|--------|-------------|----------|---------------------|
| CLOUDFLARE_API_TOKEN | GitHub Actions | All | Yes | Low |
| CLOUDFLARE_ACCOUNT_ID | GitHub Actions | All | No | N/A (immutable) |
| SWA_DASHBOARD_DEPLOYMENT_TOKEN | GitHub Actions | All | Yes | Low |
| SWA_DOCS_DEPLOYMENT_TOKEN | GitHub Actions | All | Yes | Low |
| HOMEBREW_TAP_GITHUB_TOKEN | GitHub Actions | Release | Yes | Low |
| GITHUB_TOKEN | GitHub Actions | All | No | Auto (per-run) |
| ENCRYPTION_KEY | Cloudflare Worker | Staging + Production | Yes | High (re-encrypt) |
| ADMIN_TOKEN | Cloudflare Worker | Staging + Production | Yes | Medium |
| SLACK_CLIENT_ID | Cloudflare Worker | Staging + Production | Yes | Medium |
| SLACK_CLIENT_SECRET | Cloudflare Worker | Staging + Production | Yes | Medium |
| STRIPE_SECRET_KEY | Cloudflare Worker | Production | Yes | Medium |
| STRIPE_WEBHOOK_SECRET | Cloudflare Worker | Production | Yes | Medium |

---

## Section 1: GitHub Actions Repository Secrets

**Organization:** progradetech | **Repository:** feelr

These secrets are stored as GitHub Actions repository secrets and are available to all workflows in the repository.

### CLOUDFLARE_API_TOKEN

- **What:** Cloudflare API token with Workers, KV, and D1 edit permissions
- **Where stored:** GitHub Actions repository secret
- **Used by:** `gateway.yml` (staging + production deploys), `ci.yml` (gateway-preview)
- **Scope:** Single Cloudflare account, single zone (feelr.dev)
- **Required permissions:**
  - Account > Workers Scripts > Edit
  - Account > Workers KV Storage > Edit
  - Account > D1 > Edit
- **Rotation procedure:**
  1. Create new token in Cloudflare Dashboard > My Profile > API Tokens with the same permissions listed above
  2. Update the GitHub secret: `gh secret set CLOUDFLARE_API_TOKEN --body "<NEW_TOKEN>"`
  3. Trigger a staging deploy to verify the new token works (push a trivial change or re-run the workflow)
  4. Delete the old token in Cloudflare Dashboard > My Profile > API Tokens
- **Impact if compromised:** Attacker can deploy code to Workers, read/write KV data, and read/write D1 databases

### CLOUDFLARE_ACCOUNT_ID

- **What:** Cloudflare account identifier (not truly secret, but stored as a secret for consistency)
- **Where stored:** GitHub Actions repository secret
- **Used by:** `gateway.yml`, `ci.yml`
- **Scope:** Identifies the Cloudflare account; does not grant access on its own
- **Rotation:** Cannot rotate -- tied to the Cloudflare account. If the account is compromised, create a new Cloudflare account.
- **Impact if compromised:** Low alone. Combined with an API token, it identifies which account to target for deployments.

### SWA_DASHBOARD_DEPLOYMENT_TOKEN

- **What:** Azure Static Web Apps deployment token for the `feelr-dashboard` SWA resource
- **Where stored:** GitHub Actions repository secret
- **Used by:** `dashboard.yml` (staging + production deploys), `scripts/deploy-dashboard.sh`
- **Retrieval:**
  ```bash
  az staticwebapp secrets list --name feelr-dashboard --query "properties.apiKey" -o tsv
  ```
- **Rotation procedure:**
  1. Reset the API key: `az staticwebapp secrets reset-api-key --name feelr-dashboard --resource-group feelr-rg`
  2. Retrieve the new token: `az staticwebapp secrets list --name feelr-dashboard --query "properties.apiKey" -o tsv`
  3. Update the GitHub secret: `gh secret set SWA_DASHBOARD_DEPLOYMENT_TOKEN --body "<NEW_TOKEN>"`
  4. Trigger a dashboard staging deploy to verify
- **Impact if compromised:** Attacker can deploy arbitrary content to the dashboard Static Web App

### SWA_DOCS_DEPLOYMENT_TOKEN

- **What:** Azure Static Web Apps deployment token for the `feelr-docs` SWA resource
- **Where stored:** GitHub Actions repository secret
- **Used by:** `docs.yml` (staging + production deploys), `scripts/deploy-docs.sh`
- **Retrieval:**
  ```bash
  az staticwebapp secrets list --name feelr-docs --query "properties.apiKey" -o tsv
  ```
- **Rotation procedure:**
  1. Reset the API key: `az staticwebapp secrets reset-api-key --name feelr-docs --resource-group feelr-rg`
  2. Retrieve the new token: `az staticwebapp secrets list --name feelr-docs --query "properties.apiKey" -o tsv`
  3. Update the GitHub secret: `gh secret set SWA_DOCS_DEPLOYMENT_TOKEN --body "<NEW_TOKEN>"`
  4. Trigger a docs staging deploy to verify
- **Impact if compromised:** Attacker can deploy arbitrary content to the docs Static Web App

### HOMEBREW_TAP_GITHUB_TOKEN

- **What:** GitHub Personal Access Token (classic) with `repo` scope for `andrewprograde/homebrew-tap`
- **Where stored:** GitHub Actions repository secret
- **Used by:** `release.yml` (GoReleaser pushes Homebrew formula to the tap repo)
- **Scope:** Full `repo` scope on the `andrewprograde/homebrew-tap` repository
- **Rotation procedure:**
  1. Generate a new PAT at https://github.com/settings/tokens (classic, with `repo` scope)
  2. Update the GitHub secret: `gh secret set HOMEBREW_TAP_GITHUB_TOKEN --body "<NEW_TOKEN>"`
  3. Tag a new release to verify the Homebrew formula is pushed successfully
  4. Delete the old PAT at https://github.com/settings/tokens
- **Impact if compromised:** Attacker can push arbitrary Homebrew formulas to the tap repository

### GITHUB_TOKEN

- **What:** Automatic GitHub Actions token (provided by GitHub, not manually configured)
- **Where stored:** Auto-generated per workflow run
- **Used by:** All workflows (PR comments, GitHub Releases, SWA `repo_token` parameter)
- **Rotation:** Automatic -- a new token is generated for each workflow run and expires when the workflow completes
- **Permissions:** Scoped to the repository, with permissions defined in each workflow YAML file
- **Impact if compromised:** Scoped to the repository for the duration of the workflow run. No long-term exposure.

---

## Section 2: Cloudflare Worker Secrets

These secrets are set per-environment using `npx wrangler secret put <NAME> --env <ENV>`. Each environment (staging, production) has its own independent set of values.

### ENCRYPTION_KEY

- **What:** AES-256-GCM encryption key for stored credentials in the auth vault
- **Where stored:** Cloudflare Worker secret (per-environment)
- **Used by:** Gateway encrypt/decrypt operations for stored OAuth tokens and API keys
- **Environments:** Staging and Production (separate keys for each)
- **Generate:**
  ```bash
  openssl rand -base64 32
  ```
- **Set (staging):**
  ```bash
  npx wrangler secret put ENCRYPTION_KEY --env staging
  ```
- **Set (production):**
  ```bash
  npx wrangler secret put ENCRYPTION_KEY --env production
  ```
- **Rotation procedure:**
  1. Generate a new key: `openssl rand -base64 32`
  2. Set the new key: `npx wrangler secret put ENCRYPTION_KEY --env <ENV>`
  3. **WARNING:** Existing encrypted credentials become unreadable after rotation. You must re-store all connector credentials (OAuth tokens, API keys) after changing this key.
- **Impact if compromised:** Attacker can decrypt all stored OAuth tokens and API keys in the auth vault

### ADMIN_TOKEN

- **What:** Bearer token for admin API endpoints (key management, credential management)
- **Where stored:** Cloudflare Worker secret (per-environment)
- **Used by:** Dashboard authentication, admin API routes (`/internal/*`)
- **Environments:** Staging and Production (separate tokens for each)
- **Generate:**
  ```bash
  openssl rand -hex 32
  ```
- **Set (staging):**
  ```bash
  npx wrangler secret put ADMIN_TOKEN --env staging
  ```
- **Set (production):**
  ```bash
  npx wrangler secret put ADMIN_TOKEN --env production
  ```
- **Rotation procedure:**
  1. Generate a new token: `openssl rand -hex 32`
  2. Set the new token: `npx wrangler secret put ADMIN_TOKEN --env <ENV>`
  3. Update the dashboard's stored admin token (used for login)
- **Impact if compromised:** Full admin access to API key management and credential management endpoints

### SLACK_CLIENT_ID

- **What:** Slack OAuth app client ID
- **Where stored:** Cloudflare Worker secret (per-environment)
- **Used by:** Slack OAuth flow in the Slack connector
- **Environments:** Staging and Production (can use the same Slack app or separate apps)
- **Set:**
  ```bash
  npx wrangler secret put SLACK_CLIENT_ID --env <ENV>
  ```
- **Rotation procedure:**
  1. Regenerate credentials in the Slack API Dashboard (https://api.slack.com/apps)
  2. Update the Worker secret: `npx wrangler secret put SLACK_CLIENT_ID --env <ENV>`
  3. Also update `SLACK_CLIENT_SECRET` at the same time (they are paired)
- **Impact if compromised:** Attacker can initiate OAuth flows impersonating the Feelr Slack app (limited without the client secret)

### SLACK_CLIENT_SECRET

- **What:** Slack OAuth app client secret
- **Where stored:** Cloudflare Worker secret (per-environment)
- **Used by:** Slack OAuth flow in the Slack connector
- **Environments:** Staging and Production
- **Set:**
  ```bash
  npx wrangler secret put SLACK_CLIENT_SECRET --env <ENV>
  ```
- **Rotation procedure:**
  1. Regenerate credentials in the Slack API Dashboard (https://api.slack.com/apps)
  2. Update the Worker secret: `npx wrangler secret put SLACK_CLIENT_SECRET --env <ENV>`
  3. Also update `SLACK_CLIENT_ID` at the same time (they are paired)
- **Impact if compromised:** Attacker can complete OAuth flows as the Feelr Slack app, gaining access to user Slack workspaces

### STRIPE_SECRET_KEY

- **What:** Stripe API secret key for billing and usage metering
- **Where stored:** Cloudflare Worker secret (production environment only)
- **Used by:** Billing connector, usage metering
- **Environments:** Production only (Stripe is optional and only enabled for cloud-hosted billing)
- **Set:**
  ```bash
  npx wrangler secret put STRIPE_SECRET_KEY --env production
  ```
- **Rotation procedure:**
  1. Roll the API key in Stripe Dashboard > Developers > API keys
  2. Update the Worker secret: `npx wrangler secret put STRIPE_SECRET_KEY --env production`
  3. Verify billing operations still work by checking the Stripe Dashboard event log
- **Impact if compromised:** Attacker can access billing data, create charges, and manage subscriptions

### STRIPE_WEBHOOK_SECRET

- **What:** Stripe webhook signature verification secret
- **Where stored:** Cloudflare Worker secret (production environment only)
- **Used by:** Webhook endpoint for Stripe event verification
- **Environments:** Production only
- **Set:**
  ```bash
  npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
  ```
- **Rotation procedure:**
  1. Go to Stripe Dashboard > Webhooks > select the Feelr endpoint
  2. Roll the signing secret
  3. Update the Worker secret: `npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production`
  4. Send a test webhook from the Stripe Dashboard to verify signature validation
- **Impact if compromised:** Attacker can forge webhook events, potentially triggering false billing actions

---

## Section 3: Azure SWA Deployment Tokens

These tokens are the same as the GitHub Actions secrets in Section 1 (`SWA_DASHBOARD_DEPLOYMENT_TOKEN` and `SWA_DOCS_DEPLOYMENT_TOKEN`). They are listed here for reference when using the manual deployment scripts.

### Dashboard Deployment Token

```bash
# Retrieve current token
az staticwebapp secrets list --name feelr-dashboard --query "properties.apiKey" -o tsv

# Reset and retrieve new token
az staticwebapp secrets reset-api-key --name feelr-dashboard --resource-group feelr-rg
az staticwebapp secrets list --name feelr-dashboard --query "properties.apiKey" -o tsv
```

### Docs Deployment Token

```bash
# Retrieve current token
az staticwebapp secrets list --name feelr-docs --query "properties.apiKey" -o tsv

# Reset and retrieve new token
az staticwebapp secrets reset-api-key --name feelr-docs --resource-group feelr-rg
az staticwebapp secrets list --name feelr-docs --query "properties.apiKey" -o tsv
```

---

## Section 4: External Service Credentials

These credentials are used for manual operations and are not stored in CI/CD. They are managed by individual team members.

### Cloudflare Account

- **What:** Cloudflare account login (email/password + 2FA)
- **Used for:** Managing DNS records, Workers, KV, D1, API tokens via the Cloudflare Dashboard
- **Access:** https://dash.cloudflare.com
- **2FA:** Enabled (required for account security)
- **Recovery:** Cloudflare account recovery process; backup codes should be stored securely

### Azure Subscription

- **What:** Azure subscription credentials
- **Used for:** Managing Static Web Apps, resource groups, and other Azure resources
- **Access:** `az login` (opens browser-based authentication)
- **Subscription:** Contains the `feelr-rg` resource group
- **Recovery:** Azure AD account recovery

### GitHub CLI Authentication

- **What:** GitHub authentication for the `gh` CLI tool
- **Used for:** Managing repository secrets, creating releases, PR operations
- **Access:** `gh auth login` (opens browser-based authentication)
- **Note:** Optional -- you can also use a Personal Access Token via `GITHUB_TOKEN` env var
- **Recovery:** GitHub account recovery; 2FA backup codes
