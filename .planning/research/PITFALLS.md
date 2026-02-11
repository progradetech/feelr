# Domain Pitfalls: Staging Custom Domains & Branding Integration

**Domain:** Multi-environment infrastructure + Static asset management
**Researched:** 2026-02-11

## Critical Pitfalls

Mistakes that cause significant rework or blocked deployments.

### Pitfall 1: Azure SWA Does Not Support Custom Domains on Staging Environments
**What goes wrong:** Attempting to assign `staging-app.feelr.dev` to a `deployment_environment: staging` slot within an existing SWA instance. Azure rejects the custom domain configuration.
**Why it happens:** Azure SWA's custom domain binding is only available on the production slot. Preview/staging environments can only use auto-generated `*.azurestaticapps.net` URLs. This is a platform limitation, not a misconfiguration.
**Consequences:** Wasted time trying to configure something that is architecturally impossible. Delays the milestone.
**Prevention:** Use separate, dedicated SWA instances for staging. Each instance gets its own deployment token and custom domain on its production slot.
**Detection:** Azure Portal shows no "Custom domains" option when navigating to a preview/staging environment. The option only appears on the production slot.

### Pitfall 2: manifest.ts Build Failure with Static Export
**What goes wrong:** Adding a `manifest.ts` file to a Next.js app with `output: 'export'` causes the build to fail with: `export const dynamic = "force-static"/export const revalidate not configured on route "/manifest.webmanifest"`.
**Why it happens:** Next.js treats `manifest.ts` as a Route Handler. With `output: 'export'`, all Route Handlers must be explicitly marked as static. Without the `dynamic = 'force-static'` export, Next.js cannot determine that the manifest should be pre-rendered.
**Consequences:** Build failure in CI/CD. Neither staging nor production deploys succeed until fixed.
**Prevention:** Always include `export const dynamic = 'force-static'` in `manifest.ts` when using `output: 'export'`.
**Detection:** `next build` fails immediately with a clear error message. Caught in local dev before push.

### Pitfall 3: Deploying to Wrong SWA Instance After Adding Staging Instances
**What goes wrong:** After creating dedicated staging SWA instances, the GitHub Actions staging jobs still use the production SWA deployment token (or vice versa), deploying staging builds to production or production builds to staging.
**Why it happens:** The workflow changes require swapping the deployment token secret name in the staging job from `SWA_DASHBOARD_DEPLOYMENT_TOKEN` to `SWA_DASHBOARD_STAGING_TOKEN`. A copy-paste error or incomplete edit deploys to the wrong target.
**Consequences:** Production receives untested staging code, or staging overwrites production content.
**Prevention:** Update workflow files carefully. Verify each job uses the correct token. Add a comment in the workflow identifying which SWA instance each token targets. Run a staging deploy first and verify the content appears at `staging-app.feelr.dev`, not `app.feelr.dev`.
**Detection:** Check the SWA instance's "Deployments" tab in Azure Portal after each workflow run. The deployment history shows which instance received the deploy.

## Moderate Pitfalls

### Pitfall 4: Cloudflare DNS Proxy Mode (Orange Cloud) Breaking Azure SWA Custom Domain Validation
**What goes wrong:** Creating CNAME records for `staging-app.feelr.dev` and `staging-docs.feelr.dev` with Cloudflare proxy enabled (orange cloud) instead of DNS-only (gray cloud). Azure SWA cannot validate the CNAME because Cloudflare's proxy returns its own IP addresses instead of the SWA hostname.
**Prevention:** Set all Azure SWA CNAME records to "DNS only" (gray cloud) in Cloudflare DNS. This is the same pattern used for existing `app.feelr.dev` and `feelr.dev` records.

### Pitfall 5: Staging Dashboard Pointing to Production API
**What goes wrong:** The staging dashboard at `staging-app.feelr.dev` is built with `NEXT_PUBLIC_GATEWAY_URL=https://api.feelr.dev` (production) instead of `https://staging-api.feelr.dev`. Staging dashboard makes API calls to production.
**Prevention:** Ensure the staging job in `dashboard.yml` sets `NEXT_PUBLIC_GATEWAY_URL: https://staging-api.feelr.dev` during the build step. The current staging build uses the workers.dev URL (`https://feelr-gateway-staging.feelr.workers.dev`); this should be updated to the new custom domain simultaneously.

### Pitfall 6: sharp SVG Rendering Issues with Gradients at Small Sizes
**What goes wrong:** The Feelr logomark SVG uses `linearGradient` elements. When sharp renders this at 32x32 (favicon), the gradients may appear as solid colors or banding artifacts due to limited pixel resolution.
**Prevention:** Test the generated 32x32 PNG visually before committing. If gradients are indistinguishable at that size, consider using the logomark's dominant solid color (#C4B5FD purple or #E85D3A coral) as a background with simplified shapes, or accept that favicon-sized icons are inherently simplified.

