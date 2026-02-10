# Architecture Patterns: Interactive Demo, Demo Dashboard Mode, and Landing Page Improvements

**Domain:** Marketing and onboarding features integrated into existing Next.js 15.5 static export dashboard
**Researched:** 2026-02-10
**Confidence:** HIGH (verified against existing codebase, official Next.js/SWR docs, and current React patterns)

---

## Recommended Architecture

The new features integrate into the existing Next.js static export app without requiring any infrastructure changes. All three features -- interactive terminal demo, demo dashboard mode, and landing page improvements -- are purely client-side additions. The static export constraint (`output: 'export'`) is not a limitation here; it is an advantage because these features need zero backend support.

The core architectural pattern is a **DemoContext provider** that wraps the entire app and controls whether components fetch real data from the gateway or return hardcoded mock data. This single mechanism powers the demo dashboard while leaving all existing hooks and components unchanged for authenticated users.

```
Current Architecture:
  / (root page) --> checks token --> /login or /overview
  /login --> validates token against gateway --> stores in localStorage
  /(dashboard)/* --> AuthGuard checks localStorage --> renders with SWR hooks

New Architecture:
  / (root page) --> NEW landing page with terminal demo + CTA
  /login --> unchanged
  /demo --> sets demo flag --> redirects to /overview
  /(dashboard)/* --> AuthGuard modified: pass if demo OR authenticated
                     SWR hooks: return mock data if demo, else fetch gateway
```

### Component Hierarchy (New vs Modified)

```
src/
  app/
    page.tsx                    [REPLACE]   Landing page (currently a redirect)
    demo/page.tsx               [NEW]       Demo entry point
    login/page.tsx              [MODIFY]    Add install commands below sign-in
    (dashboard)/
      layout.tsx                [MODIFY]    Support demo mode in AuthGuard
      overview/page.tsx         [NO CHANGE]
      keys/page.tsx             [NO CHANGE]
      connectors/page.tsx       [NO CHANGE]
      usage/page.tsx            [NO CHANGE]

  components/
    landing/
      hero-section.tsx          [NEW]       Hero with tagline + CTA
      terminal-demo.tsx         [NEW]       Animated terminal walkthrough
      install-commands.tsx      [NEW]       brew install + feelr init
      feature-cards.tsx         [NEW]       Feature highlights
    demo-banner.tsx             [NEW]       "You're in demo mode" banner
    auth-guard.tsx              [MODIFY]    Allow demo mode bypass
    sidebar.tsx                 [MODIFY]    Add demo indicator + "Exit Demo"

  lib/
    demo-context.tsx            [NEW]       React context for demo state
    demo-data.ts                [NEW]       Mock data fixtures
    hooks/
      use-keys.ts               [MODIFY]    Return mock data in demo mode
      use-connectors.ts         [MODIFY]    Return mock data in demo mode
      use-overview.ts           [MODIFY]    Return mock data in demo mode
      use-usage.ts              [MODIFY]    Return mock data in demo mode
    api.ts                      [NO CHANGE]
    auth.ts                     [NO CHANGE]
    types.ts                    [NO CHANGE]
```

---

## Component Boundaries

