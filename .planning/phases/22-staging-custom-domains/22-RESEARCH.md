# Phase 22: Staging Custom Domains - Research

**Researched:** 2026-02-11
**Domain:** Multi-environment infrastructure (DNS, CI/CD, access control, health checks)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Every push to main triggers staging deployment (continuous deployment)
- Manual workflow_dispatch also available for re-deploying without code push
- Path-filtered independently -- only the service whose code changed gets deployed
- If staging deploy fails, the workflow fails (pipeline shows red)
- Production-equivalent behavior with verbose error responses (same rate limits, but detailed error messages instead of generic ones)
- Separate test credentials for connector API keys/tokens -- staging must not touch production external services
- Prominent banner on staging dashboard showing "You're on staging" -- informational only, no link to production
- Cloudflare Access with email-based OTP protecting all three staging services (gateway, dashboard, docs)
- Only specific email addresses allowed through (configured per-user, not open to any email)
- Automated health checks in CI after each staging deploy -- hits health endpoints, fails workflow if unhealthy
- Health check depth: just HTTP 200 (basic liveness check)
- Unauthenticated /health endpoint exempt from CF Access -- allows CI and monitoring tools to check freely
- On failure: just fail the workflow, no external notifications

### Claude's Discretion
- Whether CI/CD needs a CF Access service token (depends on whether deploy flow hits staging URLs)
- Exact banner styling and placement on staging dashboard
- Health endpoint implementation details per service
- DNS record configuration approach
- Azure SWA custom domain binding specifics

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

Phase 22 connects all three staging services (gateway, dashboard, docs) to custom subdomains under `feelr.dev` and adds access control, health checks, and CI/CD automation. The infrastructure foundation is well-understood from milestone research: the gateway gets a `custom_domain = true` route in `wrangler.toml`; the dashboard and docs each need a dedicated Azure SWA Standard instance (because Azure does NOT support custom domains on preview environments). Phase 22 adds several layers on top of this infrastructure: Cloudflare Access with email OTP, `/health` endpoint bypasses, staging-specific error verbosity, a staging banner component, and post-deploy health checks in CI.

The most significant technical challenge is the **Cloudflare Access vs Azure SWA DNS conflict**. CF Access requires proxied DNS (orange cloud) to intercept traffic, but Azure SWA custom domain validation historically requires DNS-only (gray cloud) CNAME records. The solution is a two-phase DNS setup: validate with a TXT record first, keep the TXT record permanently for certificate renewals, then enable Cloudflare proxy on the CNAME for Access enforcement. For the gateway, this conflict does not exist -- Cloudflare Workers custom domains are natively proxied through Cloudflare.

A second key design point: the CI/CD health checks do NOT need a CF Access service token. The `/health` endpoint is explicitly exempt from CF Access (user decision). This is achieved by creating a separate CF Access application for the `/health` path with a Bypass policy, which means `jtalk/url-health-check-action` can hit the health endpoint without any authentication headers.

