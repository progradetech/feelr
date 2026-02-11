# Architecture Patterns: Staging Custom Domains & Branding Integration

**Domain:** Multi-environment infrastructure + Static asset management
**Researched:** 2026-02-11

## Recommended Architecture

### Environment Topology (After This Milestone)

```
                    PRODUCTION                         STAGING
                    ----------                         -------
Gateway:    api.feelr.dev                    staging-api.feelr.dev
            (CF Worker, --env production)    (CF Worker, --env staging)

Dashboard:  app.feelr.dev                   staging-app.feelr.dev
            (Azure SWA, production slot)     (Azure SWA, dedicated instance)

Docs:       feelr.dev                        staging-docs.feelr.dev
            (Azure SWA, production slot)     (Azure SWA, dedicated instance)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Azure SWA (dashboard-prod) | Hosts production dashboard static files at app.feelr.dev | Cloudflare DNS (CNAME), GitHub Actions (deploy) |
| Azure SWA (dashboard-staging) | Hosts staging dashboard static files at staging-app.feelr.dev | Cloudflare DNS (CNAME), GitHub Actions (deploy) |
| Azure SWA (docs-prod) | Hosts production docs static files at feelr.dev | Cloudflare DNS (CNAME), GitHub Actions (deploy) |
| Azure SWA (docs-staging) | Hosts staging docs static files at staging-docs.feelr.dev | Cloudflare DNS (CNAME), GitHub Actions (deploy) |
| Cloudflare Worker (production) | API gateway at api.feelr.dev | Cloudflare DNS (custom_domain auto), GitHub Actions (wrangler deploy) |
| Cloudflare Worker (staging) | API gateway at staging-api.feelr.dev | Cloudflare DNS (custom_domain auto), GitHub Actions (wrangler deploy) |
| Cloudflare DNS | DNS authority for feelr.dev zone | All above components |
| GitHub Actions | CI/CD deployment orchestration | All SWA instances (via deployment tokens), CF Workers (via API token) |

### Deployment Flow

```
Push to main branch
  |
  +--> gateway.yml: deploy-staging job
  |     \--> wrangler deploy --env staging
  |           \--> staging-api.feelr.dev (Cloudflare Worker)
  |
  +--> dashboard.yml: deploy-staging job
  |     \--> Build with NEXT_PUBLIC_GATEWAY_URL=https://staging-api.feelr.dev
  |     \--> Azure/static-web-apps-deploy with SWA_DASHBOARD_STAGING_TOKEN
  |           \--> staging-app.feelr.dev (Azure SWA staging instance)
  |
  +--> docs.yml: deploy-staging job
        \--> Build docs
        \--> Azure/static-web-apps-deploy with SWA_DOCS_STAGING_TOKEN
              \--> staging-docs.feelr.dev (Azure SWA staging instance)

Push v* tag
  |
  +--> gateway.yml: deploy-production job (approval gate)
  |     \--> wrangler deploy --env production
  |           \--> api.feelr.dev
  |
  +--> dashboard.yml: deploy-production job (approval gate)
  |     \--> Build with NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev
  |     \--> Azure/static-web-apps-deploy with SWA_DASHBOARD_DEPLOYMENT_TOKEN
  |           \--> app.feelr.dev
  |
  +--> docs.yml: deploy-production job (approval gate)
        \--> Build docs
        \--> Azure/static-web-apps-deploy with SWA_DOCS_DEPLOYMENT_TOKEN
              \--> feelr.dev
```

### Branding Asset Flow

```
Source:  /assets/feelr-logomark.svg
           |
           v
Script:  scripts/generate-icons.mjs (uses sharp)
           |
           +--> apps/dashboard/src/app/favicon.ico      (32x32 ICO)
           +--> apps/dashboard/src/app/icon.svg          (copy of SVG)
           +--> apps/dashboard/src/app/apple-icon.png    (180x180 PNG)
           +--> apps/dashboard/public/icon-192.png       (192x192 PNG, manifest)
           +--> apps/dashboard/public/icon-512.png       (512x512 PNG, manifest)
           |
           +--> apps/docs/app/favicon.ico                (32x32 ICO)
           +--> apps/docs/app/icon.svg                   (copy of SVG)
           +--> apps/docs/app/apple-icon.png             (180x180 PNG)
           +--> apps/docs/public/icon-192.png            (192x192 PNG, manifest)
           +--> apps/docs/public/icon-512.png            (512x512 PNG, manifest)

Source:  /assets/feelr-logo.svg & /assets/feelr-logomark.svg
           |
           +--> apps/docs/app/layout.tsx (Navbar logo prop: inline SVG or Image)
           +--> apps/dashboard/src/components/sidebar.tsx (sidebar header logo)
