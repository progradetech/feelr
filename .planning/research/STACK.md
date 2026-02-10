# Technology Stack: Interactive Demo, Demo Dashboard Mode, and Landing Page

**Project:** Feelr -- Terminal Demo, Dashboard Demo Mode, Landing Page, GoReleaser Fix, CF Token Fix
**Researched:** 2026-02-10
**Confidence:** HIGH (verified against existing codebase, official docs, npm registry)

---

## Executive Summary

This milestone requires **zero new npm dependencies**. The existing stack (Next.js 15.3, React 19, SWR 2.3, Tailwind 4, Lucide React, Sonner) already provides everything needed for the terminal demo animation, demo dashboard mode, and landing page. The terminal typing animation is a custom ~80-line component using `setInterval` and CSS `@keyframes` -- lighter, simpler, and more controllable than any library alternative. Demo mode uses a React Context provider backed by `sessionStorage`, with per-hook mock data injection. No infrastructure changes are needed; all features are purely client-side and compatible with the existing `output: 'export'` static build.

Two non-code changes are in scope: the `.goreleaser.yaml` tap `owner` field changes from `andrewprograde` to `progradetech` (one-line fix), and the Cloudflare API token needs "Workers KV Storage: Edit" permission added in the CF dashboard.

---

## Recommended Stack

### Core Framework (No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | ^15.3.0 | App Router, static export | Already in use. `output: 'export'` generates static HTML/JS. All new features are client-side components or server components with static metadata. |
| React | ^19.0.0 | UI framework | Already in use. React Context for DemoContext, useState/useEffect for terminal animation. |
| TypeScript | ^5.7.0 | Type safety | Already in use. Mock data fixtures must satisfy existing types from `lib/types.ts`. |

### Data Layer (No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SWR | ^2.3.0 | Data fetching hooks | Already in use. Each of the 4 hooks (`use-keys`, `use-connectors`, `use-overview`, `use-usage`) gains ~3 lines to check `isDemo` from DemoContext and return mock data with namespaced cache keys. No SWR middleware needed. |

### Styling (No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | ^4.0.0 | Utility-first CSS | Already in use. Terminal chrome, landing page layout, demo banner all use Tailwind classes. |
| CSS @keyframes | N/A | Cursor blink animation | Native CSS. No library needed. |

### UI Components (No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Lucide React | ^0.469.0 | Icons | Already in use. Feature cards on landing page use existing icon set (Shield, Zap, Layers, etc.). |
| Sonner | ^1.7.0 | Toast notifications | Already in use. Demo mode mutation feedback uses existing `toast()` from Sonner. |

### Build & Deploy (No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pnpm | 9.15.0 | Package manager | Already in use. |
| Turborepo | (existing) | Monorepo orchestration | Already in use. |
| GoReleaser | v2 (via goreleaser-action@v6) | CLI binary release | Already in use. Only the `.goreleaser.yaml` config changes (tap owner field). |
| wrangler-action | v3 | Cloudflare Workers deploy | Already in use. No workflow changes needed -- only the CF API token permissions change in the dashboard. |

### New Components (Built In-House, Zero Dependencies)

| Component | Purpose | Complexity | Why Not a Library |
|-----------|---------|------------|-------------------|
| `DemoContext` provider | Manages demo mode state via `sessionStorage` | ~40 lines | A single boolean flag with enter/exit functions. Adding Zustand or Jotai for this would be absurd. React Context is the right tool. |
| `useTypingAnimation` hook | Drives character-by-character typing in terminal demo | ~30 lines | Uses `setInterval` with configurable speed and callback on completion. Handles the full lifecycle: idle -> typing -> pausing -> next line. |
| `<TerminalDemo>` component | Renders macOS-style terminal chrome with animated output | ~80 lines | Three colored circles + dark background + monospace font. Every CLI-tool landing page builds this custom. Terminal emulator libraries (react-terminal-ui, react-terminal) are designed for interactive input, not scripted playback. |
| `<InstallCommands>` component | Renders install code blocks with copy buttons | ~40 lines | Static JSX with `navigator.clipboard.writeText()` on button click. Reused on both landing page and login page. |
| `<DemoBanner>` component | Persistent banner showing "You're viewing demo data" | ~15 lines | Fixed-position bar with text and "Sign In" link. |
| Mock data fixtures (`demo-data.ts`) | Hardcoded demo data for all 4 SWR hooks | ~100 lines | Must satisfy TypeScript types from `lib/types.ts`. Hand-crafted to tell a coherent story (3 API keys, 2/4 connectors connected, usage with realistic variance). |

