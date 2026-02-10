# Feature Landscape: Interactive Demo, Demo Dashboard Mode, and Landing Page

**Domain:** Marketing and onboarding features for developer tool SaaS
**Researched:** 2026-02-10
**Confidence:** HIGH (features scoped against existing codebase, static export constraints verified)

---

## Table Stakes

Features that must ship for this milestone to deliver value. Missing any of these makes the milestone incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Landing page with hero section** | First-time visitors currently see a redirect to login, which is a dead end for non-users. A landing page is the minimum viable marketing surface. | Low | Server component with static text + CTA buttons. Brand colors from strategy doc (Lobster Red `#E85D3A`, Deep Sea `#0a0a14`). |
| **"Try Demo" button on landing page** | Visitors need a zero-friction way to explore the product without signing up. This is the primary conversion path for the demo feature. | Low | Link to `/demo` route. Styled as primary CTA. |
| **Demo mode activation (/demo route)** | Sets demo flag in sessionStorage, redirects to dashboard. The entry point for the entire demo experience. | Low | Thin page component: call `enterDemo()`, `router.replace('/overview')`. |
| **AuthGuard demo bypass** | Demo users have no admin token. Without this bypass, they are redirected to /login and never see the dashboard. | Low | 3-line conditional added to existing AuthGuard component. |
| **SWR hooks return mock data in demo mode** | Without mock data, dashboard pages show loading spinners forever (no token = no gateway fetch). All 4 hooks (keys, connectors, overview, usage) must be modified. | Medium | Each hook gains ~3 lines. Mock data must conform to existing TypeScript types. Uses namespaced SWR keys (`demo-keys` vs `admin-keys`) for cache isolation. |
| **Mock data fixtures (demo-data.ts)** | The 4 modified hooks need data to return. Fixtures must look realistic: 3 API keys, 2/4 connectors connected, usage charts with variance. | Medium | Single file, ~100 lines. Must import and satisfy types from `lib/types.ts`. |
| **Demo mode banner** | Users must know they are viewing demo data, not their real account. Without this, demo mode is deceptive. | Low | Persistent top banner: "You're viewing demo data. Sign in to connect your own." with "Sign In" link. |
| **Sidebar demo indicator** | Users navigating between dashboard pages need a persistent reminder they are in demo mode. | Low | "DEMO" pill badge next to "Feelr" in sidebar header. "Exit Demo" replaces "Logout" button. |
| **"Exit Demo" flow** | Users must be able to leave demo mode cleanly. Clears sessionStorage, redirects to /login. | Low | `exitDemo()` function on DemoContext. Sidebar button and banner button call it. |
| **Install commands on landing page** | Visitors who are convinced need to know how to install. `brew install progradetech/feelr/feelr` and `feelr init` below the hero. | Low | Static code blocks with copy-to-clipboard buttons using `navigator.clipboard`. |
| **GoReleaser tap owner fix** | The install command references `progradetech` but `.goreleaser.yaml` has `andrewprograde`. Homebrew tap would push to wrong repo. | Low | One-line change in `.goreleaser.yaml`. |

---

## Differentiators