### New Components (To Build)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **DemoContext** (`lib/demo-context.tsx`) | Manages demo mode state via React Context. Reads/writes `sessionStorage` key `feelr_demo_mode`. Provides `isDemo`, `enterDemo()`, `exitDemo()`. | Consumed by AuthGuard, all SWR hooks, Sidebar, DemoBanner |
| **Landing Page** (`app/page.tsx` replacement) | Marketing landing page with hero, terminal demo, feature cards, and install commands. Pure static content, no data fetching. | Links to /login and /demo |
| **Terminal Demo** (`components/landing/terminal-demo.tsx`) | Animated terminal emulator showing a scripted Feelr CLI session. Purely visual -- CSS animations and JS timeouts, no real commands. | Self-contained, receives script as prop |
| **Install Commands** (`components/landing/install-commands.tsx`) | Copy-to-clipboard code blocks for `brew install feelr` and `feelr init`. | Self-contained |
| **Demo Entry Page** (`app/demo/page.tsx`) | Sets demo flag in sessionStorage via DemoContext, then redirects to /overview. Thin glue component. | DemoContext, Next.js router |
| **Demo Banner** (`components/demo-banner.tsx`) | Persistent top bar: "You're viewing demo data. Sign in to connect your own." with exit button. | DemoContext |
| **Mock Data** (`lib/demo-data.ts`) | Static fixtures matching existing TypeScript types (ApiKey[], ConnectorStatus[], OverviewData, UsageResponse). | Imported by modified hooks |

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| **AuthGuard** (`components/auth-guard.tsx`) | Add DemoContext check: if `isDemo`, skip auth redirect and render children immediately. | Demo users have no admin token but must see dashboard UI. |
| **Sidebar** (`components/sidebar.tsx`) | Add conditional demo badge ("DEMO" pill next to "Feelr" header) and "Exit Demo" button replacing "Logout" when in demo mode. | Users must know they are in demo mode and have a way to exit. |
| **use-keys hook** (`lib/hooks/use-keys.ts`) | Wrap SWR call: if `isDemo`, return mock API keys instead of fetching. | SWR would throw "Not authenticated" error without a token. |
| **use-connectors hook** (`lib/hooks/use-connectors.ts`) | Same pattern: return mock connector statuses in demo mode. | Same reason. |
| **use-overview hook** (`lib/hooks/use-overview.ts`) | Same pattern: return mock overview data in demo mode. | Same reason. |
| **use-usage hook** (`lib/hooks/use-usage.ts`) | Same pattern: return mock usage data in demo mode. | Same reason. |
| **Login page** (`app/login/page.tsx`) | Add Install Commands section below the sign-in form. | Users who want to install CLI should see instructions on the login page. |

### Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| **api.ts** | Gateway fetch layer is not called in demo mode. Hooks bypass it. |
| **auth.ts** | Token management is unchanged. Demo mode uses a separate mechanism (sessionStorage, not localStorage). |
| **types.ts** | Mock data conforms to existing types. No new types needed for the demo feature. |
| **All dashboard page components** (overview, keys, connectors, usage) | Pages consume hooks. If hooks return data, pages render. Demo mode is invisible to pages. |
| **Key/Connector card components** | Receive props, render UI. No awareness of demo mode needed. |

---

## Data Flow: Demo Mode

### How Demo Mode Activates

```
User clicks "Try Demo" on landing page
  --> navigates to /demo
  --> DemoEntry component calls enterDemo()
  --> sessionStorage.setItem('feelr_demo_mode', 'true')
  --> router.replace('/overview')
  --> DashboardLayout renders
      --> AuthGuard reads DemoContext: isDemo=true, skips auth check
      --> Sidebar shows DEMO badge
      --> DemoBanner renders at top
      --> OverviewPage mounts
          --> useOverview() checks DemoContext: isDemo=true
          --> Returns DEMO_OVERVIEW_DATA immediately (no fetch)
          --> Page renders with mock data
```

### How Demo Mode Deactivates

```
User clicks "Exit Demo" in sidebar OR "Sign in" in DemoBanner
  --> exitDemo() called
  --> sessionStorage.removeItem('feelr_demo_mode')
  --> router.replace('/login')
```

### Why sessionStorage, Not localStorage

- **sessionStorage** clears when the browser tab closes. Demo mode should not persist across sessions -- it is a one-time exploration, not a saved state.
- **localStorage** is used for the admin token (persistent authentication). Keeping demo state separate avoids collision with real auth state.
- A user who has an admin token in localStorage and opens demo mode would have both states coexist. The demo flag takes precedence while set.

### SWR Hook Modification Pattern

Every existing SWR hook follows the same modification pattern. The hook checks `isDemo` from context before calling SWR.

```typescript
// Before (current use-keys.ts):
export function useKeys() {
  return useSWR('admin-keys', () => gatewayFetch<ApiKey[]>('/admin/keys'));
}

// After (modified use-keys.ts):
import { useDemo } from '@/lib/demo-context';
import { DEMO_KEYS } from '@/lib/demo-data';

export function useKeys() {
  const { isDemo } = useDemo();
  return useSWR(
    isDemo ? 'demo-keys' : 'admin-keys',
    () => isDemo
      ? Promise.resolve(DEMO_KEYS)
      : gatewayFetch<ApiKey[]>('/admin/keys'),
  );
}
```

