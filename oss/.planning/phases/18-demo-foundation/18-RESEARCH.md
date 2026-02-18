# Phase 18: Demo Foundation - Research

**Researched:** 2026-02-10
**Domain:** React Context provider with sessionStorage persistence + TypeScript mock data fixtures
**Confidence:** HIGH

## Summary

Phase 18 builds the foundation that Phases 19 and 21 consume: a `DemoContext` React provider and mock data fixtures. The dashboard is a Next.js 15.5 static-export SPA (`output: 'export'`) using React 19.2, SWR 2.4, Tailwind CSS 4, and Recharts. All data fetching goes through `gatewayFetch()` in `src/lib/api.ts`, which is consumed by 4 SWR hooks (`useKeys`, `useConnectors`, `useUsage`, `useOverview`) plus 2 supplementary hooks (`useRateLimits`, `useAvailableKeys`). The dashboard has no existing React Context providers -- the `AuthGuard` component reads `localStorage` directly.

The implementation is straightforward: a single context file providing `isDemo`, `enterDemo()`, and `exitDemo()`, plus a set of fixture files that export typed mock data conforming to the existing types in `src/lib/types.ts` and the `RateLimitInfo` type in `src/lib/hooks/use-usage.ts`. The "chain history" data domain does not yet have dashboard types or pages (chains are a gateway-only feature today), so the fixtures must define a `ChainHistoryEntry` type that aligns with the gateway's `ChainExecutionResult` from `apps/gateway/src/lib/chain-types.ts`.

The key architectural decision is where the demo context intercepts data flow. Phase 18 only creates the context and fixtures -- Phase 19 will wire them into hooks and pages. But the fixture shape must anticipate Phase 19's needs: the hooks return specific TypeScript types, and fixtures must match those types exactly to be drop-in replacements.

**Primary recommendation:** Create `src/lib/demo-context.tsx` with a `DemoProvider` component wrapping `createContext`, using `sessionStorage` for persistence (guarded with `typeof window` check). Create `src/lib/demo-data/` directory with one fixture file per data domain, all exporting typed constants that conform to existing dashboard types. Use React 19's direct context rendering (`<DemoContext value={...}>`) instead of the deprecated `<DemoContext.Provider>` pattern.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | Context API, `createContext`, `use` hook | Already installed; React 19 supports `<Context value={}>` directly |
| TypeScript | 5.7.x | Type-safe fixtures | Already installed; fixtures must conform to existing types |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.1.x | Generating realistic timestamps in fixtures | Already installed; used by keys page for `formatDistanceToNow` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw sessionStorage | zustand with persist middleware | Overkill for a single boolean flag; adds dependency for no benefit |
| Inline fixture objects | faker.js generated data | Deterministic fixtures are better for demos -- same data every time, no randomness |
| Separate fixture files per domain | Single monolithic fixtures file | Separate files are cleaner; each domain is independently importable and testable |

**Installation:**
```bash
# No new dependencies needed -- all tools already in the project
```

## Architecture Patterns

### Recommended Project Structure
```
apps/dashboard/src/
  lib/
    demo-context.tsx          # DemoContext, DemoProvider, useDemo hook
    demo-data/
      index.ts                # Re-export all fixtures
      keys.ts                 # ApiKey[] fixture
      connectors.ts           # ConnectorStatus[] fixture
      usage.ts                # UsageResponse + RateLimitInfo[] fixtures
      overview.ts             # OverviewData fixture
      chains.ts               # ChainHistoryEntry[] fixture (new type)
```

### Pattern 1: React 19 Context with sessionStorage Persistence
**What:** A context provider that stores `isDemo` in sessionStorage and exposes `enterDemo()`/`exitDemo()` functions.
**When to use:** When a boolean flag needs to persist across page navigations within a single tab but clear on tab close.
**Example:**
```typescript
// Source: React 19 docs (react.dev/reference/react/createContext)
'use client';

import { createContext, use, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'feelr_demo_mode';

interface DemoContextValue {
  isDemo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
}

export const DemoContext = createContext<DemoContextValue>({
  isDemo: false,
  enterDemo: () => {},
  exitDemo: () => {},
});

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemo, setIsDemo] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDemo) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [isDemo]);

  const enterDemo = useCallback(() => setIsDemo(true), []);
  const exitDemo = useCallback(() => setIsDemo(false), []);

  return (
    // React 19: render context directly, no .Provider needed
    <DemoContext value={{ isDemo, enterDemo, exitDemo }}>
      {children}
    </DemoContext>
  );
}

// Convenience hook
export function useDemo(): DemoContextValue {
  return use(DemoContext);
}
```

