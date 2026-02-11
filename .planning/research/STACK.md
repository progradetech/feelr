# Technology Stack: Staging Custom Domains & Branding Integration

**Project:** Feelr -- Staging subdomains (staging-app, staging-docs, staging-api) and branding assets (favicon, logo, manifest) across dashboard and docs
**Researched:** 2026-02-11
**Confidence:** HIGH (verified against Azure docs, Next.js 15 docs, Cloudflare docs, existing codebase)

---

## Executive Summary

This milestone has two independent workstreams: (1) staging custom domains and (2) branding/favicon integration. They share no dependencies and can be phased in any order.

**Staging custom domains** requires a critical architecture decision. Azure Static Web Apps does NOT support custom domains on preview/staging environments -- this is a confirmed, longstanding limitation (feature request open since May 2020, still unresolved). The recommended workaround is to create **separate SWA instances** dedicated to staging, each with its own deployment token and custom domain. This means 2 new Azure SWA resources (one for staging-app.feelr.dev, one for staging-docs.feelr.dev), 2 new GitHub Actions secrets, and 2 new Cloudflare DNS CNAME records. The gateway staging domain (staging-api.feelr.dev) is straightforward -- Cloudflare Workers natively supports per-environment custom domains via `wrangler.toml` route configuration.

**Branding integration** requires one new dev dependency: `sharp` (v0.34.x) as a build-time script to convert the existing SVG logomark into PNG/ICO favicon assets. Next.js 15 App Router supports file-based favicon conventions (place `favicon.ico` in `app/`, place `icon.svg` in `app/`) and a `manifest.ts` file that generates `manifest.webmanifest` at build time. Nextra 4, being App Router-based, supports the same file conventions. The Nextra `<Head>` component's `faviconGlyph` prop must be removed/replaced with standard Next.js file-based icons.

Total new npm dependencies: **1 (sharp, dev only)**. Total new Azure resources: **2 (SWA Standard instances)**. Total new DNS records: **3 (CNAME for staging-app, staging-docs, staging-api)**.

---

## Recommended Stack

### Staging Domains -- Azure SWA (Dashboard + Docs)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Azure Static Web Apps (Standard) | N/A (Azure resource) | Separate SWA instances for staging dashboard and staging docs | Azure SWA does NOT support custom domains on preview environments. The only way to get `staging-app.feelr.dev` and `staging-docs.feelr.dev` is to create dedicated SWA resources with production-slot custom domains. Standard plan required for custom domains ($9/month/app). |
| Azure/static-web-apps-deploy | v1 | GitHub Actions deployment | Already in use. New staging workflows use the same action with new deployment tokens (`SWA_DASHBOARD_STAGING_TOKEN`, `SWA_DOCS_STAGING_TOKEN`). No `deployment_environment` parameter needed because staging SWA instances treat their deploy as "production" (the custom domain slot). |
| Cloudflare DNS | N/A | CNAME records for staging subdomains | Already the DNS authority for `feelr.dev`. Add DNS-only (gray cloud) CNAME records pointing `staging-app.feelr.dev` and `staging-docs.feelr.dev` to the respective SWA default hostnames. Same pattern as existing `app.feelr.dev` and `feelr.dev` records. |

### Staging Domains -- Cloudflare Workers (Gateway)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Wrangler | 4.63.0 (already installed) | Deploy staging Worker with custom domain | Add `[[env.staging.routes]]` with `pattern = "staging-api.feelr.dev"` and `custom_domain = true` to `wrangler.toml`. Cloudflare Workers natively supports per-environment custom domains. Set `workers_dev = false` on staging after custom domain is verified (or keep `true` for redundancy). |
| Cloudflare DNS | N/A | DNS record for staging-api subdomain | Cloudflare Workers custom domains auto-create DNS records when `custom_domain = true` is set. No manual CNAME creation needed -- Cloudflare handles this internally since it controls both Workers and DNS for `feelr.dev`. |

### Branding -- Favicon/Icon Generation (Build-Time)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| sharp | ^0.34.5 | SVG-to-PNG/ICO conversion at build time | The industry standard for Node.js image processing. Converts `feelr-logomark.svg` to `favicon.ico` (32x32), `icon-192.png`, `icon-512.png`, and `apple-icon.png` (180x180). Installed as root devDependency. Used in a one-time generation script, not at runtime. |