**Why this pattern instead of SWRConfig with a global fetcher override:**
- SWR's `SWRConfig` provider can override the global fetcher, but the dashboard uses `gatewayFetch` as an inline fetcher (not a global one). Wrapping in SWRConfig would require restructuring all hooks.
- The per-hook approach is minimal-diff: each hook gains 3 lines of code. No refactoring of the SWR setup.
- Demo SWR keys are namespaced (`demo-keys` vs `admin-keys`) to prevent cache collisions between demo and real data.

---

## Data Flow: Terminal Demo (Landing Page)

The terminal demo is a self-contained component with no backend dependency. It renders a sequence of scripted "commands" and "outputs" with typing animations and delays.

### Terminal Demo Script Structure

```typescript
interface TerminalLine {
  type: 'command' | 'output' | 'empty';
  text: string;
  delay?: number;      // ms to wait before starting this line
  typeSpeed?: number;   // ms per character (commands only)
}

const DEMO_SCRIPT: TerminalLine[] = [
  { type: 'command', text: 'brew install progradetech/feelr/feelr', typeSpeed: 40 },
  { type: 'output', text: '==> Downloading feelr v0.4.0...' },
  { type: 'output', text: '==> Installing feelr' },
  { type: 'empty', text: '' },
  { type: 'command', text: 'feelr auth github', typeSpeed: 50 },
  { type: 'output', text: 'Opening browser for GitHub OAuth...' },
  { type: 'output', text: 'GitHub connected successfully.' },
  { type: 'empty', text: '' },
  { type: 'command', text: 'feelr run github issues.list --repo progradetech/feelr', typeSpeed: 35 },
  { type: 'output', text: '{"ok":true,"data":[{"number":42,"title":"Add composable actions","state":"open"}]}' },
];
```

### Implementation Approach: Custom, Not Library

**Recommendation: Build a custom terminal component.** Do not use `react-terminal-component`, `magicui`, or other library terminal emulators. Rationale:

1. **Scope is narrow.** This is a scripted demo, not an interactive terminal. The user does not type anything. The only behavior is: animate text appearing, wait, show output, repeat. This is ~80 lines of React + CSS.

2. **No new dependencies.** The dashboard has zero UI library dependencies (no shadcn, no magicui, no radix). Adding a terminal library for one component on one page is dependency bloat.

3. **Styling control.** The terminal must match Feelr's brand colors (Deep Sea background `#0a0a14`, Shell borders `#1a1a2e`, Signal Green `#34D399` for output). Library components come with their own styling that would need overriding.

4. **Bundle size.** The landing page is the first thing visitors see. Keeping it lightweight matters for LCP. A custom component adds ~2KB; a terminal library adds 15-50KB.

### Terminal Animation Technique

Use `requestAnimationFrame` or `setInterval` for typing animation. CSS `@keyframes` for the blinking cursor. No animation library needed.

```typescript
// Pseudocode for typing effect
function useTypingAnimation(text: string, speed: number) {
  const [displayText, setDisplayText] = useState('');
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setIsDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayText, isDone };
}
```

---

## Landing Page Architecture

### Current State

The root page (`app/page.tsx`) is a thin redirect: check for admin token, redirect to `/overview` or `/login`. It renders nothing visible.

### New State

The root page becomes a full marketing landing page. The redirect logic moves into a "Go to Dashboard" button that checks auth state.

### Page Structure

```
Landing Page (app/page.tsx)
  |
  +-- HeroSection
  |     +-- Headline: "Agents sense. Agents act."
  |     +-- Subheadline: one-liner value prop
  |     +-- CTA Buttons: "Try Demo" (-> /demo) | "Sign In" (-> /login)
  |
  +-- TerminalDemo
  |     +-- Animated CLI walkthrough (see above)
  |
  +-- InstallCommands
  |     +-- brew install progradetech/feelr/feelr
  |     +-- feelr init
  |     +-- Copy-to-clipboard buttons
  |
  +-- FeatureCards (optional, Phase 2)
  |     +-- "Minimal Context" | "One-Time Auth" | "Composable Actions"
  |
  +-- Footer
        +-- Links: Docs | GitHub | Dashboard
```

### Static Export Compatibility

All landing page components are pure client components (`'use client'`) or static content. No `getServerSideProps`, no API routes, no server actions. Fully compatible with `output: 'export'`.

