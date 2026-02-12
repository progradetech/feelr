# Phase 23: Favicon & Manifest - Research

**Researched:** 2026-02-11
**Domain:** Next.js metadata file conventions, favicon generation, web app manifest, SVG adaptive icons
**Confidence:** HIGH

## Summary

Phase 23 adds browser tab icons, home screen icons, and web manifests to both the dashboard (Next.js 15 with App Router) and the docs site (Nextra 4 on Next.js 15). Both apps use `output: 'export'` (static export), which means all metadata file conventions (favicon.ico, icon.svg, apple-icon.png, manifest.ts) work because they are statically generated at build time as special Route Handlers.

The modern favicon approach (per Evil Martians' 2026 guide and web.dev) requires only three to four files: `favicon.ico` (32x32), `icon.svg` (adaptive with dark/light CSS), `apple-icon.png` (180x180), plus a `manifest.webmanifest` with 192px and 512px PNG icons. Next.js has first-class file-based conventions for all of these -- placing files with the right names in `app/` auto-generates the correct `<link>` and `<meta>` tags.

The environment-aware `metadataBase` (LOGO-04) requires a new `NEXT_PUBLIC_SITE_URL` env var injected at build time in CI workflows, since the current dashboard hardcodes `https://app.feelr.dev` and the docs site has no `metadataBase` at all.

**Primary recommendation:** Use Next.js file-based metadata conventions (static image files in `app/`) for both apps. Generate favicon.ico, apple-icon.png, and manifest PNG icons from `assets/feelr-logomark.svg` via a `sharp` + `sharp-ico` build script. Place the SVG favicon directly as `app/icon.svg` with embedded `prefers-color-scheme` CSS for dark/light mode.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sharp | latest (^0.33) | SVG-to-PNG rasterization at multiple sizes | De facto Node.js image processing; already decided as dev dep |
| sharp-ico | ^0.1.5 | PNG buffers to ICO encoding | Lightweight wrapper for sharp to produce multi-resolution ICO files |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next (built-in) | ^15.3 | File-based metadata: favicon, icon, apple-icon, manifest | Already in both apps; no new dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sharp + sharp-ico | `favicons` npm package | favicons generates dozens of files with complex config; overkill for 4-5 files |
| sharp + sharp-ico | `svg-to-ico` | Simpler but doesn't reuse sharp which is already a decided dependency |
| sharp + sharp-ico | `to-ico` (pure JS) | Lightweight but requires separate PNG generation; sharp handles both |
| File-based metadata | Config-based metadata (`icons` field in layout.tsx) | File-based is recommended by Next.js docs and auto-detects sizes/types |
| Static `manifest.webmanifest` | Dynamic `manifest.ts` | Dynamic manifest.ts is more maintainable and provides TypeScript types; both work with static export |

**Installation (root dev dependency):**
```bash
pnpm add -Dw sharp sharp-ico
```

## Architecture Patterns

### Recommended File Structure

```
assets/
  feelr-logomark.svg          # Source SVG (already exists)
  feelr-logo.svg              # Full logo (already exists)
scripts/
  generate-icons.ts           # Build script: SVG -> favicon.ico, apple-icon.png, manifest PNGs
apps/dashboard/
  src/app/
    favicon.ico               # Generated: 32x32 ICO (git-tracked output)
    icon.svg                  # Hand-crafted: adaptive SVG with prefers-color-scheme
    apple-icon.png            # Generated: 180x180 PNG
    manifest.ts               # Dynamic manifest file (TypeScript, returns MetadataRoute.Manifest)
    layout.tsx                # Updated: environment-aware metadataBase + viewport themeColor
apps/docs/
  app/
    favicon.ico               # Generated: same as dashboard (shared brand)
    icon.svg                  # Hand-crafted: same as dashboard (shared brand)
    apple-icon.png            # Generated: same as dashboard
    manifest.ts               # Dynamic manifest file (docs-specific name/start_url)
    layout.tsx                # Updated: add metadataBase + viewport themeColor
public/
  icon-192.png                # Generated: for manifest reference (served from /icon-192.png)
  icon-512.png                # Generated: for manifest reference (served from /icon-512.png)
```

### Pattern 1: File-Based Icon Convention (Next.js)

**What:** Place image files with specific names in `app/` directory; Next.js auto-generates `<head>` tags.
**When to use:** Always -- this is the recommended approach per official Next.js docs.
**Example:**

Placing `app/favicon.ico` generates:
```html
<link rel="icon" href="/favicon.ico" sizes="any" />
```

Placing `app/icon.svg` generates:
```html
<link rel="icon" href="/icon.svg" type="image/svg+xml" sizes="any" />
```

Placing `app/apple-icon.png` (180x180) generates:
```html
<link rel="apple-touch-icon" href="/apple-icon.png" type="image/png" sizes="180x180" />
```

Source: [Next.js Metadata Files: app-icons](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons)

### Pattern 2: Dynamic Manifest via manifest.ts

**What:** TypeScript file returning `MetadataRoute.Manifest` object -- statically generated at build time.
**When to use:** When you want type safety and environment-aware values.
**Example:**

```typescript
// app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Feelr',
    short_name: 'Feelr',
    description: 'Agent-friendly API simplification layer',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',  // zinc-950
    theme_color: '#E85D3A',       // Lobster Red
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

Next.js generates `<link rel="manifest" href="/manifest.webmanifest" />` in the head.

Source: [Next.js Metadata Files: manifest](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest)

### Pattern 3: Adaptive SVG Favicon with Dark/Light Mode

**What:** SVG with embedded `<style>` containing `@media (prefers-color-scheme: dark)` to change colors.
**When to use:** ICON-04 requirement -- SVG icon renders correctly in both light and dark browser themes.
**Example:**

```xml
<svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <style>
    .stroke-primary { stroke: #E85D3A; }
    .fill-tip { fill: #C4B5FD; }
    .fill-tip-inner { fill: #1a1a2e; }
    @media (prefers-color-scheme: dark) {
      .fill-tip-inner { fill: #fff; }
    }
  </style>
  <!-- logomark paths using classes instead of inline colors -->
</svg>
```

Source: [web.dev - Building an adaptive favicon](https://web.dev/building-an-adaptive-favicon/), [Owen Conti - Supporting Dark Mode with SVG Favicons](https://owenconti.com/posts/supporting-dark-mode-with-svg-favicons)

### Pattern 4: Environment-Aware metadataBase

**What:** Use `NEXT_PUBLIC_SITE_URL` env var to set metadataBase dynamically per environment.
**When to use:** LOGO-04 requirement -- metadataBase resolves to staging-app vs app, staging-docs vs feelr.dev.
**Example:**

```typescript
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ),
  // ...
}
```

CI injects `NEXT_PUBLIC_SITE_URL` at build time:
- Dashboard staging: `https://staging-app.feelr.dev`
- Dashboard production: `https://app.feelr.dev`
- Docs staging: `https://staging-docs.feelr.dev`
- Docs production: `https://feelr.dev`

Source: [Next.js generateMetadata - metadataBase](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase)

### Pattern 5: Viewport themeColor (replaces deprecated metadata.themeColor)

**What:** Export `viewport` object from layout.tsx with `themeColor` field.
**When to use:** Setting browser chrome color for mobile. Required since Next.js 14 deprecated `themeColor` in metadata.
**Example:**

```typescript
// app/layout.tsx
import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#E85D3A',  // Lobster Red
}
```

Generates: `<meta name="theme-color" content="#E85D3A" />`

Source: [Next.js generateViewport](https://nextjs.org/docs/app/api-reference/functions/generate-viewport)

### Anti-Patterns to Avoid

- **Dozens of favicon files:** Old-school approach. Modern browsers need only 3-4 files (ICO, SVG, apple-touch-icon, manifest PNGs). Do not generate 30+ files with `favicons` npm package.
- **`<link>` tags in layout.tsx JSX:** Do not manually add `<link rel="icon">` tags in the HTML template. Use Next.js file-based conventions -- they auto-generate the correct tags with proper attributes.
- **Putting icons in `public/` for favicon/icon/apple-icon:** File-based metadata convention expects these in `app/`, not `public/`. Exception: manifest icon PNGs go in `public/` because the manifest references them by URL path.
- **Using metadata.themeColor:** Deprecated since Next.js 14. Use `viewport.themeColor` instead.
- **Hardcoding metadataBase per environment:** The current dashboard hardcodes `https://app.feelr.dev`. Use an env var instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG to ICO conversion | Custom binary manipulation | sharp + sharp-ico | ICO format has complex multi-resolution structure |
| SVG to PNG rasterization | Canvas/puppeteer | sharp | Native libvips bindings, fast, handles SVG natively |
| Favicon `<link>` tag generation | Manual `<link>` elements in JSX | Next.js file-based metadata | Auto-detects sizes, types, generates correct attributes |
| Manifest `<link>` tag | Manual `<link rel="manifest">` | Next.js manifest.ts convention | Auto-generates link tag, provides TypeScript types |
| Multi-resolution ICO | Single-size favicon | sharp-ico with sizes [32, 16] | Browsers expect 32x32 for tabs, 16x16 for legacy |

**Key insight:** Next.js has solved the entire favicon/manifest wiring problem through file conventions. The only custom code needed is the build-time asset generation script (SVG to ICO/PNG).

## Common Pitfalls

### Pitfall 1: ICO File Size in favicon.ico

**What goes wrong:** Generating a 256x256 ICO file bloats favicon.ico unnecessarily. Browser tabs use 32x32 or 16x16.
**Why it happens:** sharp-ico defaults to sizes [256, 128, 64, 48, 32, 24, 16].
**How to avoid:** Use only sizes [32, 16] for favicon.ico. The SVG handles modern browsers; ICO is just a fallback.
**Warning signs:** favicon.ico larger than 15KB.

### Pitfall 2: SVG Gradients with IDs in Favicon

**What goes wrong:** The existing logomark SVG uses `id="markGradL"` and `id="markGradR"` for gradient definitions. If the same SVG is inlined elsewhere on the page, ID collisions cause rendering issues.
**Why it happens:** SVG gradient IDs are document-scoped.
**How to avoid:** For the favicon SVG (loaded as a separate resource via `<link>`), this is not a problem since it is in its own document. But verify the favicon SVG works as a standalone file.
**Warning signs:** Gradient not rendering in browser tab.

### Pitfall 3: Static Export and manifest.ts Path

**What goes wrong:** With `output: 'export'`, the manifest.ts generates a static file. If it references paths like `/icon-192.png`, those files must exist in the `out/` directory.
**Why it happens:** Static export has no server to serve dynamic responses.
**How to avoid:** Place manifest PNG icons in `public/` directory (which gets copied to `out/` during build). Verify the icons appear in `out/` after `next build`.
**Warning signs:** 404 for `/icon-192.png` or `/icon-512.png` after deploy.

### Pitfall 4: Nextra Head Component Interference

**What goes wrong:** Nextra's `<Head />` component might inject its own default favicon behavior.
**Why it happens:** Nextra wraps Next.js head management.
**How to avoid:** The docs app currently uses `<Head />` without `faviconGlyph` prop. Next.js file-based metadata (app/favicon.ico, app/icon.svg) has higher priority and overrides config-based metadata. Test that the file-based icons take precedence.
**Warning signs:** Wrong favicon showing on docs site; Nextra default icon appearing.

### Pitfall 5: Forgetting NEXT_PUBLIC_SITE_URL in CI

**What goes wrong:** metadataBase falls back to localhost, breaking OG image URLs and canonical links in production/staging.
**Why it happens:** New env var not added to workflow files.
**How to avoid:** Update all four deploy jobs (dashboard staging, dashboard production, docs staging, docs production) with the correct `NEXT_PUBLIC_SITE_URL` value.
**Warning signs:** OG images pointing to localhost; metadataBase warning during build.

### Pitfall 6: apple-icon.png Must Be PNG (Not SVG)

**What goes wrong:** Using SVG for apple-touch-icon. iOS does not support SVG for home screen icons.
**Why it happens:** Developer assumes SVG works everywhere.
**How to avoid:** Generate a 180x180 PNG from the logomark SVG using sharp. Next.js file convention only accepts `.jpg`, `.jpeg`, `.png` for apple-icon.
**Warning signs:** Blank or generic icon when adding to iOS home screen.

## Code Examples

Verified patterns from official sources:

### Icon Generation Build Script (sharp + sharp-ico)

```typescript
// scripts/generate-icons.ts
import sharp from 'sharp'
import ico from 'sharp-ico'
import { resolve } from 'path'
import { copyFileSync } from 'fs'

const LOGOMARK = resolve(__dirname, '../assets/feelr-logomark.svg')

const SIZES = {
  favicon: [32, 16],         // Multi-resolution ICO
  apple: 180,                // Apple touch icon
  manifest192: 192,          // Manifest icon
  manifest512: 512,          // Manifest icon (splash/maskable)
}

const TARGETS = [
  'apps/dashboard',
  'apps/docs',
]

async function generatePng(inputSvg: string, size: number): Promise<Buffer> {
  return sharp(inputSvg)
    .resize(size, size)
    .png()
    .toBuffer()
}

async function generateIco(inputSvg: string, sizes: number[]): Promise<Buffer> {
  const pngBuffers = await Promise.all(
    sizes.map(size => generatePng(inputSvg, size))
  )
  return ico.encode(pngBuffers)
}

async function main() {
  // Generate all assets
  const faviconBuf = await generateIco(LOGOMARK, SIZES.favicon)
  const appleBuf = await generatePng(LOGOMARK, SIZES.apple)
  const icon192Buf = await generatePng(LOGOMARK, SIZES.manifest192)
  const icon512Buf = await generatePng(LOGOMARK, SIZES.manifest512)

  for (const target of TARGETS) {
    const appDir = resolve(__dirname, '..', target, 'src/app') // dashboard
    // ... or resolve for docs which uses app/ not src/app/
    // Write favicon.ico, apple-icon.png to app dir
    // Write icon-192.png, icon-512.png to public dir
  }
}

main()
```

Source: [sharp-ico GitHub](https://github.com/ssnangua/sharp-ico), [sharp docs](https://sharp.pixelplumbing.com/)

### Adaptive SVG Favicon (app/icon.svg)

```xml
<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .arc { stroke: #E85D3A; }
    .tip-outer { fill: #C4B5FD; }
    .tip-inner { fill: #fff; }
    @media (prefers-color-scheme: light) {
      .tip-inner { fill: #1a1a2e; }
    }
  </style>
  <!-- Antennae paths from feelr-logomark.svg, using CSS classes -->
  <path d="M15 28 Q10 18 5 8" stroke="url(#fgL)" stroke-width="3" stroke-linecap="round" fill="none"/>
  <circle cx="5" cy="8" r="3" class="tip-outer"/>
  <circle cx="5" cy="8" r="1.5" class="tip-inner"/>
  <path d="M25 28 Q30 18 35 8" stroke="url(#fgR)" stroke-width="3" stroke-linecap="round" fill="none"/>
  <circle cx="35" cy="8" r="3" class="tip-outer"/>
  <circle cx="35" cy="8" r="1.5" class="tip-inner"/>
  <path d="M15 28 Q20 32 25 28" class="arc" stroke-width="2" stroke-linecap="round" fill="none"/>
  <defs>
    <linearGradient id="fgL" x1="15" y1="28" x2="5" y2="8">
      <stop offset="0%" stop-color="#E85D3A"/>
      <stop offset="100%" stop-color="#C4B5FD"/>
    </linearGradient>
    <linearGradient id="fgR" x1="25" y1="28" x2="35" y2="8">
      <stop offset="0%" stop-color="#E85D3A"/>
      <stop offset="100%" stop-color="#C4B5FD"/>
    </linearGradient>
  </defs>
</svg>
```

### Dashboard manifest.ts

```typescript
// apps/dashboard/src/app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Feelr',
    short_name: 'Feelr',
    description: 'Agent-friendly API simplification. One CLI, one API key, every integration.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#E85D3A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

### Environment-Aware metadataBase

```typescript
// apps/dashboard/src/app/layout.tsx (updated)
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ),
  title: {
    default: 'Feelr',
    template: '%s | Feelr',
  },
  description: 'Agent-friendly API simplification. One CLI, one API key, every integration.',
  openGraph: {
    siteName: 'Feelr',
    locale: 'en_US',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#E85D3A',
}
```

### CI Workflow Env Var Addition

```yaml
# .github/workflows/dashboard.yml - staging build step
- name: Build dashboard (staging)
  run: pnpm turbo run build --filter=@feelr/dashboard
  env:
    NEXT_PUBLIC_GATEWAY_URL: https://staging-api.feelr.dev
    NEXT_PUBLIC_SITE_URL: https://staging-app.feelr.dev
    NEXT_PUBLIC_CF_ANALYTICS_TOKEN: ${{ secrets.CF_ANALYTICS_TOKEN_STAGING }}

# .github/workflows/dashboard.yml - production build step
- name: Build dashboard (production)
  run: pnpm turbo run build --filter=@feelr/dashboard
  env:
    NEXT_PUBLIC_GATEWAY_URL: https://api.feelr.dev
    NEXT_PUBLIC_SITE_URL: https://app.feelr.dev
    NEXT_PUBLIC_CF_ANALYTICS_TOKEN: ${{ secrets.CF_ANALYTICS_TOKEN_PRODUCTION }}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 30+ favicon files | 3-4 files (ICO, SVG, apple-touch-icon, manifest PNGs) | ~2021 (Evil Martians guide) | Dramatically simpler setup |
| Manual `<link>` tags in HTML | Next.js file-based metadata conventions | Next.js 13.3 (2023) | Auto-generated, type-safe head tags |
| `metadata.themeColor` | `viewport.themeColor` | Next.js 14 (2024) | Separate viewport export required |
| Static favicon only | SVG favicon with `prefers-color-scheme` | ~2020+ (Firefox/Chrome support) | Adaptive dark/light mode icons |
| `manifest.json` (static) | `manifest.ts` (dynamic, typed) | Next.js 13+ | TypeScript types, build-time generation |

**Deprecated/outdated:**
- `metadata.themeColor` in Next.js: Deprecated since v14; use `viewport` export instead
- `metadata.colorScheme` in Next.js: Deprecated since v14; use `viewport` export instead
- `msapplication-*` meta tags: No longer needed in Chromium-based Edge
- Generating favicons for every conceivable size: Modern browsers downscale; only ICO 32/16 + SVG + 180px apple + 192/512 manifest needed

## Existing Codebase State

### What exists now
- `assets/feelr-logomark.svg`: 200x200 SVG with viewBox 0 0 40 40, contains the Feelr antennae mark with gradient strokes (#E85D3A to #C4B5FD) and white-filled tips
- `assets/feelr-logo.svg`: 400x400 SVG with viewBox 0 0 120 120, full lobster logo with background circle
- Dashboard `layout.tsx`: Has `metadataBase: new URL('https://app.feelr.dev')` hardcoded; no `viewport` export; no icons
- Docs `layout.tsx`: No `metadataBase` at all; uses Nextra `<Head />` without faviconGlyph
- Neither app has any favicon.ico, icon.svg, apple-icon.png, or manifest file
- Neither app has a `public/` directory
- Dashboard uses `src/app/` structure; docs uses `app/` structure (no src/)
- Both apps use `output: 'export'` -- all metadata files must be statically generatable
- CI workflows inject `NEXT_PUBLIC_GATEWAY_URL` but not `NEXT_PUBLIC_SITE_URL`

### Brand colors
- **Lobster Red (primary):** `#E85D3A` -- used for theme_color in manifest and viewport
- **Purple tips:** `#C4B5FD` -- gradient endpoint
- **Dark background:** `#09090b` (zinc-950) -- used for background_color in manifest
- **Dark violet:** `#8B5CF6` -- secondary purple in logo (not needed for favicon)

### Domain mapping
| Environment | Dashboard URL | Docs URL |
|-------------|---------------|----------|
| Staging | `https://staging-app.feelr.dev` | `https://staging-docs.feelr.dev` |
| Production | `https://app.feelr.dev` | `https://feelr.dev` |
| Local | `http://localhost:3000` | `http://localhost:3000` |

## Open Questions

1. **Docs production URL: feelr.dev or docs.feelr.dev?**
   - What we know: The phase description says "staging-docs vs feelr.dev". The CI workflow health-checks `staging-docs.feelr.dev`. No production docs URL is explicitly defined in existing code.
   - What's unclear: Whether the production docs site is at `feelr.dev` (root) or `docs.feelr.dev` (subdomain).
   - Recommendation: Use `https://feelr.dev` per the phase description. Add `NEXT_PUBLIC_SITE_URL` to the docs CI workflow and confirm with manual testing.

2. **Should manifest PNGs go in `app/` or `public/`?**
   - What we know: The manifest.ts references icons by URL path (`/icon-192.png`). Next.js file convention for icons only auto-generates `<link>` tags, not manifest entries. Manifest icons need to be served as static files.
   - What's unclear: Whether placing `icon-192.png` in `app/` would conflict with the file-based icon convention (which auto-generates link tags for any `icon*` file).
   - Recommendation: Place manifest PNGs in `public/` to avoid accidental `<link>` tag generation. They will be copied to `out/` during build.

3. **Should the icon generation script run as a turbo task or npm script?**
   - What we know: Both apps need the same generated files. The script uses dev dependencies (sharp, sharp-ico).
   - What's unclear: Whether to run once at root or per-app.
   - Recommendation: Run as a root-level npm script (`pnpm generate-icons`) that outputs to both apps. Could be a turbo `generate-icons` task that runs before `build`. The SVG favicon (icon.svg) is hand-crafted, not generated.

## Sources

### Primary (HIGH confidence)
- [Next.js Metadata Files: app-icons](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons) - File convention for favicon, icon, apple-icon; supported file types; auto-generated `<head>` output
- [Next.js Metadata Files: manifest](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest) - Static and dynamic manifest file support; MetadataRoute.Manifest type
- [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) - metadataBase documentation; icons config; URL composition rules
- [Next.js generateViewport](https://nextjs.org/docs/app/api-reference/functions/generate-viewport) - themeColor via viewport export (replaces deprecated metadata.themeColor)
- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports) - Route Handlers (GET) work with output: 'export'; generates static files at build time

### Secondary (MEDIUM confidence)
- [web.dev - Building an adaptive favicon](https://web.dev/building-an-adaptive-favicon/) - SVG favicon with prefers-color-scheme CSS for dark/light mode
- [Frontend Masters - How to Favicon in 2024](https://frontendmasters.com/blog/how-to-favicon-in-2024/) - Minimal favicon set: ICO + SVG + apple-touch-icon + manifest PNGs
- [Evil Martians - How to Favicon in 2026](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs) - Three-file minimum approach; updated through 2026
- [sharp-ico GitHub](https://github.com/ssnangua/sharp-ico) - API: sharpsToIco, encode; PNG buffer to ICO encoding
- [Nextra Head component](https://nextra.site/docs/built-ins/head) - faviconGlyph prop; no default favicon injection without prop

### Tertiary (LOW confidence)
- [Owen Conti - Supporting Dark Mode with SVG Favicons](https://owenconti.com/posts/supporting-dark-mode-with-svg-favicons) - Community example of prefers-color-scheme in SVG favicon; needs browser testing to verify current support

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Next.js file-based metadata is well-documented official feature; sharp is the standard Node.js image processor
- Architecture: HIGH - File placement conventions are explicitly documented by Next.js; static export compatibility confirmed
- Pitfalls: HIGH - Common issues (deprecated themeColor, ICO sizes, apple-icon format) are well-documented in official sources
- Dark/light SVG: MEDIUM - Browser support is ~74% for SVG favicons with CSS; approach is proven but needs ICO fallback

**Research date:** 2026-02-11
**Valid until:** 2026-04-11 (Next.js metadata API is stable; favicon best practices change slowly)
