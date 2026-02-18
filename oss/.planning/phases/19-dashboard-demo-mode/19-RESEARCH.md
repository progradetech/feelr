# Phase 19: Dashboard Demo Mode - Research

**Researched:** 2026-02-10
**Domain:** SWR hook interception for mock data, React component conditional rendering, demo UX patterns
**Confidence:** HIGH

## Summary

Phase 19 wires the Phase 18 foundation (DemoContext + mock data fixtures) into the existing dashboard so that when `isDemo` is `true`, the dashboard renders fully with fixture data, bypasses authentication, shows a demo banner, and handles interactive mutations locally without API calls. The dashboard is a Next.js 15.5 static-export SPA using React 19.2, SWR 2.4, Tailwind CSS 4, sonner 1.7 (toasts), and Recharts. All data flows through 6 SWR hooks (`useKeys`, `useConnectors`, `useUsage`, `useRateLimits`, `useAvailableKeys`, `useOverview`) defined in 4 hook files. The dashboard has 4 pages (overview, keys, connectors, usage), an AuthGuard component that gates access, and 2 mutation dialogs (KeyCreateDialog, KeyRevokeDialog) that call `gatewayMutate`.

There are exactly 4 requirements: DASH-03 (AuthGuard bypass), DASH-04 (SWR hooks return mock data), DASH-05 (demo banner), DASH-07 (interactive mutations with toast + local state). No new libraries are needed. The work is pure conditional logic insertion into existing files plus one new banner component.

The recommended approach for SWR hooks is **early return with a mock SWRResponse-shaped object** when `isDemo` is true, rather than using SWR's `fallbackData` option. This is cleaner because: (1) `fallbackData` still triggers a fetch by default, requiring `revalidateIfStale: false` which has caching side effects; (2) returning a static object when `isDemo` avoids any network call whatsoever; (3) the mock return shape is simple -- `{ data, error: undefined, isLoading: false, isValidating: false, mutate: no-op }`. Each hook already imports from `@/lib/api` and `swr` -- adding an import of `useDemo` from `@/lib/demo-context` and a conditional early return is minimal change.

**Primary recommendation:** Modify each hook to check `useDemo().isDemo` and return fixture data immediately. Modify AuthGuard to pass through when `isDemo`. Create a DemoBanner component rendered in the `(dashboard)/layout.tsx`. Modify KeyCreateDialog and KeyRevokeDialog to short-circuit with toast + local state when `isDemo`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | Context (`useDemo`), component rendering | Already installed; provides the `isDemo` flag |
| SWR | 2.4.0 | Data hooks that need demo interception | Already installed; hooks are the interception points |
| sonner | 1.7.4 | Toast notifications for demo mutations | Already installed; used by existing mutation dialogs |
| Tailwind CSS | 4.0.x | Styling for demo banner | Already installed; all UI uses Tailwind |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.469.x | Icons for demo banner (Info icon) | Already installed; used across all components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Early-return mock SWRResponse in each hook | SWR `fallbackData` + `revalidateIfStale: false` | `fallbackData` still triggers fetch by default; combining with `revalidateIfStale` introduces caching subtleties. Early return is simpler and guarantees zero network calls. |
| Per-hook `useDemo()` check | SWR middleware that intercepts all fetches | Over-engineered for 6 hooks; middleware would need to map SWR keys to fixture data, adding indirection. Direct check in each hook is explicit and debuggable. |
| Inline demo banner in each page | Shared DemoBanner in `(dashboard)/layout.tsx` | Banner must appear on ALL pages; placing it in the shared layout means one insertion point, not four. |
| Custom toast wrapper for demo mutations | Direct `toast.success()` in demo path | `sonner`'s `toast.success()` is already used by the existing mutation dialogs; no wrapper needed. |

**Installation:**
```bash
# No new dependencies needed -- all tools already in the project
```

## Architecture Patterns