The only consideration: the existing root page exports no metadata. The new landing page should add proper metadata for SEO:

```typescript
export const metadata: Metadata = {
  title: 'Feelr - Agent-Friendly API Simplification',
  description: 'Give your AI agents API superpowers. Minimal context, one-time auth, composable actions.',
};
```

**Wait -- metadata export and 'use client' are incompatible in Next.js App Router.** The root page currently uses `'use client'` for the redirect logic. The new landing page should NOT be a client component at the page level. Instead:

- `app/page.tsx` should be a **server component** (no `'use client'` directive) that exports metadata and renders client sub-components.
- The terminal demo, install commands, and CTA buttons are client components (they need interactivity).
- The hero section and feature cards can be server components (static text).

This works with static export because server components in `output: 'export'` are rendered at build time and output as static HTML. Client components hydrate on load.

---

## GoReleaser Tap Owner Fix

The `.goreleaser.yaml` file has `owner: andrewprograde` for the Homebrew tap repository. The project context says this needs to change to `progradetech`.

```yaml
# Current:
brews:
  - name: feelr
    repository:
      owner: andrewprograde
      name: homebrew-feelr

# Should be:
brews:
  - name: feelr
    repository:
      owner: progradetech
      name: homebrew-feelr
```

This is a one-line config change. The install command in the terminal demo and landing page should reference the correct tap: `brew install progradetech/feelr/feelr`.

---

## Patterns to Follow

### Pattern 1: Context-Based Feature Flags (Demo Mode)

**What:** A React Context that exposes `isDemo` boolean and control functions. Components read the flag to alter behavior (skip auth, return mock data).

**When:** Any feature that needs a global mode toggle affecting multiple components across the tree.

**Why:** Centralized state, no prop drilling, type-safe, testable. sessionStorage persistence survives navigation but not tab close.

```typescript
// lib/demo-context.tsx
'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const DEMO_KEY = 'feelr_demo_mode';

interface DemoContextValue {
  isDemo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
}

const DemoContext = createContext<DemoContextValue>({
  isDemo: false,
  enterDemo: () => {},
  exitDemo: () => {},
});

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setIsDemo(sessionStorage.getItem(DEMO_KEY) === 'true');
  }, []);

  function enterDemo() {
    sessionStorage.setItem(DEMO_KEY, 'true');
    setIsDemo(true);
  }

  function exitDemo() {
    sessionStorage.removeItem(DEMO_KEY);
    setIsDemo(false);
  }

  return (
    <DemoContext.Provider value={{ isDemo, enterDemo, exitDemo }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}
```

**Where to mount the provider:** In `app/layout.tsx`, wrapping `{children}`. This ensures every page (landing, login, dashboard) has access to demo state.

### Pattern 2: Mock Data Colocation with Types

**What:** Keep mock data in a single file (`lib/demo-data.ts`) that imports and satisfies existing TypeScript types. Each mock constant matches the exact shape returned by real SWR hooks.

**When:** Building demo/preview modes that must render the same UI as production.

**Why:** Type safety catches drift between mock and real data. Single file makes it easy to update all demo data together.

```typescript
// lib/demo-data.ts
import type { ApiKey, ConnectorStatus, OverviewData, UsageResponse } from '@/lib/types';

export const DEMO_KEYS: ApiKey[] = [
  {
    short_token: 'a1b2c3',
    label: 'production-agent',
    created_at: '2026-02-01T10:00:00Z',
    last_used_at: '2026-02-10T08:30:00Z',
  },
  {
    short_token: 'd4e5f6',
    label: 'staging-bot',
    created_at: '2026-02-05T14:00:00Z',
    last_used_at: '2026-02-09T22:15:00Z',
  },
  {
    short_token: 'g7h8i9',
    label: null,
    created_at: '2026-02-08T09:00:00Z',
    last_used_at: null,
  },
];

export const DEMO_CONNECTORS: ConnectorStatus[] = [
  { name: 'github', status: 'connected' },
  { name: 'slack', status: 'connected' },
  { name: 'stripe', status: 'not_connected' },
  { name: 'discord', status: 'not_connected' },
];

export const DEMO_OVERVIEW: OverviewData = {
  total_keys: 3,
  connected_services: 2,
  recent_usage: {
    total_24h: 1847,
    hourly: Array.from({ length: 24 }, (_, i) => ({
      hour: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      count: Math.floor(Math.random() * 150) + 20,
    })),
  },
};

// UsageResponse mock with realistic-looking data
export const DEMO_USAGE: UsageResponse = {
  window: 'day',
  buckets: Array.from({ length: 7 }, (_, i) => ({
    time_bucket: new Date(Date.now() - (6 - i) * 86400000).toISOString(),
    total_requests: Math.floor(Math.random() * 500) + 100,
    error_count: Math.floor(Math.random() * 15),
    avg_duration_ms: Math.floor(Math.random() * 200) + 50,
  })),
  filters: {},
};
```