Features that make the demo experience memorable and drive conversion. Not blocking for launch but significantly increase value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Animated terminal demo** | Shows the product in action before the user installs anything. Animated typing creates a sense of "liveness" that static code blocks lack. Terminal demos are standard for CLI tools (Warp, Fig, Railway). | Medium | Custom component, ~80 lines React + CSS. Scripted sequence: install, auth, run command, see output. No library dependency -- uses `setInterval` for typing + CSS `@keyframes` for cursor blink. |
| **Demo mode mutation feedback** | When users click "Create Key" in demo mode, show a toast "Demo mode -- this would create an API key" and update mock data locally. This teaches the product's capabilities without dead-ending on disabled buttons. | Medium | Modify KeyCreateDialog and KeyRevokeDialog to check `isDemo` and call `toast()` instead of `gatewayMutate`. Optionally update local mock state for immediate visual feedback. |
| **Install commands on login page** | Users who reach the login page but do not have a token need instructions. Currently the page says "Get your admin token from `feelr init`" but does not show how to install the CLI. | Low | Reuse InstallCommands component from landing page on login page, below the sign-in form. |
| **Feature cards section** | 3-column grid below terminal demo highlighting key value props: "Minimal Context (50 tokens vs 5000)", "One-Time Auth", "Composable Actions". Gives visitors quick value understanding. | Low | Static React components with Lucide icons. No data fetching. |
| **Landing page footer** | Links to Docs, GitHub, Dashboard. Standard marketing page element. | Low | Static HTML/JSX. |
| **Terminal demo replay button** | After the terminal animation finishes, show a "Replay" button so visitors can watch again. | Low | Reset `currentIndex` state in useTerminalSequence hook. |
| **macOS-style terminal chrome** | Three colored circles (red/yellow/green) on the terminal frame. Every CLI-tool landing page uses this pattern. | Low | Three `div` circles + dark background + monospace font. Rounded corners, subtle border. |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Interactive terminal on landing page** | An interactive terminal where visitors type real CLI commands requires either a backend (sandbox environment) or complex command parser. Massively increases scope for marginal value over scripted demo. | Scripted terminal demo showing the same commands every time. Visitors see the product in action without needing to know commands. |
| **Demo mode with real API calls** | Creating a shared "demo" API key hitting a sandbox gateway requires backend infrastructure (sandbox environment, rate limiting, data isolation). | Mock data in the client. Zero backend cost. Same visual experience. |
| **Onboarding wizard** | A guided post-login setup flow (generate key, install CLI, run first command) is valuable but depends on stable sign-in flow and gateway availability. Adds scope to a marketing-focused milestone. | Defer to a separate milestone. The install commands on the landing page and login page serve as lightweight onboarding for now. |
| **User accounts / sign-up flow** | Feelr uses admin token auth (from `feelr init`), not email/password accounts. Adding sign-up is a product direction change, not a marketing feature. | Keep token-based auth. Landing page directs users to install CLI and run `feelr init`. |
| **A/B testing on landing page** | Premature optimization. Zero visitors today. Build the page, ship it, iterate based on feedback. | Ship one version. Add analytics later if needed. |
| **Pricing page** | Pricing is documented in the strategy doc but billing system is not built (Stripe integration is Phase 7 in roadmap). A pricing page with no purchase flow is misleading. | Mention tiers briefly on landing page if desired. Dedicated pricing page waits for billing. |
| **Heavy animation libraries** | Installing Motion/Framer Motion, GSAP, or MagicUI for the terminal typing animation. Adds 20-50KB for features achievable with `setInterval` + CSS. | Custom `useTypingAnimation` hook (~30 lines) + CSS cursor animation. ~2KB total. |
| **Video tutorial in hero section** | Videos require play-button interaction (friction), become stale when UI changes, compete with terminal animation for attention. | Animated terminal walkthrough (auto-playing, no interaction) + link to full video in docs section later. |
| **Demo data that simulates live updates** | Mock data with incrementing counters, new events, etc. adds complexity for marginal realism. | Static mock data with realistic-looking values. Users understand it is a demo. |

---

## Feature Dependencies

```
DemoContext (foundation)
  --> AuthGuard demo bypass
  --> SWR hook modifications (all 4)
  --> Demo banner
  --> Sidebar demo indicator
  --> Demo entry page (/demo)
  --> "Try Demo" button (landing page)

Mock data fixtures (demo-data.ts)
  --> SWR hook modifications (all 4)

Landing page (app/page.tsx replacement)
  --> Terminal demo component
  --> Install commands component
  --> Hero section component
  --> Feature cards component (optional)
  --> DemoContext (for "Try Demo" button navigation)

Login page enhancement
  --> Install commands component (reuse from landing page)

GoReleaser tap owner fix
  --> (independent, no code dependency)

CF API token permissions
  --> (independent, ops task)
```

---

## MVP Recommendation

**Prioritize (must ship together):**
1. DemoContext + mock data -- foundation that everything depends on
2. AuthGuard + hook modifications -- makes the actual demo dashboard work
3. Landing page with hero + terminal demo + install commands -- first-visitor experience
4. Demo banner + sidebar indicator -- prevents demo mode confusion
5. GoReleaser tap owner fix -- one-line change, blocks correct install commands

**Ship alongside (low effort, high value):**
6. Install commands on login page -- reuses existing component
7. macOS-style terminal chrome -- 5 minutes of CSS work, big visual impact

**Defer to polish iteration:**
8. Demo mode mutation feedback (toasts for create/revoke) -- nice to have, not blocking
9. Feature cards section -- can iterate on marketing copy after initial launch
10. Terminal demo replay button -- trivial to add later
11. Landing page footer -- low priority

**Explicitly deferred to future milestone:**
12. Onboarding wizard (post-login setup flow) -- separate milestone
13. First-command verification -- requires gateway integration

---

## Sources

- Existing codebase analysis -- all dashboard component files read and analyzed for integration points
- [Feelr Strategy Document](../../feelr-strategy.md) -- brand colors, product positioning, pricing tiers
- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports) -- server/client component behavior
- [SWR Documentation](https://swr.vercel.app/) -- key-based caching, fetcher patterns
- Developer tool landing page patterns: Warp, Railway, Homebrew -- terminal demos are standard for CLI-first products (MEDIUM confidence, pattern observation)
- [MagicUI Terminal](https://magicui.design/docs/components/terminal) -- reviewed and rejected for this use case
- [Motion Typewriter](https://motion.dev/docs/react-typewriter) -- reviewed and rejected for bundle size reasons

---
*Feature landscape research for: Feelr interactive demo, dashboard demo mode, and landing page*
*Researched: 2026-02-10*
