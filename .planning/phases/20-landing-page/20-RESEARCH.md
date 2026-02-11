# Phase 20: Landing Page - Research

**Researched:** 2026-02-11
**Domain:** Next.js 15 landing page with brand typography, SEO metadata, and analytics
**Confidence:** HIGH

## Summary

Phase 20 replaces the current root `page.tsx` (a `'use client'` redirect component) with a server-rendered landing page at `app.feelr.dev`. The critical architectural change is converting this file from a client component to a server component, which is required for metadata exports (Open Graph, SEO tags). The landing page must display a hero section, install commands, connector feature cards, and brand typography -- all within the existing Next.js 15 static export (`output: 'export'`) pipeline that deploys to Azure Static Web Apps.

The three fonts required (Space Grotesk for headings, JetBrains Mono for code blocks, Inter for body text) are all available as Google variable fonts and can be loaded via `next/font/google` with zero external requests. The integration with Tailwind CSS v4 uses CSS variables set on the `<html>` element and remapped through the `@theme inline` block in `globals.css`. Cloudflare Web Analytics requires a single `<script>` tag with a beacon token, best added via the Next.js `<Script>` component with the `afterInteractive` strategy (which is supported in static exports).

**Primary recommendation:** Convert `app/page.tsx` from a `'use client'` redirect to a server component with a static landing page, extract redirect logic into a client `<LandingRedirect>` component, define all three fonts in a shared `app/fonts.ts` file wired to Tailwind v4 through `@theme inline` CSS variables, and add metadata exports to both `layout.tsx` (base) and `page.tsx` (landing-specific OG tags).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.3.0 | Framework (already installed) | Powers SSG, `next/font`, metadata API |
| next/font/google | (built-in) | Self-hosted Google Fonts at build time | Zero external requests, no layout shift, automatic subsetting |
| Tailwind CSS | ^4.0.0 | Utility CSS (already installed) | CSS-first config with `@theme` blocks |
| lucide-react | ^0.469.0 | Icons (already installed) | Consistent with existing dashboard icons |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/script | (built-in) | Third-party script loading | Cloudflare Web Analytics beacon |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `next/font/google` | Google Fonts CDN `@import` | CDN adds external request, layout shift risk, privacy concern. `next/font` self-hosts at build time -- strictly better for static export. |
| Tailwind `@theme` font vars | Inline `style` attributes | Would bypass Tailwind utility system, lose `font-heading` / `font-mono` classes across codebase. |
| `<Script>` component | Raw `<script>` in layout | Next.js `<Script>` handles loading strategy, deduplication; `afterInteractive` is correct for analytics. |

**Installation:**
No new packages needed. All three fonts come from `next/font/google` (built-in). No npm install required.

## Architecture Patterns

### Recommended Project Structure
```
apps/dashboard/src/
├── app/
│   ├── fonts.ts                    # Font definitions (Space_Grotesk, JetBrains_Mono, Inter)
│   ├── globals.css                 # Tailwind imports + @theme inline font mapping
│   ├── layout.tsx                  # Root layout: font vars on <html>, base metadata, analytics Script
│   ├── page.tsx                    # Landing page (SERVER component) with hero, install, features, metadata
│   ├── login/
│   │   └── page.tsx                # Existing login page (unchanged)
│   └── (dashboard)/
│       ├── layout.tsx              # Dashboard layout with sidebar (unchanged)
│       └── ...                     # Existing dashboard pages (unchanged)
├── components/
│   ├── landing-redirect.tsx        # NEW: Client component that handles auth redirect logic
│   ├── copy-button.tsx             # NEW: Client component for clipboard copy on install commands
│   ├── cf-analytics.tsx            # NEW: Client component wrapping <Script> for CF Web Analytics
│   └── ...                         # Existing components
└── lib/
    └── ...                         # Existing libs
```