### Pattern 3: Scripted Terminal Animation (No Library)

**What:** Custom React component that renders a sequence of "typed" commands and instant outputs using `setInterval` for character-by-character animation and CSS for cursor blinking.

**When:** Marketing pages need a terminal demo that does not accept user input.

**Why:** Avoids library dependencies for a narrow use case. Full control over timing, styling, and sequence logic.

```typescript
// Simplified animation orchestrator pattern
function useTerminalSequence(script: TerminalLine[]) {
  const [visibleLines, setVisibleLines] = useState<RenderedLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  // When a line finishes, advance to next after delay
  useEffect(() => {
    if (currentIndex >= script.length) return;
    const line = script[currentIndex];

    if (line.type === 'output' || line.type === 'empty') {
      // Output lines appear instantly
      const timer = setTimeout(() => {
        setVisibleLines(prev => [...prev, { text: line.text, type: line.type }]);
        setCurrentIndex(prev => prev + 1);
      }, line.delay ?? 300);
      return () => clearTimeout(timer);
    }

    if (line.type === 'command') {
      // Command lines type character by character
      setIsTyping(true);
      // Typing logic handled by child TypingLine component
    }
  }, [currentIndex, script]);

  return { visibleLines, currentIndex, isTyping };
}
```

### Pattern 4: Server/Client Component Split for Landing Page

**What:** The landing page file (`app/page.tsx`) is a server component that exports metadata and composes client sub-components. Interactive sections (terminal demo, copy buttons) are separate `'use client'` components imported into the server component.

**When:** Any page that needs both SEO metadata and client-side interactivity.

**Why:** In Next.js App Router with static export, server components render to static HTML at build time. Metadata can only be exported from server components. Client components hydrate after load.

