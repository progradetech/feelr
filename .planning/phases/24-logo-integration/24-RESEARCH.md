# Phase 24: Logo Integration - Research

**Researched:** 2026-02-11
**Domain:** Next.js Image/SVG rendering, Nextra theme docs Navbar logo prop, static export image handling
**Confidence:** HIGH

## Summary

Phase 24 replaces text-based "Feelr" branding with the actual logo image in three surfaces: the dashboard sidebar header, the Nextra docs site navbar, and the landing page hero section. The logo assets already exist in `assets/` as SVG files from the brand design work, and Phase 23 already established the icon/favicon pipeline. This phase is purely about rendering existing SVGs in the UI.

The codebase currently uses zero `<img>` tags or `next/image` imports anywhere. Both apps use `output: 'export'` with `images: { unoptimized: true }`, which means `next/image` works but skips the optimization server (all image URLs pass through as-is). There is no SVGR, no webpack SVG loader, and no custom bundler configuration. The simplest, most reliable approach is to copy the SVG files into each app's `public/` directory and reference them with plain `<img>` tags. This avoids adding any new dependencies or build configuration.

The three target locations are clearly identifiable: `sidebar.tsx` line 41-43 (dashboard sidebar header text), `layout.tsx` line 26 (Nextra Navbar logo prop), and `page.tsx` lines 84-105 (landing page hero section). Each requires a slightly different treatment -- the sidebar needs a compact logomark, the docs navbar needs the logomark with "Feelr" text alongside it, and the hero section should display the full logo prominently.

**Primary recommendation:** Copy SVG assets to each app's `public/` directory and use plain `<img>` tags with explicit `width`/`height` attributes. No new dependencies needed.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next/image (optional) | ^15.3 (already installed) | Image component with lazy loading, size hints | Built into Next.js; works with `output: 'export'` when `images.unoptimized: true` |
| Plain `<img>` tag | HTML standard | SVG rendering in components | Zero config; SVGs are vector and don't need optimization; simplest approach for static export |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React inline SVG | N/A | Paste SVG markup directly as JSX | When you need CSS control over SVG fills/strokes (e.g., theme-aware coloring) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<img src="/logo.svg">` | `next/image` component | next/image adds width/height enforcement and lazy loading, but SVGs don't benefit from optimization; img is simpler |
| `<img src="/logo.svg">` | SVGR (inline SVG as React component) | Requires @svgr/webpack config in next.config; adds build complexity; overkill for 2-3 logo placements |
| `<img src="/logo.svg">` | Inline SVG in JSX | Works but 80+ lines of SVG markup clutters components; harder to maintain if logo changes |
| Copying SVGs to `public/` | Import SVGs directly (webpack) | Requires webpack/turbopack config; not set up in this project |

**Installation:**
```bash
# No new dependencies needed
```

## Architecture Patterns

### Recommended File Structure

```
assets/
  feelr-logo.svg              # Source: full logo (400x400, lobster with circle)
  feelr-logomark.svg           # Source: logomark only (200x200, antennae)
apps/dashboard/
  public/
    icon-192.png               # Already exists (from Phase 23)
    icon-512.png               # Already exists (from Phase 23)
    feelr-logomark.svg         # NEW: copied from assets/ for sidebar + login
    feelr-logo.svg             # NEW: copied from assets/ for hero section
  src/components/
    sidebar.tsx                # MODIFIED: img tag replaces "Feelr" text
  src/app/
    page.tsx                   # MODIFIED: logo added to hero section
    login/page.tsx             # MODIFIED (stretch): logo replaces "Feelr" text
apps/docs/
  public/
    icon-192.png               # Already exists (from Phase 23)
    icon-512.png               # Already exists (from Phase 23)
    feelr-logomark.svg         # NEW: copied from assets/ for navbar
  app/
    layout.tsx                 # MODIFIED: Navbar logo prop gets img element
```

### Pattern 1: SVG in `public/` with `<img>` Tag

**What:** Place SVG files in `public/` directory, reference via `<img>` with explicit dimensions.
**When to use:** For logo images that don't need dynamic CSS control over internal SVG elements. This is the standard approach when SVGs are treated as images (not interactive/themed).
**Example:**

```tsx
// Dashboard sidebar header
<div className="flex h-14 items-center gap-2 px-5">
  <img
    src="/feelr-logomark.svg"
    alt="Feelr"
    width={28}
    height={28}
  />
  <span className="text-lg font-semibold tracking-tight text-white">
    Feelr
  </span>
</div>
```

Source: Standard HTML; Next.js `public/` directory serves static files at root path.