### Branding -- Next.js Dashboard (File-Based Icons + Manifest)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js file-based icons | 15.3+ (already installed) | favicon.ico, icon.svg, apple-icon.png | Next.js App Router automatically detects `favicon.ico` in `app/`, `icon.svg` in `app/`, and `apple-icon.png` in `app/`, then injects the correct `<link>` tags into `<head>`. Zero configuration. Works with `output: 'export'`. |
| Next.js manifest.ts | 15.3+ (already installed) | Web app manifest generation | A `manifest.ts` file in `app/` exports a function returning a `MetadataRoute.Manifest` object. Generates `/manifest.webmanifest` at build time. Must include `export const dynamic = 'force-static'` for compatibility with `output: 'export'`. |
| Next.js metadata API | 15.3+ (already installed) | OpenGraph images, theme-color | Extend existing `metadata` export in `layout.tsx` with `icons` and `manifest` fields. The `metadataBase` (already set to `https://app.feelr.dev`) ensures absolute URLs for OG images. |

### Branding -- Nextra Docs (File-Based Icons)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js file-based icons | 15.3+ (via Nextra 4) | favicon.ico, icon.svg, apple-icon.png | Nextra 4 uses Next.js App Router. The same file-based conventions work: place `favicon.ico` and `icon.svg` in the `app/` directory. Remove the `faviconGlyph` prop from `<Head>` if currently set. |
| Nextra `<Head>` component | 4.2+ (already installed) | Custom head tags | The `<Head>` component accepts children for static head tags. Use it to add `<link rel="manifest">` and theme-color meta tags if not handled by Next.js metadata API. Alternatively, export `metadata` from `layout.tsx` with `icons` configuration (preferred -- standard Next.js approach). |
| Nextra Navbar `logo` prop | 4.2+ (already installed) | Logo in docs navigation | Replace `<b>Feelr</b>` text logo with `<Image>` component rendering `feelr-logo.svg` (or inline SVG). The Navbar accepts any ReactNode for `logo`. |

---

## Critical Architecture Decision: Separate SWA Instances for Staging

### Why NOT use Azure SWA `deployment_environment: staging`

The existing workflows already deploy to `deployment_environment: staging` within a single SWA instance per app. This gives a URL like:

```
<default-hostname>-staging.<location>.azurestaticapps.net
```