**Primary recommendation:** Implement in this order: (1) wrangler.toml custom domain for gateway, (2) create SWA staging instances + DNS + custom domains for dashboard/docs, (3) configure CF Access for all three staging subdomains with `/health` bypass, (4) add `/health` endpoints to dashboard and docs, (5) update CI/CD workflows with new tokens + health checks + verbose error config, (6) add staging banner to dashboard.

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Cloudflare Workers (Wrangler) | 4.63.0 (already installed) | Custom domain for staging-api.feelr.dev | `custom_domain = true` in `[[env.staging.routes]]` auto-manages DNS and SSL. Already proven in production env config. |
| Azure Static Web Apps (Standard) | N/A (Azure resource) | 2 new SWA instances for staging-app and staging-docs | Azure SWA does NOT support custom domains on preview environments. Separate instances are the only path to custom staging subdomains. Standard plan ($9/mo each) required for custom domain support. |
| Azure/static-web-apps-deploy | v1 | GitHub Actions deployment to SWA | Already in use. New staging instances use the same action with new deployment tokens and NO `deployment_environment` parameter. |
| Cloudflare Access (Zero Trust) | N/A (Cloudflare service) | Email OTP access control for all staging services | Free tier supports up to 50 users. Email OTP requires no IdP integration -- just enable One-time PIN in authentication settings and configure Allow policies with email selectors. |
| cloudflare/wrangler-action | v3 | Deploy gateway to Cloudflare Workers | Already in use. No changes needed to the action itself. |
| jtalk/url-health-check-action | v4 | Post-deploy health checks in CI | Already in use for gateway staging smoke test. Extend to dashboard and docs. Does NOT support custom HTTP headers, only cookies and basic-auth -- but this is fine because `/health` is exempt from CF Access. |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| Cloudflare DNS | N/A | CNAME + TXT records for staging subdomains | Configure DNS records for SWA custom domains. Use TXT validation + permanent TXT record for certificate renewals. |
| dorny/paths-filter | v3 | Path-based filtering in CI workflows | Already used in ci.yml. Reference pattern for adding path filtering to staging deploy workflows. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloudflare Access (email OTP) | Azure SWA built-in password protection | SWA password protection is simpler (just set a password in Azure Portal) but only supports a single shared password, not per-user email OTP. User decided on CF Access for per-user control. |
| CF Access Bypass for /health | CF Access Service Token for health checks | Service token adds secret management complexity. Since health endpoints are basic liveness checks returning no sensitive data, Bypass is simpler and avoids CI needing extra headers. |
| jtalk/url-health-check-action | curl in a run step | The action provides retry logic, configurable delays, and clean failure reporting. Reimplementing with curl is more verbose for no benefit. |

**Installation:**
```bash
# No new npm packages. All infrastructure is Azure/Cloudflare resources + GitHub Actions.
```

## Architecture Patterns

### Environment Topology (After Phase 22)

```
                    PRODUCTION                           STAGING (CF Access protected)
                    ----------                           -------
Gateway:    api.feelr.dev                      staging-api.feelr.dev
            (CF Worker, --env production)      (CF Worker, --env staging)
            custom_domain = true               custom_domain = true (NEW)

Dashboard:  app.feelr.dev                     staging-app.feelr.dev
            (Azure SWA, production instance)   (Azure SWA, staging instance) (NEW)

Docs:       feelr.dev                          staging-docs.feelr.dev
            (Azure SWA, production instance)   (Azure SWA, staging instance) (NEW)
```

### Pattern 1: Cloudflare Workers Custom Domain per Environment

**What:** Add `[[env.staging.routes]]` with `custom_domain = true` to `wrangler.toml`.
**When to use:** Assigning a subdomain to a Cloudflare Workers environment where the zone is on Cloudflare.
**Example:**
```toml
# Source: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
[env.staging]
workers_dev = true  # Keep .workers.dev as fallback

[[env.staging.routes]]
pattern = "staging-api.feelr.dev"
custom_domain = true
```

Key detail: Cloudflare auto-creates the DNS record when `custom_domain = true` is set. No manual CNAME creation needed for the gateway. The DNS record is automatically proxied (orange cloud), which means CF Access works immediately.

### Pattern 2: Separate Azure SWA Instance with TXT + CNAME Validation

**What:** Create a dedicated Azure SWA Standard instance, validate its custom domain using TXT record, then add a CNAME.
**When to use:** Any time you need a custom domain on a non-production Azure SWA environment.
**Why:** Azure SWA does NOT support custom domains on preview/staging environments (confirmed: open feature request since 2020, still unresolved).
**Implementation steps:**
1. Create SWA Standard instance in Azure Portal (deployment source: "Other")
2. Copy the deployment token, store as GitHub Actions secret
3. In Cloudflare DNS: add TXT record `_dnsauth.staging-app` pointing to Azure's validation token
4. In Cloudflare DNS: add CNAME record `staging-app` pointing to `<swa-hostname>.azurestaticapps.net` -- initially set to DNS-only (gray cloud) for validation
5. In Azure Portal: add custom domain `staging-app.feelr.dev`, wait for validation
6. After validation succeeds: switch CNAME to Proxied (orange cloud) in Cloudflare DNS to enable CF Access
7. **Keep the TXT record permanently** -- Azure uses it for 6-month certificate renewals