### Pattern 2: Nextra Navbar Logo with Image

**What:** Pass a React element containing an `<img>` (or `next/image`) to the Nextra `<Navbar logo={...}>` prop.
**When to use:** Replacing the current `<b>Feelr</b>` text in the docs navbar.
**Example:**

```tsx
// apps/docs/app/layout.tsx
const navbar = (
  <Navbar
    logo={
      <span className="flex items-center gap-2">
        <img
          src="/feelr-logomark.svg"
          alt="Feelr"
          width={24}
          height={24}
        />
        <span className="font-bold">Feelr</span>
      </span>
    }
    projectLink="https://github.com/andrewprograde/feelr"
  />
)
```

The Nextra Navbar wraps the logo prop in a `<NextLink>` with `display: flex; align-items: center;`, so the logo element renders inline in the navbar. The `logo` prop accepts any `ReactNode`.

Source: Verified from `nextra-theme-docs/dist/components/navbar/index.js` and `index.d.mts` in the project's node_modules.

### Pattern 3: Landing Page Hero Logo

**What:** Display the full Feelr logo prominently above or alongside the hero headline.
**When to use:** LOGO-03 -- landing page hero section.
**Example:**

```tsx
// apps/dashboard/src/app/page.tsx - Hero section
<section className="px-4 py-16 md:px-6 md:py-24">
  <div className="mx-auto max-w-6xl text-center">
    <img
      src="/feelr-logo.svg"
      alt="Feelr"
      width={96}
      height={96}
      className="mx-auto mb-8"
    />
    <h1 className="font-heading text-4xl font-bold text-white md:text-5xl lg:text-6xl">
      One CLI. One API key.
      <br />
      Every integration.
    </h1>
    ...
  </div>
</section>
```

Source: Standard pattern; full logo (with background circle) is appropriate for hero contexts where size is large enough.

### Pattern 4: next/image with Static Export (Alternative)

**What:** Use the Next.js `<Image>` component even with `output: 'export'`.
**When to use:** If you want built-in lazy loading, priority hints, or future optimization capability.
**Example:**

```tsx
import Image from 'next/image';

<Image
  src="/feelr-logomark.svg"
  alt="Feelr"
  width={28}
  height={28}
  priority  // Above-the-fold logo should not lazy-load
/>
```

With `images: { unoptimized: true }` in next.config, `<Image>` renders a plain `<img>` tag with the same `src` path. The only benefit over `<img>` is the `priority` prop (adds `fetchpriority="high"` and preload link) and future compatibility if optimization is re-enabled.