### Pitfall 7: favicon.ico vs icon.svg Precedence in Next.js
**What goes wrong:** Both `favicon.ico` and `icon.svg` are placed in `app/`. Developer expects `icon.svg` to be the primary favicon, but some browsers prefer `favicon.ico`. The two icons look different (raster vs vector).
**Prevention:** Generate `favicon.ico` from the same source SVG so both icons represent the same mark. The `favicon.ico` exists for legacy compatibility; `icon.svg` provides the crisp modern version. They should depict the same thing.

### Pitfall 8: Azure SWA Custom Domain CNAME Validation Timing
**What goes wrong:** After creating CNAME records in Cloudflare DNS and adding the custom domain in Azure Portal, validation fails because DNS propagation has not completed.
**Prevention:** After creating CNAME records, wait a few minutes for propagation. Cloudflare DNS updates are usually fast (seconds to minutes), but Azure's validation check may take longer. If validation fails, retry after 5-10 minutes. Do not delete and recreate the custom domain -- just retry the validation.

## Minor Pitfalls

### Pitfall 9: Nextra Head Component Conflicting with File-Based Favicon
**What goes wrong:** The Nextra `<Head>` component has a `faviconGlyph` prop set (or renders a default favicon). This conflicts with the file-based `favicon.ico` in `app/`, resulting in duplicate favicon tags in `<head>`.
**Prevention:** When using file-based favicons with Nextra 4, do NOT set the `faviconGlyph` prop on `<Head>`. Remove it if present. Let Next.js file-based conventions handle favicon injection.

### Pitfall 10: Generated Icons Not Committed to Version Control
**What goes wrong:** The icon generation script (`scripts/generate-icons.mjs`) is created but its output is `.gitignore`'d or forgotten. CI/CD builds do not run the script, so favicons are missing in production.
**Prevention:** Commit the generated icon files to version control. The generation script is for reproducibility (re-run when source SVG changes), but the outputs must be checked in. They are small binary files (~1-5KB each).

### Pitfall 11: Workers custom_domain on a Zone Not in the Same Cloudflare Account
**What goes wrong:** `custom_domain = true` in wrangler.toml only works when the domain's DNS zone is managed by the same Cloudflare account that owns the Worker. If the zone were in a different account, the custom domain setup would fail silently.
**Prevention:** Not a real risk for Feelr (both the Worker and the `feelr.dev` zone are in the same Cloudflare account), but worth noting for documentation purposes.

### Pitfall 12: SWA Standard Plan Required for Custom Domains
**What goes wrong:** Creating staging SWA instances on the Free plan, then attempting to add custom domains. Azure requires the Standard plan ($9/month) for custom domain support.
**Prevention:** Select Standard plan when creating the staging SWA instances in Azure Portal. Budget for $18/month total (2 instances).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Create Azure SWA staging instances | Pitfall 1 (custom domain limitation) | Use separate instances, not preview environments |
| Create Azure SWA staging instances | Pitfall 12 (Standard plan required) | Select Standard plan at creation time |
| Configure Cloudflare DNS records | Pitfall 4 (orange cloud proxy mode) | Set DNS-only (gray cloud) for all SWA CNAMEs |
| Azure custom domain validation | Pitfall 8 (CNAME propagation timing) | Wait a few minutes, retry if validation fails |
| Update GitHub Actions workflows | Pitfall 3 (wrong deployment token) | Double-check token secret names per job |
| Update GitHub Actions workflows | Pitfall 5 (wrong API URL in staging build) | Verify NEXT_PUBLIC_GATEWAY_URL per environment |
| Add manifest.ts to dashboard | Pitfall 2 (force-static required) | Include `export const dynamic = 'force-static'` |
| Generate favicon assets with sharp | Pitfall 6 (gradient rendering at small sizes) | Visual inspection of 32x32 output |
| Place favicon files in both apps | Pitfall 7 (favicon.ico vs icon.svg consistency) | Generate both from same source SVG |
| Add favicon files to docs app | Pitfall 9 (Head component conflict) | Remove faviconGlyph prop from Head |
| Commit generated icon files | Pitfall 10 (icons not in version control) | Git add the generated files explicitly |
| Add wrangler staging route | Pitfall 11 (zone ownership) | Verify Worker and zone are same account (they are) |

## Sources

- [Azure SWA Custom Domains](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain) -- custom domain limitation documented
- [Azure SWA Feature Request #22](https://github.com/Azure/static-web-apps/issues/22) -- community confirmation of limitation
- [Next.js PWA Static Export Discussion](https://github.com/vercel/next.js/discussions/72221) -- manifest.ts force-static requirement
- [Next.js Metadata Files: favicon, icon, apple-icon](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons) -- file-based icon behavior
- [Nextra Head Component](https://nextra.site/docs/built-ins/head) -- faviconGlyph behavior
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- zone ownership requirement
- Existing project workflows (dashboard.yml, docs.yml, gateway.yml)