---

## Why Zero New Dependencies

The existing dashboard has an intentionally minimal dependency footprint. Every UI component is hand-built with Tailwind. There is no component library (no shadcn, no Radix, no MUI). Adding a dependency for the terminal typing animation would break this pattern for marginal benefit.

**Custom animation vs react-type-animation:**

| Criterion | Custom `setInterval` + CSS | react-type-animation (~9KB) |
|-----------|---------------------------|----------------------------|
| Bundle size | ~2KB (hook + component) | ~9KB gzipped |
| Behavior control | Full control over timing, pausing between lines, output blocks | Sequence-based API -- less control over multi-line terminal output |
| Terminal output simulation | Can render entire output blocks instantly (realistic terminal behavior) | Character-by-character only -- output blocks would type out letter by letter (unrealistic) |
| Maintenance | Zero external dependency risk | Last release 2024, single maintainer |
| Consistency | Matches existing codebase pattern (hand-built everything) | Introduces new pattern (external component for simple UI) |

The terminal demo needs to: (1) type a command character by character, (2) pause, (3) show the output block all at once, (4) repeat for the next command. `react-type-animation` cannot render output blocks instantly -- it would type out JSON responses character by character, which looks wrong. The custom hook handles this naturally by distinguishing "typed" lines from "output" lines.

**Hook-level mock injection vs SWR middleware:**

| Criterion | Hook-level (3 lines per hook) | SWR middleware + fallback |
|-----------|-------------------------------|--------------------------|
| Code changes | 4 hooks modified, ~3 lines each | New middleware file + SWRConfig wrapper in layout |
| Cache isolation | Explicit: `isDemo ? 'demo-keys' : 'admin-keys'` | Implicit: fallback populates same cache keys |
| Clarity | Each hook is self-documenting about demo behavior | Middleware is invisible -- developers must know to check middleware chain |
| Risk | Zero risk to existing data fetching | Middleware ordering bugs can affect real data fetching |
| SWR key collision | Impossible (different key strings) | Possible if user enters demo mode while authenticated |

Hook-level injection is simpler, safer, and more explicit. The 12 total lines of code across 4 hooks is trivial compared to the middleware abstraction.

**sessionStorage + DemoContext vs URL query param `?demo=true`:**

| Criterion | sessionStorage + DemoContext | URL query param |
|-----------|------------------------------|----------------|
| Persistence | Clears on tab close (correct for demo) | Persists in URL (user might bookmark demo state) |
| Collision with auth | Zero (sessionStorage key `feelr_demo` vs localStorage key `feelr_admin_token`) | Zero |
| Navigation | Demo state persists across page navigations within session | Must append `?demo=true` to every navigation or strip it and lose state |
| Static export | Works (client-side sessionStorage) | Works but requires `<Suspense>` boundary for `useSearchParams()` |
| Entry flow | `/demo` route calls `enterDemo()`, redirects to `/overview` | Need to construct URL with query param |