### Recommended Project Structure
```
apps/dashboard/src/
  components/
    demo-banner.tsx            # NEW: persistent demo mode banner
    auth-guard.tsx             # MODIFY: bypass when isDemo
    key-create-dialog.tsx      # MODIFY: demo path with toast + local state
    key-revoke-dialog.tsx      # MODIFY: demo path with toast + local state
  app/
    (dashboard)/
      layout.tsx               # MODIFY: render DemoBanner
    page.tsx                   # MODIFY: redirect to /overview when isDemo
  lib/
    hooks/
      use-keys.ts              # MODIFY: return DEMO_KEYS when isDemo
      use-connectors.ts        # MODIFY: return DEMO_CONNECTORS when isDemo
      use-overview.ts          # MODIFY: return DEMO_OVERVIEW when isDemo
      use-usage.ts             # MODIFY: return DEMO_USAGE/DEMO_RATE_LIMITS/DEMO_KEYS when isDemo
```

### Pattern 1: SWR Hook Demo Interception (Early Return)
**What:** Each SWR hook checks `isDemo` from `useDemo()` and returns a static object matching `SWRResponse<T>` shape, bypassing the fetcher entirely.
**When to use:** In every hook that calls `useSWR` or `gatewayFetch`.
**Example:**
```typescript
// Source: SWR types (node_modules/swr/dist/_internal/types.d.ts line 775)
// SWRResponse has: data, error, isLoading, isValidating, mutate
'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';
import { DEMO_KEYS } from '@/lib/demo-data';
import type { ApiKey } from '@/lib/types';

export function useKeys() {
  const { isDemo } = useDemo();

  // In demo mode, return fixture data immediately -- no network call
  if (isDemo) {
    return {
      data: DEMO_KEYS as ApiKey[],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: async () => DEMO_KEYS as ApiKey[],
    };
  }

  return useSWR('admin-keys', () => gatewayFetch<ApiKey[]>('/admin/keys'));
}
```

**CRITICAL NOTE on React Rules of Hooks:** The early return with `isDemo` check BEFORE the `useSWR` call would violate the Rules of Hooks (hooks must be called unconditionally). There are two valid approaches:

**Approach A -- Conditional SWR key (null key disables fetch):**
```typescript
export function useKeys() {
  const { isDemo } = useDemo();
  const swr = useSWR(
    isDemo ? null : 'admin-keys',
    () => gatewayFetch<ApiKey[]>('/admin/keys'),
  );

  if (isDemo) {
    return {
      data: DEMO_KEYS as ApiKey[],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: swr.mutate,
    };
  }

  return swr;
}
```

**Approach B -- Wrapper hook that replaces SWR return:**
```typescript
export function useKeys() {
  const { isDemo } = useDemo();
  const swr = useSWR(
    isDemo ? null : 'admin-keys',
    () => gatewayFetch<ApiKey[]>('/admin/keys'),
  );

  return isDemo
    ? { ...swr, data: DEMO_KEYS as ApiKey[], isLoading: false }
    : swr;
}
```