**This URL cannot have a custom domain.** Azure explicitly does not support custom domains on preview/staging environments. This is documented, confirmed, and has been a known limitation since 2020 (GitHub issue #22 on Azure/static-web-apps, still open with no timeline).

### Recommended: Dedicated Staging SWA Instances

Create two new Azure SWA resources in the Azure Portal:

| Resource | SKU | Custom Domain | Deployment Source |
|----------|-----|--------------|-------------------|
| `feelr-dashboard-staging` | Standard ($9/mo) | `staging-app.feelr.dev` | Other (manual via GitHub Actions) |
| `feelr-docs-staging` | Standard ($9/mo) | `staging-docs.feelr.dev` | Other (manual via GitHub Actions) |

Each gets its own deployment token. GitHub Actions workflows deploy to these instances using the existing `Azure/static-web-apps-deploy@v1` action but with new tokens and NO `deployment_environment` parameter (so deploys go to the "production" slot of each staging SWA, which is where custom domains bind).

### Impact on Existing Workflows

The current `dashboard.yml` and `docs.yml` workflows have two jobs: `deploy-staging` and `deploy-production`. The staging jobs currently deploy to the same SWA instance with `deployment_environment: staging`.

**Change:** The staging jobs switch from deploying to a named environment within the production SWA to deploying to the dedicated staging SWA instance's production slot. This means:

- Remove `deployment_environment: staging` from staging jobs
- Change `azure_static_web_apps_api_token` to use the new staging-specific tokens
- The existing production jobs remain unchanged

### Cost

2 additional Standard SWA instances at $9/month each = $18/month total. Both existing production SWA instances are already Standard. The Standard plan is required for custom domains.

---

## Branding Asset Pipeline

### Source Assets

| File | Location | Purpose |
|------|----------|---------|
| `feelr-logo.svg` | `/assets/feelr-logo.svg` | Full logo with lobster character (400x400 viewBox 120x120). Used in docs navbar, dashboard sidebar header. |
| `feelr-logomark.svg` | `/assets/feelr-logomark.svg` | Minimal antennae mark (200x200 viewBox 40x40). Used as favicon source -- simple enough to be recognizable at 32x32. |

### Generated Assets (One-Time Script)

A build-time script (`scripts/generate-icons.mjs`) uses sharp to produce:

| Output | Size | Format | Used By |
|--------|------|--------|---------|
| `favicon.ico` | 32x32 | ICO | Both apps, placed in `app/` directory |
| `icon.svg` | Original | SVG (copy of logomark) | Both apps, placed in `app/` directory. Browsers supporting SVG favicons get the crisp vector version. |
| `icon-192.png` | 192x192 | PNG | Web manifest (standard icon) |
| `icon-512.png` | 512x512 | PNG | Web manifest (maskable icon) |
| `apple-icon.png` | 180x180 | PNG | Apple touch icon |

### Why sharp, Not a Dedicated Favicon Generator

| Criterion | sharp (recommended) | favicons npm package | @profullstack/favicon-generator |
|-----------|---------------------|---------------------|-------------------------------|
| Maturity | 10+ years, 30K+ GitHub stars | Active but heavy (generates 40+ files) | New, low adoption |
| Output control | Exact control over which sizes to generate | Generates everything (Android Chrome, iOS, Windows Tile, etc.) -- massive overkill | Reasonable but less flexible |
| Dependencies | Single native dependency (libvips) | Multiple dependencies | Depends on sharp anyway |
| Use case fit | Generate exactly 5 files from 1 SVG | Generate 40+ files with HTML snippet | Generate a standard set |

We need exactly 5 output files. Sharp gives precise control without generating dozens of unused assets. The script is ~30 lines.

### Why NOT Use Next.js Code-Generated Icons (icon.tsx)

Next.js supports generating icons via code (`app/icon.tsx` using `ImageResponse` from `next/og`). This is designed for rendering simple text/shapes, NOT for converting complex SVGs with gradients and multiple paths. The Feelr logomark has linear gradients, stroke paths, and filled circles that `ImageResponse` (which uses Satori internally) may not render faithfully. Pre-generating PNGs from the source SVG using sharp guarantees pixel-perfect output.

---

## DNS Configuration

### New CNAME Records (Cloudflare DNS)

| Name | Type | Target | Proxy | Notes |
|------|------|--------|-------|-------|
| `staging-app` | CNAME | `<dashboard-staging-swa-hostname>.azurestaticapps.net` | DNS only (gray cloud) | Must be DNS-only for Azure SWA custom domain validation. Same pattern as existing `app.feelr.dev`. |
| `staging-docs` | CNAME | `<docs-staging-swa-hostname>.azurestaticapps.net` | DNS only (gray cloud) | Must be DNS-only for Azure SWA custom domain validation. Same pattern as existing `feelr.dev`. |
| `staging-api` | (auto-created) | N/A | N/A | Cloudflare Workers `custom_domain = true` auto-manages DNS when the zone is on Cloudflare. No manual record needed. |

### Wrangler.toml Change for Gateway

```toml
# Add to [env.staging] section:
[env.staging]
workers_dev = true  # Keep workers.dev URL as fallback

[[env.staging.routes]]
pattern = "staging-api.feelr.dev"
custom_domain = true
```

---

## GitHub Actions Secrets

### New Secrets Required

| Secret Name | Source | Used By |
|-------------|--------|---------|
| `SWA_DASHBOARD_STAGING_TOKEN` | Azure Portal > `feelr-dashboard-staging` SWA > Manage deployment token | `dashboard.yml` staging job |
| `SWA_DOCS_STAGING_TOKEN` | Azure Portal > `feelr-docs-staging` SWA > Manage deployment token | `docs.yml` staging job |

### Existing Secrets (No Changes)

| Secret Name | Used By |
|-------------|---------|
| `SWA_DASHBOARD_DEPLOYMENT_TOKEN` | `dashboard.yml` production job |
| `SWA_DOCS_DEPLOYMENT_TOKEN` | `docs.yml` production job |
| `CLOUDFLARE_API_TOKEN` | `gateway.yml` both jobs |
| `CLOUDFLARE_ACCOUNT_ID` | `gateway.yml` both jobs |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| SWA staging custom domain | Separate SWA instances (2 new resources) | Azure SWA `deployment_environment: staging` with auto-generated URL | Auto-generated URLs cannot have custom domains. This is an Azure limitation, not a workaround. The only path to `staging-app.feelr.dev` is a dedicated SWA instance. |
| SWA staging custom domain | Separate SWA instances | Cloudflare Workers reverse proxy to SWA staging URL | Adds an unnecessary proxy layer, introduces latency, defeats the purpose of Azure SWA edge CDN. Over-engineering a simple subdomain. |
| SWA staging custom domain | Separate SWA instances | Azure Front Door / APIM in front of SWA | Massively over-engineered. AFD costs $35+/month, adds complexity for a simple CNAME-to-SWA mapping. |
| SWA staging plan | Standard ($9/mo per instance) | Free plan | Free plan does not support custom domains. Standard is required. |
| Gateway staging domain | Wrangler `custom_domain = true` | Cloudflare route + manual DNS CNAME | `custom_domain = true` is the modern approach, auto-manages DNS and SSL. Routes require manual CNAME setup and wildcard path matching. |
| SVG-to-favicon | sharp (build script) | favicons npm package | Generates 40+ files. We need 5. Overkill. |
| SVG-to-favicon | sharp (build script) | Online converter (realfavicongenerator.net) | Manual process, not reproducible, not in version control. |
| SVG-to-favicon | sharp (build script) | Next.js `icon.tsx` with `ImageResponse` | Satori (underlying renderer) has limited SVG support. Cannot reliably render gradients, complex paths. Pre-generating with sharp guarantees fidelity. |
| SVG-to-favicon | sharp (build script) | Check SVG directly into `app/` as `icon.svg` (no conversion) | This works for `icon.svg` (modern browsers), but `favicon.ico` is still needed for legacy browsers and some apps. apple-icon must be PNG. Manifest icons must be PNG. Still need sharp for 4 of 5 files. |
| Manifest approach | `manifest.ts` (code-generated) | Static `manifest.json` file | TypeScript manifest lets us reference icon paths programmatically and gets type-checked via `MetadataRoute.Manifest`. |
| Docs favicon | Next.js file-based (`app/favicon.ico`) | Nextra `<Head faviconGlyph="...">` | `faviconGlyph` renders an emoji as favicon. It does not support custom SVG/ICO icons. File-based is the standard Next.js approach and works with Nextra 4. |
| Docs logo | SVG `<Image>` or inline SVG in Navbar | Keep text `<b>Feelr</b>` | Text logo looks generic. The SVG logo with the lobster/antenna mark is the brand identity. The Navbar `logo` prop accepts any ReactNode. |

---

## Complete Dependency Changes

### New npm Dependencies

```bash
# None at runtime.
```

### New Dev Dependencies (Root)

```bash
# Install sharp as root devDependency for icon generation script
pnpm add -D sharp -w
```

**Why root, not per-app:** The icon generation script runs once and copies output to both `apps/dashboard/src/app/` and `apps/docs/app/`. It is a monorepo-level build tool, not an app-level dependency.

### New Go Dependencies

```bash
# None.
```

### New Infrastructure

| Resource | Type | Cost | How to Create |
|----------|------|------|---------------|
| `feelr-dashboard-staging` | Azure Static Web App (Standard) | $9/month | Azure Portal > Create resource > Static Web App. Deployment source: "Other". |
| `feelr-docs-staging` | Azure Static Web App (Standard) | $9/month | Azure Portal > Create resource > Static Web App. Deployment source: "Other". |

---

## Version Compatibility Matrix

| Tool | Current in Project | Required for Milestone | Change Needed? |
|------|-------------------|----------------------|----------------|
| Next.js | ^15.3.0 (resolves 15.5.12) | ^15.3.0 | No |
| React | ^19.0.0 | ^19.0.0 | No |
| Nextra | ^4.2.0 | ^4.2.0 | No |
| nextra-theme-docs | ^4.2.0 | ^4.2.0 | No |
| TypeScript | ^5.7.0 | ^5.7.0 | No |
| Tailwind CSS | ^4.0.0 | ^4.0.0 | No |
| pnpm | 9.15.0 | 9.15.0 | No |
| Turborepo | latest | latest | No |
| Node.js (CI) | 20 | 20 | No |
| Wrangler | 4.63.0 | 4.63.0 | No (config change only) |
| Azure/static-web-apps-deploy | v1 | v1 | No (new tokens + workflow changes) |
| cloudflare/wrangler-action | v3 | v3 | No |
| sharp | N/A (new) | ^0.34.5 | **Add as root devDependency** |

---

## Manifest.ts Compatibility Note

When using `manifest.ts` with `output: 'export'` in Next.js 15.x, the file MUST include:

```typescript
export const dynamic = 'force-static'
```

Without this export, the build will fail with:

> `export const dynamic = "force-static"/export const revalidate not configured on route "/manifest.webmanifest"`

This is a known Next.js requirement when using code-generated metadata files with static export. The `dynamic = 'force-static'` export tells Next.js to generate the manifest at build time and include it in the static output.

---

## Sources

### Official Documentation (HIGH confidence)
- [Azure SWA Custom Domains](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain) -- confirms custom domains are production-only
- [Azure SWA Custom Domain with External Providers](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external) -- CNAME setup process for Cloudflare DNS
- [Azure SWA Named Environments](https://learn.microsoft.com/en-us/azure/static-web-apps/named-environments) -- `deployment_environment` parameter, URL pattern
- [Azure SWA Preview Environments](https://learn.microsoft.com/en-us/azure/static-web-apps/preview-environments) -- confirms custom domains not supported on preview envs
- [Azure SWA Feature Request #22](https://github.com/Azure/static-web-apps/issues/22) -- custom domain for staging, open since 2020, no resolution
- [Next.js Metadata Files: favicon, icon, apple-icon](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons) -- file conventions, supported formats, static export behavior
- [Next.js Metadata Files: manifest.json](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest) -- `manifest.ts` with `force-static` for static export
- [Nextra Head Component](https://nextra.site/docs/built-ins/head) -- `faviconGlyph` prop, children for custom head tags
- [Cloudflare Workers Environments](https://developers.cloudflare.com/workers/wrangler/environments/) -- per-environment routes and custom domains
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- `custom_domain = true` in routes
- [sharp Documentation](https://sharp.pixelplumbing.com/) -- SVG input, PNG/WebP output, version 0.34.x

### Verified via Project Files (HIGH confidence)
- `apps/dashboard/package.json` -- current deps: next ^15.3.0, react ^19.0.0
- `apps/docs/package.json` -- current deps: next ^15.3.0, nextra ^4.2.0
- `apps/dashboard/next.config.ts` -- `output: 'export'`
- `apps/docs/next.config.mjs` -- `output: 'export'` via nextra wrapper
- `apps/dashboard/src/app/layout.tsx` -- existing metadata export, no favicon configured
- `apps/docs/app/layout.tsx` -- Nextra Head component, text-only logo, no favicon
- `apps/gateway/wrangler.toml` -- staging env uses `workers_dev = true`, no custom domain yet
- `.github/workflows/dashboard.yml` -- `deployment_environment: staging` with `SWA_DASHBOARD_DEPLOYMENT_TOKEN`
- `.github/workflows/docs.yml` -- `deployment_environment: staging` with `SWA_DOCS_DEPLOYMENT_TOKEN`
- `.github/workflows/gateway.yml` -- wrangler-action v3 with `--env staging`
- `/assets/feelr-logo.svg` -- full logo, 400x400 with 120x120 viewBox
- `/assets/feelr-logomark.svg` -- minimal mark, 200x200 with 40x40 viewBox

### Community/Web Sources (MEDIUM confidence)
- [Multi-stage Azure SWA Deployments](https://techcommunity.microsoft.com/blog/appsonazureblog/multi-stage-azure-static-web-apps-deployments-with-azure-devops/3390625) -- Microsoft blog confirming separate instances as a pattern
- [Nextra 4 Migration Guide](https://the-guild.dev/blog/nextra-4) -- confirms App Router migration, metadata API support
- [Next.js PWA Static Export Discussion](https://github.com/vercel/next.js/discussions/72221) -- `force-static` requirement for manifest.ts with output: 'export'

---

*Stack research for: Feelr -- Staging Custom Domains & Branding Integration*
*Researched: 2026-02-11*
