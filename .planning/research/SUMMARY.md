# Research Summary: Interactive Demo, Demo Dashboard Mode, and Landing Page Improvements

**Domain:** Marketing and onboarding features for existing Next.js static export dashboard
**Researched:** 2026-02-10
**Overall confidence:** HIGH

## Executive Summary

The three new features -- interactive terminal demo, demo dashboard mode, and landing page -- integrate cleanly into the existing Next.js 15.5 static export architecture with zero infrastructure changes. The static export constraint (`output: 'export'`) is not a limitation; all features are purely client-side. The dashboard already has a clean SWR hook layer that makes demo mode injection straightforward.

The core architectural pattern is a React Context-based demo mode flag (`DemoContext`) stored in `sessionStorage`. This single mechanism controls whether SWR hooks fetch real gateway data or return hardcoded mock fixtures. The demo mode bypasses the existing `AuthGuard` without modifying the authentication system. Dashboard pages, card components, and chart components remain completely unchanged -- they consume hooks and render data regardless of its source.

The landing page replaces the current root page (`app/page.tsx`), which is currently a thin redirect. The new page is a server component that exports SEO metadata and composes client sub-components for the terminal demo and install commands. The terminal demo is a custom ~80-line component using `setInterval` for typing animation -- no external library needed. The existing codebase has zero animation library dependencies, and adding one for a single scripted terminal would be unjustified.

Two non-code changes are also in scope: the `.goreleaser.yaml` tap owner needs updating from `andrewprograde` to `progradetech`, and the Cloudflare API token needs KV write permissions added for CI/CD.

## Key Findings

**Stack:** No new dependencies required. The existing stack (React 19, SWR 2, Tailwind 4, Lucide icons) supports all features. Custom terminal animation replaces what libraries would offer at ~2KB vs 15-50KB.

**Architecture:** DemoContext provider wraps the app at root layout level. Each of the 4 SWR hooks gains 3 lines of code to check the demo flag and return mock data. AuthGuard gets a 3-line demo bypass. Zero dashboard page components change.

**Critical pitfall:** The root page (`app/page.tsx`) currently uses `'use client'` for redirect logic. The new landing page must be a server component to export metadata. This is a breaking change in the file's component type, not an incremental addition.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **DemoContext + Mock Data (Foundation)** - Build the demo infrastructure first
   - Addresses: DemoContext provider, mock data fixtures, DemoProvider in root layout, /demo entry page
   - Avoids: Building landing page or dashboard mods that depend on context not yet existing

2. **AuthGuard + Hook Modifications (Dashboard Demo Mode)** - Make existing dashboard render in demo mode
   - Addresses: AuthGuard demo bypass, 4 SWR hook modifications, demo banner, sidebar demo indicator
   - Avoids: Pitfall of separate demo route group (duplicated pages)

3. **Landing Page (Marketing)** - Build the new root page
   - Addresses: Hero section, terminal demo animation, install commands, feature cards
   - Avoids: Pitfall of using 'use client' on the page (breaks metadata)

4. **Login Page Enhancement + Config Fixes** - Small improvements and ops tasks
   - Addresses: Install commands on login page, goreleaser tap owner fix, CF API token permissions
   - Avoids: N/A (lowest risk phase)

**Phase ordering rationale:**
- Phase 1 is the foundation: DemoContext must exist before any other phase can reference `isDemo` or `enterDemo()`
- Phases 2 and 3 are parallelizable after Phase 1 -- they modify different files with no overlap
- Phase 4 is independent and can be done anytime, placed last because it is lowest priority

**Research flags for phases:**
- Phase 2: Standard pattern (context + conditional in hooks). Low risk, no research needed during execution.
- Phase 3: The server/client component split for the landing page requires care -- metadata export in server component, client sub-components for interactivity. Verify static export generates correct HTML at build time.
- Phase 4: Goreleaser tap owner change is trivial. CF API token permissions is an ops task, not code.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies. All patterns verified against existing codebase. |
| Features | HIGH | Feature set is well-scoped: terminal demo, demo dashboard, landing page, install commands. No ambiguity. |
| Architecture | HIGH | Every integration point verified by reading existing source files. DemoContext pattern is standard React. SWR hook modification pattern is minimal-diff. |
| Pitfalls | HIGH | Pitfalls are specific to this codebase (server/client split, sessionStorage vs localStorage, mock data type safety). Not generic warnings. |

## Gaps to Address

- **Demo mode mutation handling:** ARCHITECTURE.md recommends letting buttons work in demo mode with toast feedback ("Demo mode -- this would create an API key"). The exact behavior of KeyCreateDialog, KeyRevokeDialog in demo mode needs implementation decisions during Phase 2. Options: (a) toast only, (b) toast + local mock data update, (c) open dialog but disable submit. Recommend option (b) for the most engaging demo experience.

- **Terminal demo script content:** The exact CLI commands and outputs shown in the terminal demo should be finalized during Phase 3 implementation. ARCHITECTURE.md provides a starting script but the marketing copy needs review.

- **Brand typography on landing page:** The strategy doc specifies Space Grotesk for headings, JetBrains Mono for code, and Inter for body text. The existing dashboard uses system fonts via Tailwind defaults. The landing page may need web font imports, which affects LCP. Decide during Phase 3 whether to add fonts or keep system defaults.

---
*Research completed: 2026-02-10*
*Ready for roadmap: yes*