```

## Patterns to Follow

### Pattern 1: Separate Instances per Environment (Azure SWA)
**What:** Create a dedicated Azure SWA resource for each environment that needs a custom domain, rather than using SWA's built-in preview environments.
**When:** Any time you need custom domains on non-production environments with Azure SWA.
**Why:** Azure SWA does not support custom domains on preview environments. This is the only viable pattern.
**Implementation:**
- Create SWA resource in Azure Portal with deployment source "Other"
- Retrieve deployment token from the Azure Portal
- Store as GitHub Actions secret
- Deploy via GitHub Actions with the instance-specific token and no `deployment_environment` parameter

### Pattern 2: File-Based Metadata (Next.js App Router)
**What:** Place static files (favicon.ico, icon.svg, apple-icon.png) in the `app/` directory and let Next.js auto-detect and generate `<link>` tags.
**When:** Deploying favicon/icons in any Next.js App Router application.
**Why:** Zero configuration. Next.js reads file metadata (size, type) and generates correct HTML. Works with static export.
**Example directory structure:**
```
app/
  favicon.ico          --> <link rel="icon" href="/favicon.ico" sizes="any" />
  icon.svg             --> <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  apple-icon.png       --> <link rel="apple-touch-icon" href="/apple-icon.png" />
  manifest.ts          --> <link rel="manifest" href="/manifest.webmanifest" />
  layout.tsx
  page.tsx
```

### Pattern 3: Cloudflare Workers Custom Domains per Environment
**What:** Use `custom_domain = true` in per-environment route configuration in `wrangler.toml`.
**When:** You need a custom subdomain for a Cloudflare Workers environment and the zone is on Cloudflare DNS.
**Why:** Cloudflare auto-manages DNS records and SSL certificates. No manual CNAME creation needed.
**Example:**
```toml
[env.staging]
workers_dev = true
[[env.staging.routes]]
pattern = "staging-api.feelr.dev"
custom_domain = true

[env.production]
workers_dev = false
[[env.production.routes]]
pattern = "api.feelr.dev"
custom_domain = true
```

### Pattern 4: Build-Time Asset Generation
**What:** Use a script (not runtime code) to generate derived assets from source files.
**When:** You have a source asset (SVG) that needs to be converted to multiple formats/sizes.
**Why:** Guarantees pixel-perfect output. Avoids runtime conversion overhead. Generated assets are committed to version control for reproducibility.
**Example:**
```javascript
// scripts/generate-icons.mjs
import sharp from 'sharp'
import { readFileSync, copyFileSync } from 'fs'

const svg = readFileSync('assets/feelr-logomark.svg')

// Generate raster icons
await sharp(svg).resize(32, 32).png().toFile('apps/dashboard/src/app/favicon-32.png')
await sharp(svg).resize(180, 180).png().toFile('apps/dashboard/src/app/apple-icon.png')
await sharp(svg).resize(192, 192).png().toFile('apps/dashboard/public/icon-192.png')
await sharp(svg).resize(512, 512).png().toFile('apps/dashboard/public/icon-512.png')

// Copy SVG as icon.svg
copyFileSync('assets/feelr-logomark.svg', 'apps/dashboard/src/app/icon.svg')
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using Azure SWA Preview Environments for Stable Staging with Custom Domains
**What:** Deploying to `deployment_environment: staging` and expecting custom domain support.
**Why bad:** Azure explicitly does not support custom domains on preview environments. You get an auto-generated URL that changes if you delete and recreate the SWA resource.
**Instead:** Use dedicated SWA instances per environment that needs a custom domain.

### Anti-Pattern 2: Runtime SVG-to-Raster Conversion
**What:** Using Next.js `icon.tsx` with `ImageResponse` to render complex SVGs at request time.
**Why bad:** Satori (the rendering engine behind `ImageResponse`) has limited SVG support. Gradients, complex paths, and stroke effects may not render correctly. Also adds build-time rendering overhead even for static export.
**Instead:** Pre-generate raster icons using sharp at build time. Commit generated files. Zero runtime cost.

### Anti-Pattern 3: Proxying SWA Staging Through Cloudflare Workers
**What:** Creating a Cloudflare Worker that proxies requests to the auto-generated Azure SWA staging URL, allowing a custom domain on the proxy.
**Why bad:** Adds latency, defeats Azure SWA's global CDN, creates a maintenance burden, and is fragile (SWA default URLs can change if resources are recreated).
**Instead:** Use dedicated SWA instances with native custom domain support.

### Anti-Pattern 4: Manual Favicon Generation
**What:** Using an online tool (realfavicongenerator.net) to generate favicon files, then manually copying them into the project.
**Why bad:** Not reproducible. If the source SVG changes, the process must be repeated manually. Easy to forget sizes or formats.
**Instead:** Script the generation with sharp. Run once, commit results. Re-run when source SVG changes.

## Scalability Considerations

Not applicable for this milestone. Staging infrastructure scales identically to production (Azure SWA and Cloudflare Workers are both edge-distributed). No additional scaling concerns.

## Sources

- [Azure SWA Custom Domains](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain)
- [Azure SWA Preview Environments](https://learn.microsoft.com/en-us/azure/static-web-apps/preview-environments)
- [Azure SWA Feature Request #22](https://github.com/Azure/static-web-apps/issues/22)
- [Multi-stage Azure SWA Deployments](https://techcommunity.microsoft.com/blog/appsonazureblog/multi-stage-azure-static-web-apps-deployments-with-azure-devops/3390625)
- [Next.js Metadata Files: favicon, icon, apple-icon](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons)
- [Next.js Metadata Files: manifest.json](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest)
- [Cloudflare Workers Environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- Existing project codebase (wrangler.toml, GitHub Actions workflows, layout files)