sessionStorage is cleaner because demo state is a session concern, not a URL concern. The `/demo` entry route provides a clean URL for the "Try Demo" button on the landing page.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Typing animation | Custom `setInterval` + CSS (~2KB) | react-type-animation (~9KB) | Cannot render output blocks instantly. Adds external dependency for 30 lines of code. Inconsistent with hand-built codebase pattern. |
| Typing animation | Custom `setInterval` + CSS (~2KB) | Motion/Framer Motion (~30KB) | Massive overkill. Spring physics and gesture handling for a typing effect. |
| Typing animation | Custom `setInterval` + CSS (~2KB) | MagicUI Terminal component | Registry-based dependency pattern that does not exist in this codebase. Copy-paste components add maintenance overhead. |
| Terminal chrome | Custom Tailwind component (~50 lines) | react-terminal-ui / react-terminal | Interactive terminal emulators designed for user input. The walkthrough is scripted. Wrong tool for the job. |
| Demo mode data | Hook-level mock injection (3 lines/hook) | SWR middleware + fallback | More abstraction for less clarity. Middleware ordering bugs risk affecting real data. Cache key collision possible. |
| Demo mode data | Hook-level mock injection (3 lines/hook) | MSW (Mock Service Worker) | 50KB+ dependency designed for testing, not production demo modes. Service worker registration complexity. |
| Demo mode trigger | sessionStorage + DemoContext + `/demo` route | URL query param `?demo=true` | Query param must be propagated across navigations. sessionStorage persists naturally within a tab session. |
| Demo mode trigger | sessionStorage + DemoContext + `/demo` route | localStorage | localStorage persists across tabs and sessions. Demo should end when the tab closes. |
| Mock data | Hand-written fixtures (~100 lines) | @faker-js/faker (400KB+) | The demo needs 4-5 fixed, curated mock responses. Random data looks worse in a product demo. 400KB for what fits in 100 lines. |
| State management | React Context (DemoContext) | Zustand / Jotai | A single boolean flag with two functions (enter/exit). External state management library is overkill. |
| GoReleaser config | Change tap owner only (keep `brews`) | Migrate `brews` to `homebrew_casks` | `brews` is deprecated but functional. Migrating to `homebrew_casks` simultaneously with changing the tap owner introduces two variables. Change one thing at a time. Migrate to `homebrew_casks` in a future maintenance task. |

---

## GoReleaser Configuration Change

**Current problem:** The `.goreleaser.yaml` `brews` section has `repository.owner: andrewprograde`. The install command on the landing page references `progradetech/feelr/feelr`. The tap would push to the wrong repository.

**Fix:** Change `owner` from `andrewprograde` to `progradetech` in `.goreleaser.yaml`. One-line change.

```yaml
# Before
brews:
  - name: feelr
    repository:
      owner: andrewprograde    # Wrong owner
      name: homebrew-feelr

# After
brews:
  - name: feelr
    repository:
      owner: progradetech      # Correct owner
      name: homebrew-feelr
```

**Why NOT migrate to `homebrew_casks` simultaneously:** The `brews` section is deprecated since GoReleaser v2.10 but still works. Migrating to `homebrew_casks` changes the packaging format (formula to cask), the tap structure, and potentially requires a `tap_migrations.json` redirect. Doing this alongside the owner change introduces two variables. If something breaks, it is unclear which change caused it. Change the owner now. Migrate to `homebrew_casks` in a dedicated maintenance task later.

**PAT token note:** The `HOMEBREW_TAP_GITHUB_TOKEN` secret in GitHub Actions must have `contents: write` permission on the `progradetech/homebrew-feelr` repository. If the existing PAT was scoped to `andrewprograde`, a new PAT with access to the `progradetech` org is needed.

---

## Cloudflare API Token Fix

**Current problem:** The Cloudflare API token used in CI/CD (`CLOUDFLARE_API_TOKEN`) is missing "Workers KV Storage: Edit" permission, causing KV operations to fail during wrangler deploy.

**Required permissions:**

| Permission | Scope | Access | Why Needed |
|------------|-------|--------|------------|
| Workers Scripts | Account | Edit | Deploy Worker code |
| Workers KV Storage | Account | Edit | Create/write KV namespaces (AUTH_KV binding) |
| D1 | Account | Edit | Run D1 migrations |
| Account Settings | Account | Read | Wrangler account discovery |
| Workers Routes | Zone | Edit | Configure custom domain routes |

**Fix procedure:**
1. Cloudflare Dashboard > My Profile > API Tokens
2. Edit the existing token
3. Add "Workers KV Storage: Edit" permission
4. Save

No code changes. No workflow changes. The existing workflows already pass `accountId` to wrangler-action, which is correct.

---

## Complete Dependency Changes

### New npm Dependencies