### Pattern 3: CF Access Application with Path-Based Bypass for /health

**What:** Create a CF Access self-hosted application covering each staging subdomain, then create a second application for the `/health` path with a Bypass policy.
**When to use:** Protecting a staging environment while keeping health check endpoints publicly accessible.
**Why:** CF Access evaluates the most-specific application first. A `/health` path application with Bypass takes precedence over the parent domain's Allow policy.
**Implementation in Cloudflare Zero Trust dashboard:**

For each staging subdomain:
1. **Main application** (e.g., "Feelr Staging API"):
   - Application domain: `staging-api.feelr.dev`
   - Policy action: Allow
   - Include rule: Emails -- list specific allowed email addresses
   - Authentication: One-time PIN (OTP)

2. **Health bypass application** (e.g., "Feelr Staging API Health"):
   - Application domain: `staging-api.feelr.dev`
   - Path: `/health`
   - Policy action: Bypass
   - Include rule: Everyone

CF Access processes the more specific `/health` path first, bypassing authentication. All other paths require email OTP.

### Pattern 4: Staging Dashboard Banner

**What:** A `StagingBanner` component conditionally rendered when `NEXT_PUBLIC_GATEWAY_URL` contains "staging".
**When to use:** Indicating to developers that they are on the staging environment.
**Why:** Follows the existing `DemoBanner` pattern in the codebase.
**Example:**
```tsx
// Source: follows pattern from apps/dashboard/src/components/demo-banner.tsx
'use client';

import { AlertTriangle } from 'lucide-react';
import { GATEWAY_URL } from '@/config';

export function StagingBanner() {
  const isStaging = GATEWAY_URL.includes('staging');
  if (!isStaging) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-900/40 border-b border-amber-800/50 px-4 py-2">
      <AlertTriangle className="h-4 w-4 text-amber-400" />
      <span className="text-sm text-amber-200">
        You are on staging
      </span>
    </div>
  );
}
```

The banner uses amber colors (distinct from the blue DemoBanner) and is informational only -- no link to production. It is rendered in the dashboard layout alongside the existing DemoBanner.

### Pattern 5: Verbose Error Responses in Staging

**What:** Include stack traces and full error details in error responses when `ENVIRONMENT === 'staging'`.
**When to use:** Debugging issues on the staging environment.
**Implementation approach:** Modify the `errorHandler` in `apps/gateway/src/middleware/error-handler.ts` to include additional `detail` fields (stack trace, original error message) when the environment is staging. The `wrapError` function already supports an optional `detail` field. For unknown errors, staging returns `err.message` and `err.stack` in the detail; production returns the generic "An unexpected error occurred" message.

```typescript
// In errorHandler, for unknown errors:
const isStaging = c.env.ENVIRONMENT === 'staging';
const body = wrapError({
  code: 'INTERNAL_ERROR',
  message: isStaging ? (err instanceof Error ? err.message : 'An unexpected error occurred') : 'An unexpected error occurred',
  hint: 'retry',
  status: 500,
  detail: isStaging && err instanceof Error ? err.stack : undefined,
});
```

This gives staging verbose errors while production remains generic, using the existing `ENVIRONMENT` binding and `detail` field.

### Pattern 6: Static Health Check for SWA Apps