### Pattern 2: Typed Mock Data Fixtures
**What:** Static TypeScript constants that conform to existing dashboard types, providing realistic demo data.
**When to use:** For every data domain the dashboard renders.
**Example:**
```typescript
// Source: Existing types from apps/dashboard/src/lib/types.ts
import type { ApiKey } from '@/lib/types';

export const DEMO_KEYS: ApiKey[] = [
  {
    short_token: 'abc123',
    label: 'production-agent',
    created_at: '2026-01-15T10:30:00Z',
    last_used_at: '2026-02-10T08:45:00Z',
  },
  {
    short_token: 'def456',
    label: 'staging-bot',
    created_at: '2026-01-20T14:00:00Z',
    last_used_at: '2026-02-09T22:15:00Z',
  },
  {
    short_token: 'ghi789',
    label: null,
    created_at: '2026-02-01T09:00:00Z',
    last_used_at: null,
  },
];
```

### Pattern 3: Chain History Type Definition
**What:** A dashboard-side type for chain execution history, derived from gateway types.
**When to use:** The "chain history" data domain does not yet exist in the dashboard. The fixture must define a type that Phase 19 (or later) will use to render chain history.
**Example:**
```typescript
// Derived from: apps/gateway/src/lib/chain-types.ts (ChainExecutionResult)
export interface ChainHistoryEntry {
  id: string;
  chain_name: string;
  success: boolean;
  steps_executed: number;
  steps_total: number;
  total_duration_ms: number;
  executed_at: string;
  steps: Array<{
    step_id: string;
    skipped: boolean;
    error: string | null;
    duration_ms: number;
  }>;
}
```

### Anti-Patterns to Avoid
- **Putting demo logic in individual hooks:** Phase 18 creates the context and data only. Phase 19 wires hooks to return demo data when `isDemo` is true. Do not pre-wire hooks in Phase 18 -- that breaks the phase boundary.
- **Using localStorage instead of sessionStorage:** The spec explicitly says "closing the tab clears it." localStorage persists across tabs and sessions. sessionStorage is scoped to the tab lifetime.
- **Generating timestamps dynamically with `new Date()`:** Demo data should use fixed timestamps so the demo experience is deterministic and screenshots are reproducible. Use hardcoded ISO strings with `date-fns` formatting in the rendering layer.
- **Creating a separate demo route or page:** The decision is "demo mode in actual dashboard, not separate page." The context is a flag that the same pages check.
- **Using `Context.Provider`:** React 19 supports rendering `<Context value={}>` directly. The old `<Context.Provider>` pattern works but is deprecated and will be removed in a future React version.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session-scoped persistence | Custom event listener or polling | `sessionStorage` + `useState` initializer | Browser-native, automatic tab-scoping, zero overhead |
| Realistic timestamps | Date math functions | Hardcoded ISO 8601 strings | Deterministic, reproducible, no time-zone bugs |
| Usage sparkline data | Random number generators | Handcrafted array of 24 hourly buckets | Realistic curve shape (peak during work hours, dip at night) |

**Key insight:** This phase is pure data structure work -- there is no complex behavior to hand-roll. The risk is in getting the data shapes wrong relative to what the hooks and components expect.

## Common Pitfalls

### Pitfall 1: SSR Hydration Mismatch with sessionStorage
**What goes wrong:** Server renders with `isDemo = false`, client reads sessionStorage and gets `isDemo = true`, causing a hydration mismatch error.
**Why it happens:** Next.js pre-renders client components to HTML during build. `sessionStorage` is not available at build time.
**How to avoid:** Initialize state with `false` on the server (using `typeof window === 'undefined'` check), then use `useEffect` to sync from sessionStorage on mount. Alternatively, since this is a static export (`output: 'export'`), the initial HTML is always `false` and client hydration picks up the sessionStorage value. The slight flash is acceptable because demo mode is opt-in -- normal users never see it.
**Warning signs:** Console error "Text content did not match" or React hydration warnings.

