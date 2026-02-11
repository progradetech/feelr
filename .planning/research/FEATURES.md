# Feature Landscape: Staging Custom Domains & Branding Integration

**Domain:** DevOps infrastructure + Frontend branding
**Researched:** 2026-02-11

## Table Stakes

Features that are expected for a professional, multi-environment web application.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Staging subdomains (staging-api, staging-app, staging-docs) | Professional multi-env setup requires predictable, memorable staging URLs. Auto-generated Azure URLs are long and impossible to share. | Medium | Requires 2 new Azure SWA instances + wrangler.toml change. |
| favicon.ico | Every website has a favicon. Missing favicon shows browser default icon and 404 in network tab. | Low | Place file in `app/` directory. Next.js auto-detects. |
| apple-touch-icon | iOS users adding site to home screen expect a proper icon, not a screenshot. | Low | Place `apple-icon.png` (180x180) in `app/` directory. |
| Web manifest (manifest.webmanifest) | Required for "Add to Home Screen" prompt and proper PWA metadata. Signals professionalism. | Low | `manifest.ts` in `app/` with `force-static` export. |
| Brand logo in docs navbar | Text-only navbar looks generic. Users expect visual branding in a docs site. | Low | Replace `<b>Feelr</b>` with SVG logo in Nextra Navbar `logo` prop. |
| Brand logo in dashboard sidebar | Same as above. Dashboard should carry the brand mark. | Low | Add SVG logo to sidebar header component. |
| HTTPS on staging domains | Staging must have valid SSL certificates, same as production. | None (automatic) | Azure SWA auto-provisions SSL. Cloudflare Workers auto-provisions SSL for custom domains. |

## Differentiators

Features that go beyond baseline expectations.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| SVG favicon (icon.svg) | Modern browsers render SVG favicons at any resolution, avoiding pixelation. Crisp at any DPI. | Low | Copy logomark SVG to `app/icon.svg`. Next.js generates `<link rel="icon" type="image/svg+xml">`. |
| Theme-color meta tag | Browser chrome (address bar, tab color) matches brand colors on mobile. | Low | Add `themeColor` to metadata export in layout.tsx. |
| OG image with brand | Social sharing previews show branded image instead of generic text. | Medium | Requires creating a static OG image or using Next.js `opengraph-image.tsx`. Defer to later milestone. |
| Staging environment indicator | Visual badge or header on staging showing "STAGING" to prevent confusion with production. | Low | Conditionally render a banner based on `NEXT_PUBLIC_GATEWAY_URL` containing "staging". |
| Gateway smoke test URL update | After adding staging-api.feelr.dev, workflow should use custom domain for health checks. | Low | One-line change in gateway.yml. |
| Dashboard staging GATEWAY_URL update | Staging dashboard build should use staging-api.feelr.dev instead of workers.dev URL. | Low | One-line change in dashboard.yml. |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full PWA support (service worker, offline) | Dashboard requires live API access. Offline mode is meaningless for an API management dashboard. | Manifest exists for "Add to Home Screen" icon/name, not for offline PWA features. |
| Dynamic OG images per page | Over-engineering for an internal dashboard and docs site. No SEO benefit (dashboard is auth-gated). | Use a single static OG image shared across all pages, or defer entirely. |
| Multiple favicon themes (light/dark mode) | Browser support is limited. Adds complexity for minimal visual benefit. | Single favicon that works on both light and dark backgrounds. |
| Infrastructure-as-code (Bicep/Terraform) for SWA | Only 2 resources to create. IaC setup time exceeds manual creation time. | Create SWA instances manually in Azure Portal. Document the steps. |
| Staging auth/password protection | Staging is for developer verification, not client demos. Dashboard requires API key auth anyway. | Keep staging publicly accessible. |
| PR preview custom domains | Azure SWA does not support custom domains on preview environments. Workarounds create fragile infrastructure for ephemeral environments. | Keep auto-generated `*.azurestaticapps.net` URLs for PR previews. |
| Multiple favicon size variants (20+ files) | The old approach is obsolete. Modern browsers use SVG (scalable), and a single 32x32 ICO handles legacy cases. | Ship exactly: `favicon.ico` (32x32), `icon.svg` (scalable), `apple-icon.png` (180x180). |
| Build-time favicon regeneration | Favicon files change approximately never. Running sharp on every build wastes CI time. | Generate once with script, commit results. Re-run manually when source SVG changes. |

## Feature Dependencies

```
Azure SWA staging instances (manual) --> Cloudflare CNAME records --> Custom domain validation
                                          \--> GitHub Actions workflow changes

Wrangler.toml staging route change --> Gateway staging deploy --> staging-api.feelr.dev live
                                       \--> Gateway workflow smoke test URL update
                                       \--> Dashboard workflow NEXT_PUBLIC_GATEWAY_URL update

Sharp icon generation script --> favicon.ico, icon.svg, apple-icon.png, icon-192.png, icon-512.png
                                   \--> Dashboard app/ directory placement
                                   \--> Docs app/ directory placement
                                   \--> manifest.ts references icon paths
                                   \--> Navbar logo uses same SVG source
                                   \--> Sidebar logo uses same SVG source
```

## MVP Recommendation

Prioritize:
1. **Staging custom domains** (all 3 services) -- enables verification of all future changes
2. **favicon.ico + icon.svg** for both apps -- highest-visibility branding fix (browser tab icon)
3. **manifest.webmanifest** for dashboard -- completes the PWA metadata (icon, name, theme)
4. **Docs navbar logo** replacement -- brand consistency
5. **Dashboard sidebar logo** -- brand consistency

Defer:
- OG image: requires design work, low urgency since dashboard is auth-gated
- Staging environment indicator banner: nice-to-have, can be added in any future phase

## Sources

- [Azure SWA Custom Domains](https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain) -- confirms custom domains are production-only
- [Azure SWA Preview Environments](https://learn.microsoft.com/en-us/azure/static-web-apps/preview-environments) -- confirms custom domains not supported
- [Azure SWA Feature Request #22](https://github.com/Azure/static-web-apps/issues/22) -- open since 2020, no resolution
- [Next.js Metadata Files: favicon, icon, apple-icon](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons) -- file conventions, supported formats
- [Next.js Metadata Files: manifest.json](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest) -- manifest.ts with force-static
- [Nextra Head Component](https://nextra.site/docs/built-ins/head) -- faviconGlyph behavior
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- custom_domain = true
- Existing codebase analysis (layout.tsx, wrangler.toml, workflows, sidebar.tsx)