**What:** A static `/health` page in the Next.js dashboard and docs apps that returns HTTP 200.
**When to use:** Providing a basic liveness check endpoint for static sites.
**Why:** Next.js with `output: 'export'` cannot have dynamic API routes. A static HTML page at `/health` serves as an HTTP 200 indicator. The health check only needs to verify the site is deployed and serving -- not that APIs are functional.
**Implementation:**
```
apps/dashboard/src/app/health/page.tsx  --> exports a simple component returning "ok"
apps/docs/app/health/page.tsx           --> same pattern
```

Both produce a static HTML page at `/health` in the export output. The `jtalk/url-health-check-action` checks for HTTP 200, which any served HTML page returns.

### Anti-Patterns to Avoid

- **Using `deployment_environment: staging` for custom domains:** Azure SWA does NOT support custom domains on preview environments. Must use separate instances.
- **Enabling Cloudflare proxy (orange cloud) before Azure SWA validation:** Will cause validation to fail. Use TXT validation first, CNAME as DNS-only during validation, then switch to proxied after.
- **Adding CF Access service token to CI for health checks:** Unnecessary complexity. The `/health` endpoint is bypassed from CF Access by design.
- **Using Azure SWA built-in password protection alongside CF Access:** Choose one. CF Access provides superior per-user control and covers the gateway too (SWA password protection only covers SWA).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Access control for staging | Custom auth middleware | Cloudflare Access with email OTP | CF Access is a free, managed service with OTP built in. No code to maintain, no token rotation, no password management. |
| Health check CI step | Custom curl + retry bash script | jtalk/url-health-check-action@v4 | Already used in gateway workflow. Handles retries, delay, and failure reporting. |
| DNS record management | Terraform/Pulumi IaC | Cloudflare Dashboard + Azure Portal (manual) | Only 3 DNS records + 2 SWA custom domains. IaC overhead exceeds the 10-minute manual setup for a one-time operation. |
| Staging environment detection | Custom env variable check in every component | Single `StagingBanner` component using existing `NEXT_PUBLIC_GATEWAY_URL` | The gateway URL already distinguishes staging from production. No new env var needed. |

**Key insight:** This phase is primarily infrastructure configuration (DNS, Azure Portal, CF Zero Trust dashboard) with minimal code changes. The code changes are: (1) wrangler.toml route addition, (2) error handler verbosity toggle, (3) staging banner component, (4) health check pages, (5) workflow YAML updates. Do not over-engineer the code side.

## Common Pitfalls

### Pitfall 1: Cloudflare Access Requires Proxied DNS (Conflicts with Azure SWA Validation)

**What goes wrong:** CF Access only works on proxied (orange cloud) DNS records. Azure SWA custom domain validation fails if the CNAME is proxied because Azure sees Cloudflare IPs instead of its own hostname.
**Why it happens:** Two Cloudflare features (DNS-only for SWA compatibility, Proxied for Access) have conflicting DNS requirements.
**How to avoid:** Use this sequence: (1) Add TXT record for Azure validation, (2) Add CNAME as DNS-only, (3) Complete Azure validation, (4) Switch CNAME to Proxied, (5) Keep TXT record permanently for 6-month cert renewals. CF Access can be configured before or after the DNS switch.
**Warning signs:** Azure Portal shows custom domain in "Validating" state indefinitely. Check CNAME proxy status in Cloudflare.

### Pitfall 2: Azure SWA Certificate Renewal Fails After Switching to Proxied

**What goes wrong:** Azure SWA issues 6-month certificates. When renewal time comes, Azure cannot validate the domain because the CNAME is proxied through Cloudflare.
**Why it happens:** Azure's DigiCert validation cannot see the underlying SWA hostname through Cloudflare's proxy.
**How to avoid:** Keep the `_dnsauth.staging-app` TXT record permanently in Cloudflare DNS. Azure uses the TXT record as a fallback validation path for renewals.
**Warning signs:** Certificate expiry warnings from Azure. Set a calendar reminder to check every 5 months.

### Pitfall 3: Deploying to Wrong SWA Instance