### Pitfall 2: Fixture Data Not Matching Hook Return Types Exactly
**What goes wrong:** Phase 19 tries to swap in fixtures but gets TypeScript errors because the fixture shape doesn't match what the SWR hook returns.
**Why it happens:** The hooks return `SWRResponse<T>` where `T` is a specific type. The fixtures must match `T` exactly. For example, `useConnectors` returns `ConnectorStatus[]` but derives it from `/admin/credentials` -- the fixture must be `ConnectorStatus[]`, not raw credential entries.
**How to avoid:** Import types directly from `@/lib/types` and `@/lib/hooks/use-usage` (for `RateLimitInfo`). Use `satisfies` assertions on fixture objects to catch mismatches at compile time.
**Warning signs:** TypeScript errors when Phase 19 tries to use fixtures.

### Pitfall 3: Chain History Type Misalignment with Gateway
**What goes wrong:** The dashboard `ChainHistoryEntry` type diverges from what the gateway will eventually serve, causing rework.
**Why it happens:** The gateway's chain execution response (in `chains.ts` route) uses a specific shape with `result`, `chain.name`, `chain.success`, etc. The dashboard type must match that envelope.
**How to avoid:** Derive the `ChainHistoryEntry` type directly from the gateway's response shape in `apps/gateway/src/routes/chains.ts` lines 98-119. Add an `id` and `executed_at` field that the gateway would add for history storage.
**Warning signs:** The gateway chain response uses `steps_executed` and `steps_total` (line 104-105), not `steps.length` -- fixture must use these field names.

### Pitfall 4: DemoProvider Placement in Component Tree
**What goes wrong:** The context is not available in all pages because it's placed inside the dashboard layout instead of the root layout.
**Why it happens:** The dashboard has two layouts: root (`app/layout.tsx` -- server component) and dashboard (`app/(dashboard)/layout.tsx` -- client component). The demo context must be available in both dashboard pages AND the login page (for auth bypass in Phase 19).
**How to avoid:** Place `DemoProvider` in the root layout (`app/layout.tsx`), making it a client component wrapper. This ensures demo mode is available everywhere, including the login page and root redirect page.
**Warning signs:** `useDemo()` throws "cannot be used outside of provider" error on certain pages.

### Pitfall 5: Forgetting Rate Limit Fixtures
**What goes wrong:** Phase 19 renders the usage page but rate limit cards are empty because no fixture was created for `RateLimitInfo[]`.
**Why it happens:** `RateLimitInfo` is defined in `src/lib/hooks/use-usage.ts`, not in `src/lib/types.ts`. It's easy to miss.
**How to avoid:** The usage data domain includes THREE fixture sets: `UsageResponse` (for `useUsage`), `RateLimitInfo[]` (for `useRateLimits`), and `ApiKey[]` (for `useAvailableKeys` filter dropdown -- can reuse the keys fixture).
**Warning signs:** Usage page renders chart but rate limit section is missing.

## Code Examples

Verified patterns from the existing codebase:

### Existing Auth Pattern (localStorage precedent)
```typescript
// Source: apps/dashboard/src/lib/auth.ts
// Shows the existing pattern for browser storage with SSR guard
const STORAGE_KEY = 'feelr_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}
```

### Existing Hook Pattern (what fixtures must satisfy)
```typescript
// Source: apps/dashboard/src/lib/hooks/use-keys.ts
// The hook returns SWRResponse<ApiKey[]>
// So DEMO_KEYS must be typed as ApiKey[]
export function useKeys() {
  return useSWR('admin-keys', () => gatewayFetch<ApiKey[]>('/admin/keys'));
}
```

### Existing Type Definitions (all 4+ data domains)
```typescript
// Source: apps/dashboard/src/lib/types.ts
// Domain 1: API Keys
interface ApiKey {
  short_token: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

// Domain 2: Connectors
interface ConnectorStatus {
  name: string;
  status: 'connected' | 'needs_reauth' | 'not_connected';
}

// Domain 3: Usage Stats
interface UsageResponse {
  window: string;
  buckets: UsageBucket[];
  filters: { key?: string; connector?: string };
}
interface UsageBucket {
  time_bucket: string;
  total_requests: number;
  error_count: number;
  avg_duration_ms: number;
}

// Domain 3b: Rate Limits (in use-usage.ts, not types.ts)
// Source: apps/dashboard/src/lib/hooks/use-usage.ts
interface RateLimitInfo {
  api_key_short: string;
  label: string | null;
  tier: string;
  limit: number;
  usage_1m: number;
  throttle_24h: number;
}

// Domain 4: Overview
interface OverviewData {
  total_keys: number;
  connected_services: number;
  recent_usage: {
    total_24h: number;
    hourly: Array<{ hour: string; count: number }>;
  };
}

// Domain 5: Chain History (NEW -- must be defined in fixtures)
// Derived from: apps/gateway/src/routes/chains.ts response shape
```