### Pattern 1: Server Component Root Page with Client Islands
**What:** The root `page.tsx` becomes a server component (no `'use client'` directive) that exports static metadata and renders the landing page HTML. Interactive elements (auth-check redirect, copy-to-clipboard) are extracted into small client components imported into the page.
**When to use:** When a page needs both SEO metadata exports AND client-side interactivity.
**Example:**
```typescript
// Source: https://nextjs.org/docs/app/getting-started/metadata-and-og-images
// app/page.tsx (SERVER component -- no 'use client')
import type { Metadata } from 'next';
import { LandingRedirect } from '@/components/landing-redirect';
import { CopyButton } from '@/components/copy-button';

export const metadata: Metadata = {
  title: 'Feelr - Agent-Friendly API Simplification',
  description: 'One CLI, one API key, every integration.',
  openGraph: {
    title: 'Feelr - Agent-Friendly API Simplification',
    description: 'One CLI, one API key, every integration.',
    url: 'https://app.feelr.dev',
    siteName: 'Feelr',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Feelr - Agent-Friendly API Simplification',
    description: 'One CLI, one API key, every integration.',
  },
};

export default function LandingPage() {
  return (
    <>
      <LandingRedirect />  {/* Client component: checks auth/demo, redirects if needed */}
      <div className="min-h-screen bg-zinc-950">
        {/* Hero section */}
        {/* Install commands with <CopyButton /> */}
        {/* Feature cards */}
      </div>
    </>
  );
}
```

### Pattern 2: Font Definitions File with CSS Variable Bridge to Tailwind v4
**What:** Define all fonts in a single `fonts.ts` file using `next/font/google` with `variable` option. Apply CSS variable classes to `<html>` in `layout.tsx`. Map to Tailwind utilities via `@theme inline` in `globals.css`.
**When to use:** When multiple fonts must be available as Tailwind utility classes across the app.
**Example:**
```typescript
// Source: https://nextjs.org/docs/app/api-reference/components/font#with-tailwind-css
// app/fonts.ts
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});
```

```css
/* Source: https://nextjs.org/docs/app/api-reference/components/font#with-tailwind-css */
/* globals.css */
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-inter);
  --font-heading: var(--font-space-grotesk);
  --font-mono: var(--font-jetbrains-mono);
}
```

```tsx
// layout.tsx
import { inter, spaceGrotesk, jetbrainsMono } from './fonts';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="bg-zinc-950 font-sans text-zinc-50 antialiased">
        {/* ... */}
      </body>
    </html>
  );
}
```

### Pattern 3: Cloudflare Web Analytics via Script Component
**What:** Add the Cloudflare beacon script using Next.js `<Script>` component with `strategy="afterInteractive"`.
**When to use:** For third-party analytics scripts in a static export.
**Example:**
```typescript
// Source: https://developers.cloudflare.com/web-analytics/get-started/
// Source: https://nextjs.org/docs/app/api-reference/components/script
// components/cf-analytics.tsx
'use client';

import Script from 'next/script';

export function CfAnalytics({ token }: { token: string }) {
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={`{"token": "${token}"}`}
      strategy="afterInteractive"
    />
  );
}
```

### Anti-Patterns to Avoid
- **Exporting metadata from a `'use client'` component:** Metadata exports are ONLY supported in Server Components. The current `page.tsx` has `'use client'` -- this MUST be removed for metadata to work. Attempting to export `metadata` from a client component will produce a build error.
- **Putting redirect logic directly in a server component:** `useRouter`, `useEffect`, `sessionStorage` cannot run in server components. The auth-check redirect logic currently in `page.tsx` must be extracted into a separate client component.
- **Using `@import url(...)` for Google Fonts before `@import "tailwindcss"`:** Tailwind v4 `@import` order matters. If Google Font imports are placed after `@import "tailwindcss"`, they may not work. However, with `next/font/google`, no `@import url(...)` is needed at all -- fonts are self-hosted.
- **Using `@theme` (non-inline) for font variables from `next/font`:** With `next/font`, CSS variables are injected at runtime by class names on `<html>`. Tailwind must use `@theme inline` (not just `@theme`) to read these runtime CSS variables. The `inline` keyword tells Tailwind to reference the variable at runtime rather than trying to resolve it at build time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Font loading & optimization | Manual `@font-face` declarations, Google Fonts CDN links | `next/font/google` | Automatic self-hosting, subsetting, zero layout shift, build-time optimization |
| Copy to clipboard | Custom clipboard API wrapper with fallback | Navigator clipboard API in a small client component | Clipboard API is well-supported; a 10-line component suffices. No library needed. |
| SEO metadata tags | Manual `<head>` `<meta>` tags | Next.js `Metadata` object export | Next.js handles tag generation, deduplication, merging across layouts |
| Analytics script loading | Manual `<script>` injection | Next.js `<Script>` component | Handles loading strategy, hydration timing, deduplication |
| Responsive design | CSS media queries | Tailwind responsive prefixes (`md:`, `lg:`) | Consistent with existing codebase pattern |