```typescript
// app/page.tsx (SERVER component -- no 'use client')
import type { Metadata } from 'next';
import { HeroSection } from '@/components/landing/hero-section';
import { TerminalDemo } from '@/components/landing/terminal-demo';
import { InstallCommands } from '@/components/landing/install-commands';

export const metadata: Metadata = {
  title: 'Feelr - Agent-Friendly API Simplification',
  description: 'Give your AI agents API superpowers in one line.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <HeroSection />
      <TerminalDemo />
      <InstallCommands />
    </div>
  );
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Demo App or Route Group

**What:** Creating a `/(demo)` route group with duplicated dashboard pages that use hardcoded data.

**Why bad:** Duplicates every page component. Changes to the real dashboard must be mirrored in demo pages. Drift is inevitable. Maintenance cost scales with number of pages.

**Instead:** Use DemoContext to inject mock data into existing hooks. Zero page duplication. Adding a new dashboard page automatically works in demo mode if its hook follows the pattern.

### Anti-Pattern 2: Mocking at the API Level (Intercepting fetch)

**What:** Using a service worker (MSW) or global fetch override to intercept gateway requests and return mock responses in demo mode.

**Why bad:** Adds a service worker to production. Increases complexity. MSW is a testing tool, not a production feature flag mechanism. Service workers have caching behavior that can confuse real API calls if the user switches from demo to authenticated mode in the same session.

**Instead:** Mock at the SWR hook level. The decision happens in React land, not in the network layer. Clean, debuggable, no side effects.

### Anti-Pattern 3: Using localStorage for Demo State

**What:** Storing the demo flag in localStorage (alongside the admin token).

**Why bad:** localStorage persists forever. A user who tries the demo and closes the tab will re-enter demo mode when they return days later. Worse: if they later sign in with a real token, they have both `feelr_admin_token` AND `feelr_demo_mode` in localStorage. The interaction between these two states creates confusing bugs.

**Instead:** sessionStorage for demo mode. It clears when the tab closes. A returning user sees the landing page, not a stale demo session.

### Anti-Pattern 4: Disabling Mutating Actions in Demo Mode via UI Disabling

**What:** Making "Create Key", "Revoke Key", etc. buttons visually disabled in demo mode.

**Why bad:** Confusing UX. Users explore the demo to understand what actions are available. Greyed-out buttons do not teach anything.

**Instead:** Let buttons work. In demo mode, mutation functions (create, revoke) should show a toast: "Demo mode -- this would create an API key." Update the mock data locally so the UI reflects the "action" without any real API call. This is more engaging and teaches the product.

### Anti-Pattern 5: Heavy Animation Libraries for Terminal Demo

**What:** Installing `framer-motion`, `@motionone/dom`, `gsap`, or `magicui` for the terminal typing animation.

**Why bad:** The terminal demo needs character-by-character text reveal and a blinking cursor. That is `setInterval` + CSS `@keyframes`. Adding a 20-50KB animation library for this one component on the landing page hurts initial page load (LCP) for zero benefit. The dashboard already has zero animation library dependencies.

**Instead:** Custom `useTypingAnimation` hook (~30 lines) + CSS cursor animation. Total cost: ~2KB gzipped.

---

## Scalability Considerations

| Concern | Current (Launch) | At 10K visitors/mo | At 100K visitors/mo |
|---------|-----------------|--------------------|--------------------|
| **Landing page performance** | Static HTML, instant load | Same. Static file served from Azure SWA CDN. | Same. CDN handles scale. |
| **Demo mode state** | sessionStorage, client-only | Same. No server resources consumed. | Same. Zero backend load for demo users. |
| **Mock data freshness** | Hardcoded in demo-data.ts | Update manually when adding features. | Consider generating mock data from types at build time. |
| **Terminal demo script** | Hardcoded in component | Same. | Same. Optionally make script data-driven from a JSON file. |
| **Bundle size impact** | ~5KB for all new components | Same. | Same. |

---

## Integration Points with Existing Code

### Root Layout (app/layout.tsx)

The DemoProvider must wrap the entire app. Current layout:

```typescript
// Current:
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-50 antialiased">
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}

// Modified:
import { DemoProvider } from '@/lib/demo-context';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-50 antialiased">
        <DemoProvider>
          {children}
        </DemoProvider>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
```

**Note:** Adding a client-side context provider (`DemoProvider`) to `layout.tsx` means the layout becomes a client component boundary. The `metadata` export in `layout.tsx` is already present and works because Next.js allows metadata in layouts even when children include client components. The layout itself does NOT need `'use client'` -- only `DemoProvider` has it, and it is imported as a child.

### Dashboard Layout (app/(dashboard)/layout.tsx)

The AuthGuard modification:

```typescript
// Current AuthGuard logic:
const token = getAdminToken();
if (!token) {
  router.replace('/login');
} else {
  setIsAuthed(true);
}

// Modified AuthGuard logic:
const { isDemo } = useDemo();
const token = getAdminToken();
if (isDemo) {
  setIsAuthed(true);  // Demo mode bypasses auth
} else if (!token) {
  router.replace('/login');
} else {
  setIsAuthed(true);
}
```

The dashboard layout also needs the DemoBanner:

```typescript
// Modified dashboard layout:
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DemoBanner />
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
```

### Sidebar Modifications

Add demo indicator and exit button:

```typescript
// In Sidebar component, add conditional rendering:
const { isDemo, exitDemo } = useDemo();

// In header section:
<span className="text-lg font-semibold tracking-tight text-white">
  Feelr
</span>
{isDemo && (
  <span className="ml-2 rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-400">
    DEMO
  </span>
)}