**What goes wrong:** The staging workflow job uses the production SWA deployment token, deploying staging code to production.
**Why it happens:** Copy-paste error when updating `azure_static_web_apps_api_token` secret names.
**How to avoid:** Use clearly differentiated secret names: `SWA_DASHBOARD_STAGING_TOKEN` vs `SWA_DASHBOARD_DEPLOYMENT_TOKEN`. Add comments in workflow YAML identifying which instance each token targets.
**Warning signs:** Content appears at the wrong URL after deploy.

### Pitfall 4: Staging Dashboard Built with Production API URL

**What goes wrong:** The staging dashboard makes API calls to `api.feelr.dev` (production) instead of `staging-api.feelr.dev`.
**Why it happens:** `NEXT_PUBLIC_GATEWAY_URL` env var not updated in the staging build step of `dashboard.yml`.
**How to avoid:** Change the staging build env from `https://feelr-gateway-staging.feelr.workers.dev` to `https://staging-api.feelr.dev`.
**Warning signs:** Network tab in browser dev tools shows requests going to `api.feelr.dev` when on the staging dashboard.

### Pitfall 5: Health Check Blocked by CF Access

**What goes wrong:** The CI health check after deploy fails with 403 because CF Access intercepts the `/health` request.
**Why it happens:** The CF Access Bypass application for `/health` was not created, or it was created on the wrong domain/path.
**How to avoid:** Create a separate CF Access application for each staging subdomain's `/health` path with a Bypass policy. Verify the path is correct (`/health`, not `/health/` or `health`).
**Warning signs:** jtalk/url-health-check-action reports HTTP 403 in CI logs.

### Pitfall 6: Gateway `workers_dev` URL Confusion After Adding Custom Domain

**What goes wrong:** After adding `custom_domain = true` for staging, the old `feelr-gateway-staging.feelr.workers.dev` URL still works. Health checks or references pointing to the old URL bypass CF Access because `.workers.dev` is a separate domain.
**Why it happens:** Setting `workers_dev = true` alongside a custom domain creates two access points.
**How to avoid:** Decide whether to keep `workers_dev = true` as a fallback. If CF Access is meant to protect staging, consider setting `workers_dev = false` after custom domain is confirmed working. The CI health check should use the custom domain URL, not the workers.dev URL.
**Warning signs:** Users accessing staging without CF Access challenge via the workers.dev URL.

## Code Examples

### Wrangler.toml Staging Custom Domain Addition

```toml
# Source: existing apps/gateway/wrangler.toml + Cloudflare custom domain docs
# Add to [env.staging] section (currently only has workers_dev = true):

[env.staging]
workers_dev = false  # Disable workers.dev URL -- staging uses custom domain + CF Access

[[env.staging.routes]]
pattern = "staging-api.feelr.dev"
custom_domain = true
```

Note: Setting `workers_dev = false` ensures all staging traffic goes through the custom domain (and thus through CF Access). The workers.dev URL would be an unprotected backdoor if left enabled.

### Dashboard Workflow Staging Job Changes

```yaml
# Source: existing .github/workflows/dashboard.yml
# Changes to deploy-staging job:

      - name: Build dashboard (staging)
        run: pnpm turbo run build --filter=@feelr/dashboard
        env:
          NEXT_PUBLIC_GATEWAY_URL: https://staging-api.feelr.dev  # Changed from workers.dev URL

      - name: Deploy to SWA staging
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.SWA_DASHBOARD_STAGING_TOKEN }}  # New token
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: apps/dashboard/out
          output_location: ""
          skip_app_build: true
          # NO deployment_environment -- this is the production slot of the staging SWA instance

      - name: Smoke test staging dashboard
        uses: jtalk/url-health-check-action@v4
        with:
          url: https://staging-app.feelr.dev/health
          max-attempts: 3
          retry-delay: 5s
```

### Gateway Workflow: Add workflow_dispatch