**Key insight:** The entire landing page can be built with zero new npm dependencies. Everything needed -- fonts, metadata, analytics script loading, responsive layout -- is provided by Next.js built-ins and the existing Tailwind CSS setup.

## Common Pitfalls

### Pitfall 1: Root page.tsx Conversion Breaks Demo Mode
**What goes wrong:** The current `page.tsx` is a `'use client'` component that uses `useDemo()` and `useRouter()` to redirect authenticated/demo users to `/overview`. Removing `'use client'` to enable metadata exports will break this redirect logic.
**Why it happens:** Server components cannot use React hooks, `useEffect`, `useRouter`, or access `sessionStorage`.
**How to avoid:** Extract the redirect logic into a dedicated client component `<LandingRedirect />` that is imported into the server component page. This component renders nothing visible but performs the auth check on mount.
**Warning signs:** Build errors mentioning "hooks can only be called in client components" or metadata not appearing in page source.

### Pitfall 2: Tailwind @theme vs @theme inline
**What goes wrong:** Defining `--font-sans: var(--font-inter)` inside `@theme` (without `inline`) causes Tailwind to try to resolve the variable at build time. Since `--font-inter` is injected by `next/font` at runtime via class names, Tailwind cannot see it at build time and the font falls back to the default stack.
**Why it happens:** Tailwind v4 has two modes: `@theme` (static, resolved at build) and `@theme inline` (dynamic, kept as `var()` references in output CSS).
**How to avoid:** Always use `@theme inline` when referencing CSS variables injected by `next/font`.
**Warning signs:** Fonts work in dev but not in production build, or `font-sans` resolves to system UI instead of Inter.

### Pitfall 3: Metadata Not Appearing in Static Export HTML
**What goes wrong:** Open Graph tags are missing from the generated HTML files in the `out/` directory.
**Why it happens:** Metadata exports only work from Server Components. If the page still has `'use client'`, metadata will be silently ignored (or error during build).
**How to avoid:** Verify page.tsx does NOT have `'use client'` directive. After build, inspect `out/index.html` to confirm `<meta property="og:title">` tags are present.
**Warning signs:** Social media preview shows no title/description when sharing the URL.

### Pitfall 4: Font Variable Class Not Applied to <html>
**What goes wrong:** Fonts are imported and configured but the CSS variable classes (e.g., `inter.variable`) are not added to the `<html>` element, so Tailwind utilities like `font-sans` have no font to reference.
**Why it happens:** Developer forgets to apply all three font variable classes to the `<html>` element's `className`.
**How to avoid:** In `layout.tsx`, concatenate all font `.variable` properties into the `<html>` className: `className={\`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} dark\`}`.
**Warning signs:** Body text renders in system default font instead of Inter.

### Pitfall 5: Cloudflare Analytics Token Hardcoded
**What goes wrong:** The Cloudflare Web Analytics beacon token is committed to source code.
**Why it happens:** The token is needed at build time for the static export.
**How to avoid:** Use an environment variable `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` and inject at build time. The CI/CD pipeline already supports `NEXT_PUBLIC_*` env vars. Token is not truly secret (it is visible in page source), but environment variables keep it configurable per environment (staging vs production) and out of source.
**Warning signs:** Staging and production sharing the same analytics data stream.