### Root Layout (where DemoProvider should be placed)
```typescript
// Source: apps/dashboard/src/app/layout.tsx
// Currently a server component. Needs 'use client' or a wrapper to host DemoProvider.
// NOTE: The root layout does NOT have 'use client' today.
// Option A: Convert to client component (but metadata export requires server component)
// Option B: Create a Providers wrapper component
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-50 antialiased">
        {/* DemoProvider wraps here */}
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
```

### Providers Wrapper Pattern (recommended for root layout)
```typescript
// New file: apps/dashboard/src/components/providers.tsx
'use client';

import { DemoProvider } from '@/lib/demo-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}

// Then in root layout.tsx (stays server component):
// <Providers>{children}</Providers>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `<Context.Provider value={}>` | `<Context value={}>` (render context directly) | React 19 (Dec 2024) | Simpler JSX, `.Provider` deprecated |
| `useContext(Ctx)` only | `use(Ctx)` also available | React 19 (Dec 2024) | Can read context conditionally (after early returns) |
| Custom state management for feature flags | React Context for simple boolean flags | Stable pattern | Zustand/Jotai overkill for single boolean |

**Deprecated/outdated:**
- `<Context.Provider>`: Still works in React 19 but deprecated. Will be removed in a future version. Use `<Context value={}>` directly.

## Open Questions

1. **Should overview fixture data be internally consistent with keys/connectors fixtures?**
   - What we know: `OverviewData` has `total_keys` and `connected_services` counts. The keys fixture has 3 keys. The connectors fixture should show 2-3 connected.
   - What's unclear: Whether Phase 19 will derive overview from keys/connectors fixtures or use a separate fixture.
   - Recommendation: Make `DEMO_OVERVIEW` consistent with the other fixtures (e.g., `total_keys: 3` matching `DEMO_KEYS.length`). This avoids confusing discrepancies in the demo.

2. **Should the chain history type live in `src/lib/types.ts` or only in the fixture file?**
   - What we know: The dashboard has no chain history page yet. Phase 19's scope is existing pages only. Chain history will be needed eventually (Phase 8 built the execution engine).
   - What's unclear: When a chain history dashboard page will be built.
   - Recommendation: Define `ChainHistoryEntry` in `src/lib/types.ts` alongside the other types. This future-proofs the type for when a chain history page is built, and keeps types centralized.

3. **How should the root layout accommodate `DemoProvider` without losing `metadata` export?**
   - What we know: The root layout (`app/layout.tsx`) is a server component that exports `metadata`. Adding `'use client'` would break the metadata export.
   - What's unclear: Nothing -- this is a solved problem.
   - Recommendation: Create a `Providers` client component that wraps `DemoProvider` (and any future providers). Import it in the server-component root layout. This is the standard Next.js App Router pattern.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** - Direct reading of all files in `apps/dashboard/src/` (types, hooks, pages, components, layouts, config)
- **Codebase inspection** - Direct reading of `apps/gateway/src/lib/chain-types.ts` and `apps/gateway/src/routes/chains.ts` for chain history type derivation
- **Installed versions** - React 19.2.4, Next.js 15.5.12, SWR 2.4.0, date-fns 4.1.x (verified from `node_modules/*/package.json`)
- [React 19 Context as Provider](https://react.dev/reference/react/createContext) - Context rendering without `.Provider`
- [React 19 release blog](https://react.dev/blog/2024/12/05/react-19) - `use()` API, Context improvements

### Secondary (MEDIUM confidence)
- [Next.js 15 Static Exports Guide](https://nextjs.org/docs/app/guides/static-exports) - Confirmed static export compatibility with client components
- [Next.js Client Components + Browser APIs FAQ](https://nextjs-faq.com/browser-api-client-component) - sessionStorage access pattern in client components

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies. All tools already in the project. Types verified from source.
- Architecture: HIGH - Context + fixture pattern is well-understood React. File structure follows existing codebase conventions.
- Pitfalls: HIGH - All pitfalls derived from reading actual code (e.g., root layout metadata constraint, RateLimitInfo location, sessionStorage SSR guard).

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable domain -- React Context and sessionStorage are mature APIs)