```yaml
# Source: existing .github/workflows/gateway.yml
# Add workflow_dispatch to the on: triggers:

on:
  push:
    branches: [main]
    paths:
      - "apps/gateway/**"
      - "packages/**"
      - "connectors/**"
    tags:
      - "v*"
  workflow_dispatch:  # NEW: allows manual re-deploy
```

### Health Check Page for Dashboard

```tsx
// apps/dashboard/src/app/health/page.tsx
// Static page -- produces /health/index.html in export output
export default function HealthPage() {
  return (
    <html>
      <body>ok</body>
    </html>
  );
}
```

Note: This intentionally produces a minimal HTML page. The health check only cares about HTTP 200. For docs, the equivalent is `apps/docs/app/health/page.tsx` (same pattern).

### Error Handler Verbose Mode

```typescript
// Source: apps/gateway/src/middleware/error-handler.ts
// Modify the unknown error handler to include details in staging:

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const isStaging = c.env.ENVIRONMENT === 'staging';

  if (err instanceof FeelrError) {
    const body = wrapError({
      code: err.code,
      message: err.message,
      hint: err.hint,
      status: err.status,
      detail: err.detail,
    });
    return c.json(body, err.status);
  }

  if (err instanceof HTTPException) {
    const body = wrapError({
      code: 'INTERNAL_ERROR',
      message: isStaging ? err.message : 'An unexpected error occurred',
      hint: 'retry',
      status: 500,
      detail: isStaging ? `HTTPException: ${err.message}` : undefined,
    });
    return c.json(body, 500);
  }

  // Unknown error
  console.error('Unhandled error:', err);
  const body = wrapError({
    code: 'INTERNAL_ERROR',
    message: isStaging && err instanceof Error ? err.message : 'An unexpected error occurred',
    hint: 'retry',
    status: 500,
    detail: isStaging && err instanceof Error ? err.stack : undefined,
  });
  return c.json(body, 500);
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Azure SWA CNAME-only validation | TXT record validation (now preferred for Cloudflare users) | 2024-2025 | TXT validation + permanent TXT record allows CNAME to be proxied. Eliminates cert renewal issues with Cloudflare. |
| Azure SWA 1-year certificates | 6-month certificates | 2025+ | More frequent renewals. TXT record retention is more important than ever. |
| Manual password protection for staging | CF Access email OTP | Available since Zero Trust launch | Per-user access control without shared passwords. Supports audit logging. |

**Deprecated/outdated:**
- Using `deployment_environment: staging` and expecting custom domain support -- Azure SWA has never supported this and the feature request remains open since 2020.
- Using CNAME-only validation for Azure SWA with Cloudflare proxy -- this worked intermittently but fails on certificate renewals. TXT validation is the reliable path.

## Discretion Recommendations

### CI/CD Service Token: NOT NEEDED

**Recommendation:** Do not create a CF Access service token for CI/CD.

**Reasoning:** The deploy flow does NOT hit staging URLs:
- Gateway deploy uses `wrangler deploy --env staging` via API token -- this talks to the Cloudflare API, not the Worker's public URL
- Dashboard/docs deploy uses `Azure/static-web-apps-deploy@v1` via SWA deployment token -- this talks to Azure's deployment API, not the site's public URL
- The only time CI hits the staging URL is the health check, and `/health` is explicitly exempt from CF Access via Bypass policy

**Conclusion:** No service token needed. Zero additional secrets.

### Banner Styling and Placement

**Recommendation:** Amber-colored horizontal bar at the top of the dashboard layout, rendered alongside the existing `DemoBanner`.

**Reasoning:** The `DemoBanner` uses blue (`bg-blue-900/40`). Using amber (`bg-amber-900/40`) for the staging banner creates visual distinction. The banner should appear in the `(dashboard)/layout.tsx` component, ABOVE the DemoBanner (staging context is more important than demo mode). Amber is universally associated with "warning/attention" which suits a staging indicator.

### Health Endpoint Implementation

**Recommendation:**
- **Gateway:** Already has `/health` returning `{ ok: true, version: '1.0.0' }`. No changes needed -- just ensure the CF Access Bypass covers this path.
- **Dashboard:** Add `apps/dashboard/src/app/health/page.tsx` as a static page. Returns minimal HTML. HTTP 200 confirms the SWA is serving content.
- **Docs:** Add `apps/docs/app/health/page.tsx` as a static page. Same pattern as dashboard.

### DNS Record Configuration

**Recommendation:** For each SWA subdomain, use TXT-first validation:

| Record | Type | Name | Value | Proxy Status |
|--------|------|------|-------|--------------|
| 1 | TXT | `_dnsauth.staging-app` | (from Azure Portal) | N/A (TXT records are never proxied) |
| 2 | CNAME | `staging-app` | `<dashboard-staging-swa>.azurestaticapps.net` | DNS-only initially, then Proxied after validation |
| 3 | TXT | `_dnsauth.staging-docs` | (from Azure Portal) | N/A |
| 4 | CNAME | `staging-docs` | `<docs-staging-swa>.azurestaticapps.net` | DNS-only initially, then Proxied after validation |
| 5 | (auto) | `staging-api` | (auto-created by Workers custom_domain) | Proxied (automatic) |

**Sequence:**
1. Create both SWA instances in Azure Portal
2. Add TXT records in Cloudflare DNS
3. Add CNAME records as DNS-only (gray cloud)
4. In Azure Portal, add custom domains and wait for validation
5. After validation succeeds, switch both CNAMEs to Proxied (orange cloud)
6. Configure CF Access applications

### Azure SWA Custom Domain Binding

**Recommendation:** Use Standard plan ($9/mo per instance), deployment source "Other" (GitHub Actions manages deploys externally).

| Instance Name | Custom Domain | Deployment Token Secret |
|---------------|---------------|------------------------|
| `feelr-dashboard-staging` | `staging-app.feelr.dev` | `SWA_DASHBOARD_STAGING_TOKEN` |
| `feelr-docs-staging` | `staging-docs.feelr.dev` | `SWA_DOCS_STAGING_TOKEN` |

### Gateway `workers_dev` Setting

**Recommendation:** Set `workers_dev = false` for staging after custom domain is confirmed working.

**Reasoning:** With `workers_dev = true`, the `.workers.dev` URL (`feelr-gateway-staging.feelr.workers.dev`) remains accessible and is NOT protected by CF Access. This creates an unprotected backdoor to the staging gateway. Setting `workers_dev = false` ensures all staging traffic routes through `staging-api.feelr.dev` (which is behind CF Access, with `/health` bypassed).

## Open Questions

1. **Azure SWA default hostnames for staging instances**
   - What we know: Format is `<instance-name>-<hash>.<location>.azurestaticapps.net`. Exact hostnames are only known after creating the instances in Azure Portal.
   - What's unclear: The exact hostnames (needed for CNAME records).
   - Recommendation: Create the instances first, note the hostnames, then configure DNS. This is a one-time manual step.

2. **Cloudflare Access free tier limits**
   - What we know: Free tier supports up to 50 users. Email OTP is available on the free tier.
   - What's unclear: Whether there are any rate limits on OTP email delivery that could affect developer access.
   - Recommendation: Proceed with free tier. 50 users is more than enough for a staging environment with specific email allowlisting.

3. **Next.js static health page routing**
   - What we know: A page at `app/health/page.tsx` with `output: 'export'` produces `out/health/index.html`. Azure SWA serves this at `/health` (trailing slash handling is configurable).
   - What's unclear: Whether Azure SWA's default routing handles `/health` -> `health/index.html` without explicit config.
   - Recommendation: Azure SWA handles this natively for static sites. The existing `staticwebapp.config.json` only has a 404 override and caching headers -- default routing covers `/health` fine. Verify after first deploy.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- `custom_domain = true` configuration, DNS auto-management, zone requirements
- [Cloudflare Workers Environments](https://developers.cloudflare.com/workers/wrangler/environments/) -- per-environment routes, naming conventions, inherited vs non-inherited keys
- [Cloudflare Access Policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/) -- Bypass action, Service Auth action, policy evaluation order
- [Cloudflare Access Service Tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) -- CI/CD authentication, header requirements
- [Cloudflare Access One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) -- Email OTP setup, no configuration needed
- [Azure SWA Custom Domains](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain) -- Custom domain limitations, TXT validation
- [Azure SWA Custom Domain External](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external) -- CNAME setup with external DNS providers
- [Azure SWA Named Environments](https://learn.microsoft.com/en-us/azure/static-web-apps/named-environments) -- Confirms custom domains NOT supported on preview environments
- [Azure SWA Password Protection](https://learn.microsoft.com/en-us/azure/static-web-apps/password-protection) -- Built-in staging protection (not used, but documented as alternative)
- [Azure SWA Feature Request #22](https://github.com/Azure/static-web-apps/issues/22) -- Custom domain for staging, open since 2020

### Secondary (MEDIUM confidence)
- [Azure SWA Certificate Renewal with Cloudflare](https://learn.microsoft.com/en-us/answers/questions/5517292/azure-static-web-app-certificate-renewal-failing-t) -- TXT record permanent retention for renewals
- [Cloudflare Access Path Bypass](https://community.cloudflare.com/t/cloudflare-access-exclude-path-from-authentication/204893) -- Community confirmation of separate application + Bypass pattern
- [Cloudflare Access Path Bypass Blog](https://zaengle.com/blog/the-key-to-letting-specific-urls-bypass-cloudflare-access) -- Detailed walkthrough of path-based bypass
- [jtalk/url-health-check-action](https://github.com/Jtalk/url-health-check-action) -- action.yml verified: supports url, max-attempts, retry-delay, cookie, basic-auth (no custom headers)

### Tertiary (LOW confidence)
- None. All findings verified against official docs or community sources with corroboration.

### Verified via Project Files (HIGH confidence)
- `apps/gateway/wrangler.toml` -- staging env uses `workers_dev = true`, no custom domain yet, production has `custom_domain = true`
- `apps/gateway/src/app.ts:92-94` -- existing `/health` endpoint returning `{ ok: true, version: '1.0.0' }`
- `apps/gateway/src/middleware/error-handler.ts` -- existing error handler with `wrapError()`, optional `detail` field
- `apps/gateway/src/lib/types.ts:20` -- `ENVIRONMENT` binding available in `AppEnv`
- `apps/dashboard/src/components/demo-banner.tsx` -- existing banner pattern (blue, conditional rendering, layout placement)
- `apps/dashboard/src/app/(dashboard)/layout.tsx` -- DemoBanner placement in dashboard layout
- `apps/dashboard/src/config.ts` -- `GATEWAY_URL` from `NEXT_PUBLIC_GATEWAY_URL`
- `.github/workflows/gateway.yml` -- staging deploy uses wrangler-action, smoke test uses jtalk/url-health-check-action
- `.github/workflows/dashboard.yml` -- staging deploy uses `deployment_environment: staging` with `SWA_DASHBOARD_DEPLOYMENT_TOKEN`
- `.github/workflows/docs.yml` -- staging deploy uses `deployment_environment: staging` with `SWA_DOCS_DEPLOYMENT_TOKEN`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all technologies already in use or are managed Cloudflare/Azure services with official documentation
- Architecture: HIGH -- Azure SWA limitation confirmed by official docs and 6-year-old unresolved feature request; CF Access + path bypass pattern confirmed by multiple sources
- Pitfalls: HIGH -- DNS conflict between CF Access and Azure SWA validated against official docs and community reports; TXT validation workaround confirmed

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable infrastructure patterns, Azure SWA limitation unlikely to change)