### Pitfall 6: Static Export with Unoptimized Images
**What goes wrong:** Using `next/image` with the default loader fails in static exports.
**Why it happens:** The project already has `images: { unoptimized: true }` in `next.config.ts`, which is correct. But if someone adds `next/image` without `unoptimized`, it will fail.
**How to avoid:** Any images on the landing page should use standard `<img>` tags or `next/image` with `unoptimized` already enabled globally. For simple SVG icons (connector logos), use inline SVGs or lucide-react icons.
**Warning signs:** Build error: "Image Optimization using the default loader is not compatible with `output: export`".

## Code Examples

Verified patterns from official sources:

### Multiple Google Fonts with CSS Variables
```typescript
// Source: https://nextjs.org/docs/app/api-reference/components/font#with-tailwind-css
// app/fonts.ts
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});
```

### Tailwind v4 @theme inline Font Mapping
```css
/* Source: https://nextjs.org/docs/app/api-reference/components/font#with-tailwind-css */
/* Source: https://tailwindcss.com/docs/font-family */
/* globals.css */
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-inter);
  --font-heading: var(--font-space-grotesk);
  --font-mono: var(--font-jetbrains-mono);
}
```

### Root Layout with Font Variables and Base Metadata
```typescript
// Source: https://nextjs.org/docs/app/getting-started/metadata-and-og-images
// app/layout.tsx
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { CfAnalytics } from '@/components/cf-analytics';
import { inter, spaceGrotesk, jetbrainsMono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.feelr.dev'),
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="bg-zinc-950 font-sans text-zinc-50 antialiased">
        <Providers>{children}</Providers>
        <Toaster theme="dark" />
        {process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN && (
          <CfAnalytics token={process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN} />
        )}
      </body>
    </html>
  );
}
```

### Static Metadata Export for Landing Page
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata#opengraph
// app/page.tsx (SERVER component)
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    absolute: 'Feelr - Agent-Friendly API Simplification',
  },
  description: 'One CLI, one API key, every integration. Connect GitHub, Slack, Stripe, and Discord in seconds.',
  openGraph: {
    title: 'Feelr - Agent-Friendly API Simplification',
    description: 'One CLI, one API key, every integration. Connect GitHub, Slack, Stripe, and Discord in seconds.',
    url: 'https://app.feelr.dev',
    siteName: 'Feelr',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Feelr - Agent-Friendly API Simplification',
    description: 'One CLI, one API key, every integration.',
  },
};
```

### Client Component for Auth Redirect (Extracted from Current page.tsx)
```typescript
// components/landing-redirect.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/auth';
import { useDemo } from '@/lib/demo-context';

export function LandingRedirect() {
  const router = useRouter();
  const { isDemo } = useDemo();

  useEffect(() => {
    if (isDemo) {
      router.replace('/overview');
      return;
    }
    const token = getAdminToken();
    if (token) {
      router.replace('/overview');
    }
  }, [router, isDemo]);

  return null; // Renders nothing -- purely behavioral
}
```

### Copy Button for Install Commands
```typescript
// components/copy-button.tsx
'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-zinc-500 transition-colors hover:text-zinc-300"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
```

### Cloudflare Web Analytics Script Component
```typescript
// Source: https://developers.cloudflare.com/web-analytics/get-started/
// Source: https://nextjs.org/docs/app/api-reference/components/script
// components/cf-analytics.tsx
'use client';

import Script from 'next/script';

export function CfAnalytics({ token }: { token: string }) {
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
      strategy="afterInteractive"
    />
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` fontFamily | `@theme inline` in CSS | Tailwind v4 (2024) | Font config lives in CSS, not JS |
| Google Fonts CDN `<link>` | `next/font/google` self-hosting | Next.js 13+ (2023) | Zero external requests, no layout shift |
| `_document.tsx` custom head | `export const metadata` | Next.js 13.2+ (2023) | Type-safe, merging, no manual `<head>` |
| `'use client'` for everything | Server Components by default | Next.js 13+ App Router | Better SSG, metadata support, smaller bundles |
| Tailwind v3 `@theme { --font-X: ... }` | Tailwind v4 `@theme inline { --font-X: var(--css-var) }` | Tailwind v4 (2024) | `inline` keyword needed for runtime CSS variables |

**Deprecated/outdated:**
- `themeColor` and `colorScheme` in metadata object: Deprecated in Next.js 14+, use `generateViewport` instead
- `tailwind.config.js` for font families in v4: While still supported via compat, `@theme` in CSS is the recommended approach
- `_document.tsx` / `<Head>` component: Replaced by metadata exports in App Router

## Open Questions

1. **Cloudflare Web Analytics Token**
   - What we know: The beacon script requires a token obtained from the Cloudflare dashboard. The script tag format is `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "xxx"}'></script>`.
   - What's unclear: The actual token value for `app.feelr.dev` -- this must be obtained from the Cloudflare dashboard.
   - Recommendation: Create a `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` environment variable. Add it to the CI/CD pipeline (`.github/workflows/dashboard.yml`). Conditionally render the `<Script>` component only when the token is set.