// In footer section:
{isDemo ? (
  <button onClick={() => { exitDemo(); router.push('/login'); }}>
    Exit Demo
  </button>
) : (
  <button onClick={handleLogout}>
    Logout
  </button>
)}
```

---

## Build Order (Suggested Phase Structure)

### Phase 1: DemoContext + Mock Data (Foundation)

Build the demo infrastructure first because all other features depend on it.

**Deliverables:**
- `lib/demo-context.tsx` -- React context with sessionStorage persistence
- `lib/demo-data.ts` -- Mock data fixtures for all 4 hook types
- Modified `app/layout.tsx` -- Wrap with DemoProvider
- `app/demo/page.tsx` -- Demo entry point (calls enterDemo, redirects)

**Why first:** The demo dashboard and landing page both depend on DemoContext existing. Building this first unblocks parallel work on other phases.

### Phase 2: AuthGuard + Hook Modifications (Dashboard Demo Mode)

Make the existing dashboard renderable in demo mode.

**Deliverables:**
- Modified `components/auth-guard.tsx` -- Demo bypass
- Modified 4 SWR hooks -- Demo data injection
- `components/demo-banner.tsx` -- Demo mode indicator
- Modified `components/sidebar.tsx` -- Demo badge + Exit Demo

**Why second:** This phase changes existing code. Get it working and tested before building new landing page components. If demo mode breaks dashboard rendering, catch it early.

### Phase 3: Landing Page (Marketing)

Build the new root page that replaces the redirect.

**Deliverables:**
- Replaced `app/page.tsx` -- Full landing page (server component)
- `components/landing/hero-section.tsx` -- Hero with CTAs
- `components/landing/terminal-demo.tsx` -- Animated terminal
- `components/landing/install-commands.tsx` -- Copy-to-clipboard code blocks
- `components/landing/feature-cards.tsx` -- Feature highlights (optional)

**Why third:** Depends on demo context (Phase 1) for the "Try Demo" button. Can be built in parallel with Phase 2 since it does not modify existing components.

### Phase 4: Login Page Enhancement + Config Fixes

Small improvements and fixes.

**Deliverables:**
- Modified `app/login/page.tsx` -- Install commands section
- Modified `.goreleaser.yaml` -- Change tap owner to progradetech
- CI/CD fix: Cloudflare API token KV write permissions (ops task, not code)

**Why last:** Lowest dependency, lowest risk. Config fixes are independent and can be done anytime.

### Dependency Graph

```
Phase 1 (DemoContext + Mock Data)
  |
  +---> Phase 2 (AuthGuard + Hook Mods)
  |       |
  |       +---> Phase 4 (Login + Config Fixes)
  |
  +---> Phase 3 (Landing Page)
          |
          +---> Phase 4 (Login + Config Fixes)
```

Phases 2 and 3 can run in parallel after Phase 1 completes.

---

## Sources

### Official Documentation (HIGH confidence)
- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports) -- confirms metadata works with static export, server/client component split
- [Next.js Metadata API](https://nextjs.org/docs/app/building-your-application/optimizing/metadata) -- metadata must be in server components
- [SWR Documentation](https://swr.vercel.app/) -- SWR key-based caching, fetcher patterns
- [React Context API](https://react.dev/reference/react/createContext) -- createContext + useContext patterns

### Verified via Project Files (HIGH confidence)
- `apps/dashboard/next.config.ts` -- confirms `output: 'export'`
- `apps/dashboard/src/lib/api.ts` -- gatewayFetch pattern with Bearer token
- `apps/dashboard/src/lib/auth.ts` -- localStorage-based token management
- `apps/dashboard/src/components/auth-guard.tsx` -- current auth check logic
- `apps/dashboard/src/lib/hooks/*.ts` -- all 4 SWR hooks using gatewayFetch
- `apps/dashboard/src/lib/types.ts` -- TypeScript types for mock data conformance
- `apps/dashboard/src/components/sidebar.tsx` -- current sidebar structure
- `apps/dashboard/src/app/page.tsx` -- current redirect-only root page
- `apps/dashboard/src/app/(dashboard)/layout.tsx` -- current AuthGuard + Sidebar layout
- `.goreleaser.yaml` -- current tap owner configuration

### Community Patterns (MEDIUM confidence)
- [MagicUI Terminal Component](https://magicui.design/docs/components/terminal) -- reviewed and rejected for this use case (dependency overhead for scripted-only animation)
- [Motion Typewriter](https://motion.dev/docs/react-typewriter) -- reviewed and rejected (animation library overkill for setInterval-based typing)
- [SWR Testing Patterns](https://github.com/vercel/swr/discussions/617) -- SWR mock patterns, key-based cache isolation