Source: [Next.js Static Exports - Image Optimization](https://nextjs.org/docs/app/guides/static-exports#image-optimization)

### Anti-Patterns to Avoid

- **Inline SVG for complex logos:** The `feelr-logo.svg` is 86 lines of SVG markup with gradients and multiple shapes. Pasting this into JSX creates unmaintainable components. Use `<img>` instead.
- **SVG gradient ID collisions:** If inlining SVGs, the gradient IDs (`logoGrad`, `bodyGrad`, `markGradL`, etc.) will collide if the same SVG is rendered multiple times on a page. The `<img>` approach avoids this entirely since each `<img>` loads the SVG in its own document context.
- **Missing alt text on logo images:** Always include `alt="Feelr"` for accessibility. Screen readers need to identify the logo.
- **Missing width/height on `<img>` for SVG:** Without explicit dimensions, SVGs may render at their intrinsic size (400x400 or 200x200 pixels), causing layout shift. Always specify width and height.
- **Using the full logo in small contexts:** The `feelr-logo.svg` (full lobster) has fine details that become illegible below ~64px. Use `feelr-logomark.svg` (antennae only) for sidebar and navbar contexts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG as React component | Custom SVGR webpack config | `<img>` tag referencing `public/` SVG | No build config needed; SVGs are static brand assets, not interactive components |
| Dark/light mode logo variant | Runtime SVG manipulation | Separate SVG file per theme, or CSS `filter` | Logo SVGs have complex gradients; runtime manipulation is fragile |
| Logo component library | Shared `@feelr/ui` package with logo exports | Direct `<img>` in each consuming file | Only 3 placements; shared package adds indirection for trivial usage |

**Key insight:** With only 3 logo placements across the entire codebase, the simplest approach (copy to `public/`, use `<img>`) is the right one. Building abstractions around logo rendering is premature.

## Common Pitfalls

### Pitfall 1: SVG Renders at Wrong Size Without Width/Height

**What goes wrong:** SVG renders at its intrinsic pixel dimensions (200x200 or 400x400) instead of the intended small display size, causing layout breakage.
**Why it happens:** SVGs without explicit sizing on the `<img>` tag render at the dimensions specified in the SVG `width`/`height` attributes.
**How to avoid:** Always set `width` and `height` attributes on the `<img>` tag. For the sidebar (28px), navbar (24px), and hero (96px), these must be explicit.
**Warning signs:** Logo appears massive or causes horizontal scrolling.

### Pitfall 2: SVG Gradient IDs Break When Inlined Multiple Times

**What goes wrong:** If the same SVG is inlined as JSX multiple times on a page, the `<linearGradient id="markGradL">` definitions collide, and only the first gradient definition is used.
**Why it happens:** SVG gradient IDs are document-scoped. Duplicate IDs cause undefined behavior.
**How to avoid:** Use `<img>` instead of inline SVG. Each `<img>` loads the SVG in its own isolated document context, preventing ID collisions.
**Warning signs:** Second instance of logo renders without gradients (solid black fills).

### Pitfall 3: Logo Not Visible on Dark Background

**What goes wrong:** The `feelr-logomark.svg` uses white fills for antenna tips (`<circle ... fill="#fff"/>`). These are visible on dark backgrounds but invisible on light backgrounds.
**Why it happens:** The SVG was designed for dark mode (zinc-950 backgrounds in both dashboard and docs).
**How to avoid:** For the dashboard (always dark theme), this is fine. For the Nextra docs site (which supports light/dark mode), the logo with white tips may be invisible in light mode. Test with both themes; may need a light-variant SVG or CSS `filter` inversion for the docs navbar.
**Warning signs:** Logo disappears or becomes invisible when Nextra theme is switched to light mode.

### Pitfall 4: Nextra Navbar Logo Prop Sizing

**What goes wrong:** The logo image renders too large or too small in the Nextra navbar, misaligning with the navbar text and icons.
**Why it happens:** The Nextra navbar has its own padding and font sizing. The logo prop is wrapped in a flex container with `items-center`.
**How to avoid:** Use a height of ~24px for the navbar logo, consistent with Nextra's default text sizing. Wrap in a flex container with `gap-2` for spacing between logo image and text.
**Warning signs:** Logo vertically misaligned with navbar items; logo overflows navbar height.

### Pitfall 5: Forgetting to Copy SVGs to Both Apps

**What goes wrong:** SVG exists in `apps/dashboard/public/` but not `apps/docs/public/`, causing 404 on the docs site.
**Why it happens:** Two separate apps with separate `public/` directories.
**How to avoid:** Copy SVGs to both `apps/dashboard/public/` and `apps/docs/public/`. Consider a turbo task or script that syncs assets, or document the manual copy step.
**Warning signs:** Broken image icon on one site but working on the other.

### Pitfall 6: Login Page Logo Left as Text

**What goes wrong:** Dashboard sidebar and hero show the logo, but the login page still displays plain "Feelr" text, creating visual inconsistency.
**Why it happens:** Login page (`src/app/login/page.tsx`) also has "Feelr" text in an `<h1>` (line 58-60) that could be overlooked.
**How to avoid:** While LOGO-01/02/03 don't explicitly mention the login page, visual consistency demands updating it too. Plan for it as a follow-up or stretch goal.
**Warning signs:** User sees logo on landing page, then text-only on login page.

## Code Examples

Verified patterns from the existing codebase:

### Current Sidebar (Before -- to be modified)

```tsx
// apps/dashboard/src/components/sidebar.tsx, lines 40-44
<div className="flex h-14 items-center px-5">
  <span className="text-lg font-semibold tracking-tight text-white">
    Feelr
  </span>
</div>
```

### Current Docs Navbar (Before -- to be modified)

```tsx
// apps/docs/app/layout.tsx, lines 24-29
const navbar = (
  <Navbar
    logo={<b>Feelr</b>}
    projectLink="https://github.com/andrewprograde/feelr"
  />
)
```

### Current Landing Hero (Before -- to be modified)

```tsx
// apps/dashboard/src/app/page.tsx, lines 84-105
<section className="px-4 py-16 md:px-6 md:py-24">
  <div className="mx-auto max-w-6xl text-center">
    <h1 className="font-heading text-4xl font-bold text-white md:text-5xl lg:text-6xl">
      One CLI. One API key.
      <br />
      Every integration.
    </h1>
    ...
  </div>
</section>
```

### Recommended Sidebar (After)

```tsx
// apps/dashboard/src/components/sidebar.tsx
<div className="flex h-14 items-center gap-2 px-5">
  <img
    src="/feelr-logomark.svg"
    alt="Feelr"
    width={28}
    height={28}
  />
  <span className="text-lg font-semibold tracking-tight text-white">
    Feelr
  </span>
</div>
```

Note: The requirement says "displays the Feelr logomark image instead of the 'Feelr' text." This could mean replacing text entirely or adding the image alongside text. The success criterion says "instead of" so the text may be removed. Both approaches are shown for planner consideration.

### Recommended Sidebar (Logo Only, No Text)

```tsx
// apps/dashboard/src/components/sidebar.tsx
<div className="flex h-14 items-center px-5">
  <img
    src="/feelr-logomark.svg"
    alt="Feelr"
    width={28}
    height={28}
  />
</div>
```

### Recommended Docs Navbar (After)

```tsx
// apps/docs/app/layout.tsx
const navbar = (
  <Navbar
    logo={
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <img src="/feelr-logomark.svg" alt="Feelr" width={24} height={24} />
        <b>Feelr</b>
      </span>
    }
    projectLink="https://github.com/andrewprograde/feelr"
  />
)
```

Note: Using inline styles because the docs layout is a Server Component and Nextra manages its own CSS. Tailwind classes should also work since the docs app renders within the Nextra layout.

### Recommended Hero (After)

```tsx
// apps/dashboard/src/app/page.tsx
<section className="px-4 py-16 md:px-6 md:py-24">
  <div className="mx-auto max-w-6xl text-center">
    <img
      src="/feelr-logo.svg"
      alt="Feelr"
      width={96}
      height={96}
      className="mx-auto mb-8"
    />
    <h1 className="font-heading text-4xl font-bold text-white md:text-5xl lg:text-6xl">
      One CLI. One API key.
      <br />
      Every integration.
    </h1>
    ...
  </div>
</section>
```

## Existing Codebase State

### Asset Details

| Asset | Path | Dimensions | ViewBox | Content |
|-------|------|------------|---------|---------|
| Full logo | `assets/feelr-logo.svg` | 400x400 | 0 0 120 120 | Lobster with background circle, antennae, claws, eyes, signal waves |
| Logomark | `assets/feelr-logomark.svg` | 200x200 | 0 0 40 40 | Just the antennae with glowing tips and connecting arc |

### Logo Colors (from SVGs)

| Element | Color | Hex |
|---------|-------|-----|
| Antenna gradient start | Lobster Red | `#E85D3A` |
| Antenna gradient end | Lavender | `#C4B5FD` |
| Antenna tip outer | Lavender | `#C4B5FD` |
| Antenna tip inner | White | `#fff` |
| Connecting arc | Lobster Red | `#E85D3A` |
| Logo background circle | Near-black | `#0a0a14` |
| Logo circle border gradient | Purple to green | `#8B5CF6` -> `#C4B5FD` -> `#34D399` |

### Current Text Branding Locations

| Location | File | Line(s) | Current Markup | Requirement |
|----------|------|---------|----------------|-------------|
| Dashboard sidebar | `apps/dashboard/src/components/sidebar.tsx` | 41-43 | `<span>Feelr</span>` | LOGO-01 |
| Docs navbar | `apps/docs/app/layout.tsx` | 26 | `<b>Feelr</b>` | LOGO-02 |
| Landing hero | `apps/dashboard/src/app/page.tsx` | 84-105 | No logo, just headline | LOGO-03 |
| Login page | `apps/dashboard/src/app/login/page.tsx` | 58-60 | `<h1>Feelr</h1>` | Not required (stretch) |
| Landing footer | `apps/dashboard/src/app/page.tsx` | 183 | `Feelr` link text | Not required |

### Image Handling Status

- **No `<img>` or `next/image` usage** anywhere in the codebase currently
- **No SVGR or SVG webpack loader** configured
- Both apps use `output: 'export'` with `images: { unoptimized: true }`
- `next/image` would work but renders as plain `<img>` due to unoptimized flag
- Dashboard `public/` contains: `icon-192.png`, `icon-512.png` (from Phase 23)
- Docs `public/` contains: `icon-192.png`, `icon-512.png` (from Phase 23)

### Nextra Navbar API (Verified from node_modules)

```typescript
// nextra-theme-docs NavbarProps
interface NavbarProps {
  logo: ReactNode;           // Required -- any React element
  logoLink?: string | boolean; // Default: true (links to "/")
  projectLink?: string;
  projectIcon?: ReactNode;
  chatLink?: string;
  chatIcon?: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}
```

The Navbar wraps `logo` in `<NextLink href="/" className="flex items-center ...">`. This means the logo element renders inside a flex container that already has `items-center`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SVGR webpack config for SVG-as-component | Plain `<img>` for static SVGs | Always valid; SVGR adds unnecessary complexity for static logos | Simpler config, no build dependency |
| Inline SVG in JSX | `<img>` referencing `public/` SVG | Best practice for complex SVGs with gradients | Prevents ID collision, cleaner components |
| `next/image` required for all images | `<img>` fine for SVGs in static export | Always valid for unoptimized mode | SVGs don't benefit from image optimization |

**Deprecated/outdated:**
- None relevant to this phase. Plain `<img>` tags and `public/` directory are stable, long-standing web standards.

## Open Questions

1. **Logomark only vs. logomark + text in sidebar?**
   - What we know: LOGO-01 says "displays the Feelr logomark image instead of the 'Feelr' text." The success criterion says "instead of."
   - What's unclear: Whether "instead of" means the logomark completely replaces the text (image only), or the logomark is displayed alongside/above the text. A 28px logomark alone may not be immediately recognizable as "Feelr" to new users.
   - Recommendation: The planner should decide. Both code patterns are provided above. The safest choice is logomark + text for recognition, matching standard dashboard patterns (e.g., GitHub, Vercel sidebars show logo + wordmark). However, the literal requirement says "instead of."

2. **Which logo asset for each context?**
   - What we know: Two assets exist -- full logo (lobster in circle, 400x400) and logomark (antennae only, 200x200).
   - What's unclear: Whether the hero should use the full logo or the logomark.
   - Recommendation: Use `feelr-logomark.svg` for sidebar (28px) and navbar (24px) where space is tight. Use `feelr-logo.svg` for the hero section where it can be displayed at 80-120px. The full logo has a dark background circle that works well as a standalone hero element.

3. **Docs site light mode compatibility**
   - What we know: The logomark SVG has white-filled inner circles on antenna tips (`fill="#fff"`). The Nextra docs theme supports light and dark mode toggling.
   - What's unclear: Whether the white fills will be invisible against a light background in the docs navbar.
   - Recommendation: Test in both themes. If the logo is invisible in light mode, create a variant SVG or use CSS `filter: invert()` / `brightness()` on the `<img>` based on the Nextra theme class (Nextra uses `html.dark` class). The gradient strokes (#E85D3A to #C4B5FD) should be visible on both light and dark backgrounds -- it's only the tiny white tip centers that may disappear.

4. **Login page consistency**
   - What we know: The login page at `apps/dashboard/src/app/login/page.tsx` has "Feelr" as `<h1>` text (line 58-60). It's not listed in LOGO-01/02/03 requirements.
   - What's unclear: Whether to update it for visual consistency.
   - Recommendation: Include as an optional/stretch task. The login page is a natural transition point between landing (which will have logo) and dashboard (which will have logo in sidebar). Having text-only login creates visual inconsistency.

## Sources

### Primary (HIGH confidence)
- **Project codebase** - Direct file inspection of all target components, assets, configurations
  - `apps/dashboard/src/components/sidebar.tsx` - Current sidebar implementation
  - `apps/docs/app/layout.tsx` - Current Nextra navbar setup
  - `apps/dashboard/src/app/page.tsx` - Current landing page hero
  - `assets/feelr-logo.svg` and `assets/feelr-logomark.svg` - Logo assets
  - `apps/dashboard/next.config.ts` and `apps/docs/next.config.mjs` - Static export config
- **nextra-theme-docs v4.2 node_modules** - Navbar component type definitions and implementation (`dist/components/navbar/index.d.mts`, `index.js`)

### Secondary (MEDIUM confidence)
- [Next.js Static Exports docs](https://nextjs.org/docs/app/guides/static-exports) - Confirmed `next/image` works with unoptimized flag
- [Next.js `public` directory docs](https://nextjs.org/docs/app/api-reference/file-conventions/public-folder) - Files served at root path

### Tertiary (LOW confidence)
- None. All findings are verified from the codebase and official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Plain `<img>` tags and `public/` directory are foundational web standards; no libraries needed
- Architecture: HIGH - All target files identified and read; exact line numbers documented; Nextra Navbar API verified from source
- Pitfalls: HIGH - SVG sizing, gradient ID collisions, and dark/light mode issues are well-understood SVG behaviors
- Nextra logo prop: HIGH - Verified from actual compiled source in node_modules

**Research date:** 2026-02-11
**Valid until:** 2026-06-11 (SVG rendering and `<img>` tags are evergreen web standards; Nextra API is stable)