2. **OG Image Asset**
   - What we know: Open Graph tags support an `images` field with absolute URLs. A `public/` directory does not yet exist in the dashboard app.
   - What's unclear: Whether a custom OG image should be created for launch, or a text-only OG approach is sufficient initially.
   - Recommendation: Create a `public/` directory and add a simple `og-image.png` (1200x630). A minimal branded image (dark background with "Feelr" text) is sufficient for launch. Can be upgraded later with dynamic OG generation.

3. **Landing Page vs Login Page Relationship**
   - What we know: Currently, unauthenticated users are redirected to `/login`. With the landing page, unauthenticated users will see the landing page at `/` and can navigate to `/login` from the CTA button.
   - What's unclear: Should the `/login` page also link back to the landing page?
   - Recommendation: Yes, add a small "Back to home" link on the login page for navigation consistency.

## Sources

### Primary (HIGH confidence)
- [Next.js Font Optimization](https://nextjs.org/docs/app/getting-started/fonts) - Font loading, `next/font/google`, CSS variables (doc-version 16.1.6, 2026-02-09)
- [Next.js Font API Reference](https://nextjs.org/docs/app/api-reference/components/font) - `variable` option, Tailwind CSS integration, multiple fonts (doc-version 16.1.6, 2026-02-09)
- [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) - Static metadata, Open Graph, file-based metadata (doc-version 16.1.6, 2026-02-09)
- [Next.js generateMetadata Reference](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) - Full metadata fields, openGraph, twitter, metadataBase (doc-version 16.1.6, 2026-02-09)
- [Next.js Static Exports Guide](https://nextjs.org/docs/app/guides/static-exports) - Supported features, Server Components work at build time (doc-version 16.1.6, 2026-02-09)
- [Tailwind CSS v4 Font Family](https://tailwindcss.com/docs/font-family) - `@theme` / `@theme inline` syntax, `--font-*` CSS variables
- [Cloudflare Web Analytics Setup](https://developers.cloudflare.com/web-analytics/get-started/) - Beacon script, token format, manual installation

### Secondary (MEDIUM confidence)
- [Google Fonts - Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) - Variable font, weight range 300-700
- [Google Fonts - JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) - Variable font, available on Google Fonts
- [Google Fonts - Inter](https://fonts.google.com/specimen/Inter) - Variable font, standard body typeface
- [Tailwind CSS v4 Custom Fonts Discussion](https://github.com/tailwindlabs/tailwindcss/discussions/13890) - Community patterns for v4 font configuration
- [Next.js + Tailwind v4 Font Discussion](https://github.com/tailwindlabs/tailwindcss/discussions/15923) - Confirmed `@theme inline` pattern for next/font variables

### Tertiary (LOW confidence)
- None. All critical claims verified against official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, font integration verified against official Next.js 16.1.6 docs
- Architecture: HIGH - Server component + client island pattern is documented in official Next.js guides and verified with static export compatibility
- Pitfalls: HIGH - All pitfalls derived from direct codebase analysis (current `'use client'` on page.tsx) and official docs (metadata only in Server Components)
- Font integration: HIGH - `next/font/google` + Tailwind v4 `@theme inline` pattern explicitly documented in Next.js official docs (doc-version 16.1.6)
- Analytics: MEDIUM - Cloudflare beacon format verified, but exact token must be obtained from dashboard

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days -- stable technologies, no rapid changes expected)