```bash
# None. Zero new dependencies for this entire milestone.
```

### New Dev Dependencies

```bash
# None.
```

### New Go Dependencies

```bash
# None. GoReleaser config change only.
```

### New Infrastructure

None. All features use existing infrastructure (Next.js on Azure SWA, Cloudflare Workers, GitHub Actions, GoReleaser).

---

## Version Compatibility Matrix

| Tool | Current in Project | Required for Milestone | Change Needed? |
|------|-------------------|----------------------|----------------|
| Next.js | ^15.3.0 | ^15.3.0 | No |
| React | ^19.0.0 | ^19.0.0 | No |
| SWR | ^2.3.0 | ^2.3.0 | No |
| Tailwind CSS | ^4.0.0 | ^4.0.0 | No |
| Lucide React | ^0.469.0 | ^0.469.0 | No |
| Sonner | ^1.7.0 | ^1.7.0 | No |
| TypeScript | ^5.7.0 | ^5.7.0 | No |
| GoReleaser | v2 (via action@v6) | v2 | No |
| wrangler-action | v3 | v3 | No |
| Cloudflare API Token | Existing | Existing (add KV permission) | **Reconfigure** |
| Node.js (CI) | 20 | 20 | No |
| pnpm | 9.15.0 | 9.15.0 | No |

---

## Installation

```bash
# No installation steps. Zero new dependencies.
# All new functionality is built using the existing stack.
```

---

## Sources

### Official Documentation (HIGH confidence)
- [SWR Documentation](https://swr.vercel.app/) -- hook patterns, key-based caching, conditional fetching
- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports) -- server/client component behavior with `output: 'export'`
- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) -- metadata must be exported from server components
- [React Context](https://react.dev/reference/react/createContext) -- provider pattern for DemoContext
- [Cloudflare API Token Permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) -- KV Storage Edit, Workers Scripts Edit
- [GoReleaser Homebrew Formulas](https://goreleaser.com/customization/homebrew/) -- `brews` section configuration

### Verified via Project Files (HIGH confidence)
- `apps/dashboard/package.json` -- current deps: next ^15.3.0, react ^19.0.0, swr ^2.3.0, tailwindcss ^4.0.0
- `apps/dashboard/next.config.ts` -- `output: 'export'`, `images: { unoptimized: true }`
- `apps/dashboard/src/lib/hooks/use-keys.ts` -- SWR hook pattern with string keys
- `apps/dashboard/src/lib/hooks/use-connectors.ts` -- same pattern
- `apps/dashboard/src/lib/hooks/use-overview.ts` -- same pattern
- `apps/dashboard/src/lib/hooks/use-usage.ts` -- same pattern
- `apps/dashboard/src/lib/types.ts` -- TypeScript types that mock data must satisfy
- `apps/dashboard/src/components/auth-guard.tsx` -- current auth check logic
- `apps/dashboard/src/app/layout.tsx` -- root layout where DemoProvider wraps children
- `.goreleaser.yaml` -- current `brews` config with `andrewprograde/homebrew-feelr`

### Evaluated and Rejected (MEDIUM confidence)
- [react-type-animation npm](https://www.npmjs.com/package/react-type-animation) -- reviewed, rejected: cannot render output blocks instantly, adds dependency for 30 lines of custom code
- [MagicUI Terminal](https://magicui.design/docs/components/terminal) -- reviewed, rejected: registry-based pattern inconsistent with codebase
- [Motion Typewriter](https://motion.dev/docs/react-typewriter) -- reviewed, rejected: paid (Motion+ membership required)
- [react-terminal-ui npm](https://www.npmjs.com/package/react-terminal-ui) -- reviewed, rejected: interactive-only design
- [react-terminal npm](https://www.npmjs.com/package/react-terminal) -- reviewed, rejected: interactive-only design
- [MSW (Mock Service Worker)](https://mswjs.io/) -- reviewed, rejected: 50KB+ dependency designed for testing, not production demo modes

---

*Stack research for: Feelr -- Interactive Demo, Dashboard Demo Mode, and Landing Page*
*Researched: 2026-02-10*