**Recommendation: Use Approach A.** Passing `null` as the SWR key prevents the fetch entirely (SWR's documented conditional fetching pattern). Then override the return value with fixture data. The `swr.mutate` from the null-key call is safe to reference (it's a no-op since there's no key). This satisfies Rules of Hooks because `useSWR` is always called.

### Pattern 2: AuthGuard Bypass
**What:** The AuthGuard component checks `isDemo` from `useDemo()` and renders children immediately without checking `getAdminToken()`.
**When to use:** In the `AuthGuard` component that wraps the `(dashboard)` layout.
**Example:**
```typescript
// Source: apps/dashboard/src/components/auth-guard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/auth';
import { useDemo } from '@/lib/demo-context';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isDemo } = useDemo();
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    if (isDemo) return; // Skip auth check in demo mode
    const token = getAdminToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthed(true);
    }
  }, [router, isDemo]);

  // In demo mode, render children immediately
  if (isDemo) {
    return <>{children}</>;
  }

  if (!isAuthed) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
      </div>
    );
  }

  return <>{children}</>;
}
```

### Pattern 3: Demo Banner Component
**What:** A persistent banner rendered at the top of the dashboard layout when `isDemo` is true. It informs the user they are in demo mode and optionally provides an exit button.
**When to use:** In the `(dashboard)/layout.tsx`, conditionally rendered when `isDemo`.
**Example:**
```typescript
// Source: New component
'use client';

import { Info, X } from 'lucide-react';
import { useDemo } from '@/lib/demo-context';
import { useRouter } from 'next/navigation';

export function DemoBanner() {
  const { isDemo, exitDemo } = useDemo();
  const router = useRouter();

  if (!isDemo) return null;

  function handleExit() {
    exitDemo();
    router.push('/login');
  }

  return (
    <div className="flex items-center justify-between bg-blue-900/40 border-b border-blue-800/50 px-4 py-2">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-blue-400" />
        <span className="text-sm text-blue-200">
          You are viewing the dashboard in demo mode. Data shown is simulated.
        </span>
      </div>
      <button
        onClick={handleExit}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-800/50 hover:text-blue-100"
      >
        Exit Demo
      </button>
    </div>
  );
}
```

### Pattern 4: Demo Mutation Interception
**What:** Mutation dialogs (create key, revoke key) check `isDemo` and short-circuit with a toast + callback instead of calling `gatewayMutate`.
**When to use:** In `KeyCreateDialog` and `KeyRevokeDialog` where `gatewayMutate` is called.
**Example:**
```typescript
// In KeyCreateDialog.handleSubmit:
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (isDemo) {
    toast.success('Demo: API key created successfully');
    onCreated('fk_demo_' + Date.now().toString(36));
    setLabel('');
    return;
  }
  // ... existing gatewayMutate logic
}

// In KeyRevokeDialog.handleRevoke:
async function handleRevoke() {
  if (!isConfirmed) return;
  if (isDemo) {
    toast.success('Demo: API key revoked successfully');
    onConfirm();
    return;
  }
  // ... existing gatewayMutate logic
}
```

### Pattern 5: Root Page Demo Redirect
**What:** The root page (`app/page.tsx`) checks `isDemo` and redirects to `/overview` even without a token.
**When to use:** To ensure demo users navigating to `/` land on the dashboard.
**Example:**
```typescript
export default function RootPage() {
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
    } else {
      router.replace('/login');
    }
  }, [router, isDemo]);
  // ... spinner
}
```

### Anti-Patterns to Avoid
- **Returning early before `useSWR` call:** This violates Rules of Hooks. Always call `useSWR` (with `null` key in demo mode) before the conditional return.
- **Using `fallbackData` for demo data:** `fallbackData` is designed for SSR hydration, not permanent mock data. It still triggers a revalidation fetch unless paired with `revalidateIfStale: false`, which has cache-invalidation side effects.
- **Placing DemoBanner in each page component:** The banner must appear on ALL dashboard pages. Putting it in the shared `(dashboard)/layout.tsx` means one insertion point, not four separate ones.
- **Modifying `gatewayFetch` to return mock data:** This mixes concerns (API layer should not know about demo mode). Keep demo logic in hooks and components.
- **Skipping the root page redirect:** If a demo user navigates to `/`, they will be redirected to `/login` (no token). The root page must also check `isDemo`.
- **Forgetting `useAvailableKeys` in `use-usage.ts`:** The usage page uses `useAvailableKeys()` for its key filter dropdown. This hook must also return `DEMO_KEYS` in demo mode, or the dropdown will be empty.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mock SWR response shape | Custom state management for demo data | Spread SWR's null-key response + override data/isLoading | SWR's response shape is complex (mutate function, isValidating); matching it exactly avoids type errors |
| Toast notifications | Custom notification system for demo feedback | `sonner`'s `toast.success()` | Already used by mutation dialogs; consistent UX |
| Sticky banner positioning | CSS position:fixed with manual z-index | Flex layout in dashboard layout before `<main>` | The dashboard layout already uses flex; adding a child before `<main>` is natural |

**Key insight:** Phase 19 has zero "build from scratch" work. Every change is a conditional insertion into an existing file. The risk is in missing a hook or redirect path, not in building something new.

## Common Pitfalls

### Pitfall 1: Violating React Rules of Hooks
**What goes wrong:** Returning fixture data before the `useSWR` call means `useSWR` is called conditionally (called in non-demo, not called in demo). React will throw "Rendered more hooks than during the previous render."
**Why it happens:** Natural instinct is to put the demo check at the top and return early, which skips the hook call.
**How to avoid:** Always call `useSWR` unconditionally. Pass `null` as the key in demo mode to disable fetching, then override the return value afterward.
**Warning signs:** Runtime error about hooks count changing between renders.

### Pitfall 2: Forgetting `useAvailableKeys` Hook
**What goes wrong:** The usage page's key filter dropdown is empty in demo mode because `useAvailableKeys()` still tries to fetch.
**Why it happens:** `useAvailableKeys` is defined in `use-usage.ts` alongside `useUsage` and `useRateLimits`. It's easy to focus on the "main" hooks and miss this supplementary one.
**How to avoid:** Audit ALL hooks in `use-usage.ts`: `useUsage`, `useRateLimits`, and `useAvailableKeys` all need demo interception. `useAvailableConnectors` does NOT need interception because it returns a static array (no SWR call).
**Warning signs:** Usage page renders chart but the key filter dropdown shows "All Keys" with no options.

### Pitfall 3: Root Page Redirect Loop
**What goes wrong:** Demo user visits `/` -> root page checks `getAdminToken()` -> no token -> redirects to `/login` -> login page doesn't know about demo mode -> user is stuck on login.
**Why it happens:** The root page (`app/page.tsx`) only checks localStorage for a token; it doesn't check the demo context.
**How to avoid:** Add `useDemo()` check to the root page's redirect logic. If `isDemo`, redirect to `/overview` without checking the token.
**Warning signs:** Demo user is bounced to login page instead of dashboard.

### Pitfall 4: Demo Banner Not Visible on All Pages
**What goes wrong:** Demo banner appears on some pages but not others.
**Why it happens:** Banner placed inside individual page components instead of the shared `(dashboard)/layout.tsx`.
**How to avoid:** Place the DemoBanner in `(dashboard)/layout.tsx` INSIDE the AuthGuard (so it renders alongside the sidebar and main content). The layout wraps all 4 dashboard pages.
**Warning signs:** Navigating between pages shows/hides the banner inconsistently.

### Pitfall 5: Sidebar Logout Button Behavior in Demo Mode
**What goes wrong:** Clicking "Logout" in demo mode calls `clearAdminToken()` but there's nothing to clear. The sidebar's logout button should exit demo mode instead.
**Why it happens:** The Sidebar component has a `handleLogout` that clears the admin token and redirects to `/login`. In demo mode, this should instead call `exitDemo()`.
**How to avoid:** Add `useDemo()` check to the Sidebar component. In demo mode, the logout button should call `exitDemo()` and redirect to `/login` (or the landing page). This provides a consistent "exit demo" path beyond the banner button.
**Warning signs:** Clicking logout in demo mode redirects to login but demo flag may still be set in sessionStorage.

### Pitfall 6: KeyCreateDialog `onCreated` Callback Expectations
**What goes wrong:** In demo mode, `onCreated` is called with a fake key string, but the parent page's `handleCreated` function sets `revealedKey` state and calls `mutate()`. The `mutate()` will try to refetch from the API.
**Why it happens:** The keys page calls `mutate()` (SWR revalidation) after key creation. In demo mode, this fires a real network request.
**How to avoid:** Two options: (1) The keys page can also check `isDemo` in its `handleCreated` callback and skip `mutate()`, OR (2) the null-key SWR in demo mode means `mutate()` is a no-op (since there's no cache key to revalidate). **Option 2 works automatically** if the hook uses `null` as the SWR key in demo mode -- `mutate()` will simply resolve without fetching.
**Warning signs:** Console shows a failed network request after creating a key in demo mode.

### Pitfall 7: TypeScript Return Type Mismatch
**What goes wrong:** The demo mock return object from hooks has a different type than `SWRResponse<T>`, causing TypeScript errors in page components.
**Why it happens:** `SWRResponse` includes complex properties like `mutate: KeyedMutator<Data>` which is a function with specific overloads. A hand-typed mock may not match.
**How to avoid:** Use the `swr.mutate` from the null-key useSWR call (it's a valid `KeyedMutator` even though it's a no-op). Spread the SWR result and override only `data` and `isLoading`:
```typescript
const swr = useSWR(isDemo ? null : 'key', fetcher);
return isDemo ? { ...swr, data: DEMO_DATA, isLoading: false } : swr;
```
This ensures TypeScript is satisfied because all properties come from a real `SWRResponse`.
**Warning signs:** TypeScript errors like "Type '{ data: ...; }' is not assignable to type 'SWRResponse<...>'".

## Code Examples

Verified patterns from the existing codebase:

### Existing Toast Usage (sonner)
```typescript
// Source: apps/dashboard/src/components/key-create-dialog.tsx (line 41)
import { toast } from 'sonner';
// Success:
toast.success('API key created successfully');
// Error:
toast.error('Failed to create API key');
```

### Existing AuthGuard Pattern
```typescript
// Source: apps/dashboard/src/components/auth-guard.tsx
// Currently checks getAdminToken() in useEffect
// Demo bypass adds isDemo check at the top
const { isDemo } = useDemo();
useEffect(() => {
  if (isDemo) return;
  // ... existing token check
}, [router, isDemo]);
if (isDemo) return <>{children}</>;
```

### Existing Dashboard Layout (where banner goes)
```typescript
// Source: apps/dashboard/src/app/(dashboard)/layout.tsx
// Currently: <AuthGuard><div className="flex h-screen"><Sidebar /><main>...
// After: <AuthGuard><DemoBanner /><div className="flex h-screen"><Sidebar /><main>...
// OR: <AuthGuard><div className="flex h-screen flex-col"><DemoBanner /><div className="flex flex-1">...
```

### SWR Null Key Pattern (conditional fetching)
```typescript
// Source: SWR docs (https://swr.vercel.app) + SWR types
// Passing null as key tells SWR to skip fetching
const swr = useSWR(shouldFetch ? 'key' : null, fetcher);
// swr.data will be undefined, swr.isLoading will be false
// swr.mutate is a valid no-op function
```

### All 6 Hooks Requiring Interception
```typescript
// Hook 1: useKeys (use-keys.ts) -> DEMO_KEYS
// Hook 2: useConnectors (use-connectors.ts) -> DEMO_CONNECTORS
// Hook 3: useOverview (use-overview.ts) -> DEMO_OVERVIEW
// Hook 4: useUsage (use-usage.ts) -> DEMO_USAGE
// Hook 5: useRateLimits (use-usage.ts) -> DEMO_RATE_LIMITS
// Hook 6: useAvailableKeys (use-usage.ts) -> DEMO_KEYS (reused)
// NOT useAvailableConnectors -- it returns a static array, no SWR
```

### Dashboard Layout Banner Placement
```typescript
// Source: apps/dashboard/src/app/(dashboard)/layout.tsx
// The layout uses flex. Adding a banner before the flex container
// will push it to the top naturally.
export default function DashboardLayout({ children }) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col">
        <DemoBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SWR `initialData` option | SWR `fallbackData` option | SWR 2.0 (2022) | `initialData` renamed; `fallbackData` still triggers revalidation by default |
| `<Context.Provider>` | `<Context value={}>` | React 19 (Dec 2024) | Phase 18 already uses the new pattern |
| `useContext(Ctx)` | `use(Ctx)` | React 19 (Dec 2024) | Phase 18 already uses `use()` |

**Deprecated/outdated:**
- SWR `initialData` option: Renamed to `fallbackData` in SWR 2.0. Not relevant here since we don't use either.

## Open Questions

1. **Should the Sidebar "Logout" button change behavior in demo mode?**
   - What we know: The Sidebar's `handleLogout` calls `clearAdminToken()` + `router.push('/login')`. In demo mode, there's no token to clear.
   - What's unclear: Should the logout button call `exitDemo()` to properly clear demo state, or just redirect to `/login`? If demo flag stays in sessionStorage but user is on `/login`, they could navigate back into demo mode.
   - Recommendation: Modify the Sidebar to call `exitDemo()` in demo mode before redirecting. This ensures clean state. The DemoBanner's "Exit Demo" button should do the same thing. Both exit paths should be consistent.

2. **Should the login page detect demo mode and redirect to /overview?**
   - What we know: If a demo user somehow ends up on `/login` (e.g., direct URL), the login page currently checks `getAdminToken()` and stays on the login form.
   - What's unclear: Whether Phase 21 (interactive demo) will handle this entry point differently.
   - Recommendation: Add a demo check to the login page that redirects to `/overview` if `isDemo` is true. This prevents demo users from seeing the login form. Phase 21 can adjust later if needed.

3. **How should `useUsage` handle the `filters` parameter in demo mode?**
   - What we know: `useUsage(filters)` accepts key/connector/window filters. In demo mode, the fixture data is static (one `UsageResponse` for all filter combinations).
   - What's unclear: Whether to filter the fixture data based on the `filters` parameter or always return the full fixture.
   - Recommendation: Return the full `DEMO_USAGE` fixture regardless of filters. Implementing client-side filtering of fixture data is unnecessary complexity for a demo. The chart will show the same data regardless of filter selection, which is acceptable for a demo experience.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** - Direct reading of all dashboard source files: hooks (4 files, 6 hooks), pages (4 dashboard pages + root + login), components (auth-guard, sidebar, key-create-dialog, key-revoke-dialog, key-reveal, connector-card, usage-chart, usage-breakdown, providers, demo-banner), layouts (root + dashboard), lib (api.ts, auth.ts, types.ts, demo-context.tsx, demo-data/)
- **SWR types** - `node_modules/swr/dist/_internal/types.d.ts` lines 775-810: SWRResponse interface with `data`, `error`, `isLoading`, `isValidating`, `mutate`
- **SWR conditional fetching** - [SWR Conditional Fetching](https://swr.vercel.app/docs/conditional-fetching): passing `null` key disables fetch
- **Installed versions** - React 19.2.4, Next.js 15.5.12, SWR 2.4.0, sonner 1.7.4 (verified from node_modules/*/package.json)

### Secondary (MEDIUM confidence)
- **SWR GitHub discussions** - [Discussion #2823](https://github.com/vercel/swr/issues/2823): confirms `fallbackData` + `revalidateIfStale: false` behavior
- **sonner GitHub** - [sonner repository](https://github.com/emilkowalski/sonner): `toast.success()` and `toast.error()` API confirmed

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies. All tools already installed and verified from node_modules.
- Architecture: HIGH - All patterns derived from reading actual code. Hook interception strategy verified against SWR type definitions and conditional fetching docs. Rules of Hooks constraint identified and addressed.
- Pitfalls: HIGH - All pitfalls derived from reading actual code paths (root page redirect, useAvailableKeys, Sidebar logout, KeyCreateDialog mutate callback). TypeScript return type issue verified against SWR types.

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable domain -- hook interception and conditional rendering are mature patterns)
