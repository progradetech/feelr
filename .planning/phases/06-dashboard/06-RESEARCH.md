# Phase 6: Dashboard - Research

**Researched:** 2026-02-06
**Domain:** Next.js 16 web dashboard communicating with Hono/Cloudflare Workers gateway API
**Confidence:** HIGH

## Summary

Phase 6 builds a Next.js 16 web dashboard for Feelr account management -- API key CRUD, connector auth status, and usage visualization. The dashboard communicates exclusively with the gateway through API routes (currently at `/admin/*`, with new `/internal/*` routes needed for dashboard-specific concerns like usage stats and overview data).

The recommended approach is a **static-export SPA** (`output: 'export'`) using Next.js 16 App Router with client-side data fetching via SWR. This avoids SSR deployment complexity entirely -- the dashboard is purely static HTML/CSS/JS served from Cloudflare Pages (or any CDN) that calls the gateway API directly. The UI stack is shadcn/ui + Tailwind CSS v4 + Recharts for a developer-minimal aesthetic.

A critical gap exists: **usage stats (DASH-03) require usage tracking that does not yet exist in the gateway**. Phase 7 (Production Hardening) introduces D1-backed usage metering (PLAT-03). Phase 6 must introduce basic usage recording in the gateway (request counting per key/connector/timestamp) so the dashboard has data to display. Without this, the usage visualization page would be an empty shell.

**Primary recommendation:** Build a static-export Next.js 16 SPA at `apps/dashboard/` using shadcn/ui + Tailwind CSS v4 + Recharts. Deploy to Cloudflare Pages. Add `/internal/*` gateway routes for dashboard-specific data aggregation (overview summary, usage stats). Introduce minimal D1-backed usage recording in the gateway dispatch path to satisfy DASH-03.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sidebar navigation with persistent left sidebar (sections: Overview, Keys, Connectors, Usage)
- Overview landing page with summary cards (total keys, connected services count, recent usage sparkline)
- Dashboard authentication via admin token from CLI (`feelr init` generates it, user pastes into login)
- One-time key reveal after creation with copy button -- full key shown once in highlighted box, masked forever after dismissal (GitHub PAT pattern)
- Revoking a key requires typing the key name to confirm (GitHub repo deletion pattern) -- extra friction for destructive action
- Must show: connector name, auth status (at minimum connected/not connected), and action to reconnect
- Must satisfy success criteria: usage queryable per key, per connector, per time window (hour/day/month)

### Claude's Discretion
- Visual style direction (developer-minimal vs polished SaaS -- user is open to either)
- API key creation form (inline vs modal)
- Key list info density (minimal vs detailed with last-used/request-count)
- Connector layout (cards vs table), status states (3 vs 4 states), re-auth UX (browser OAuth vs CLI instructions), detail view (yes/no)
- Usage metrics (request count alone vs count + error rate), time range controls (fixed presets vs date picker), chart types (line/area vs bar breakdown), filter complexity (dropdown filters vs aggregate only)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.x | App Router framework | Latest stable with React 19.2, Turbopack default, SPA/static export support |
| React | 19.2 | UI rendering | Ships with Next.js 16, includes View Transitions and useEffectEvent |
| Tailwind CSS | 4.x | Utility-first styling | Default with Next.js 16, v4 is 5x faster builds, auto-scans (no config file needed) |
| shadcn/ui | latest | Component library (copy-to-project) | Industry standard for developer dashboards, fully customizable, works with Tailwind v4 |
| SWR | 2.x | Client-side data fetching + caching | Lightweight (4.2kB), perfect for SPA pattern, automatic revalidation, built by Vercel |
| Recharts | 2.x | Charts/visualization | Lightweight SVG charts, simple API, standard for React dashboards, active maintenance |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | latest | Icons | shadcn/ui uses Lucide icons by default |
| react-hook-form | 7.x | Form management | Key creation form, login form -- shadcn/ui form components use it |
| zod | 3.x | Validation schemas | Already in monorepo (gateway uses it), shared validation for forms |
| sonner | latest | Toast notifications | Key created/revoked feedback, auth errors -- shadcn/ui integrates it |
| date-fns | 3.x | Date formatting | Usage time windows, key timestamps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SWR | TanStack Query | TanStack Query is more powerful (mutations, infinite queries) but heavier; SWR is simpler for read-heavy dashboard patterns |
| Recharts | Tremor | Tremor is even simpler but less customizable; Recharts gives more chart type flexibility |
| Static export | OpenNext on Cloudflare Workers | SSR is unnecessary for an admin dashboard that fetches all data client-side; static export is simpler to deploy and maintain |
| shadcn/ui | Radix primitives directly | shadcn/ui provides pre-styled components on top of Radix; saves significant time |

**Installation:**
```bash
# From monorepo root
cd apps/dashboard
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
pnpm dlx shadcn@latest init
pnpm add swr recharts lucide-react date-fns sonner
pnpm add -D @feelr/tsconfig
```

## Architecture Patterns

### Recommended Project Structure
```
apps/dashboard/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout with sidebar
│   │   ├── page.tsx            # Redirect to /overview or login
│   │   ├── login/
│   │   │   └── page.tsx        # Admin token login page
│   │   ├── (dashboard)/        # Route group with sidebar layout
│   │   │   ├── layout.tsx      # Sidebar + main content layout
│   │   │   ├── overview/
│   │   │   │   └── page.tsx    # Summary cards + sparkline
│   │   │   ├── keys/
│   │   │   │   └── page.tsx    # API key CRUD
│   │   │   ├── connectors/
│   │   │   │   └── page.tsx    # Connector status grid
│   │   │   └── usage/
│   │   │       └── page.tsx    # Usage charts + filters
│   │   └── globals.css         # Tailwind imports
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components (auto-generated)
│   │   ├── sidebar.tsx         # Navigation sidebar
│   │   ├── key-create-dialog.tsx
│   │   ├── key-revoke-dialog.tsx
│   │   ├── key-reveal.tsx      # One-time key reveal component
│   │   ├── connector-card.tsx
│   │   ├── usage-chart.tsx
│   │   └── auth-guard.tsx      # Redirect to login if no token
│   ├── lib/
│   │   ├── api.ts              # Gateway API client (fetch wrapper)
│   │   ├── auth.ts             # Token storage/retrieval (localStorage)
│   │   ├── hooks/
│   │   │   ├── use-keys.ts     # SWR hook for API keys
│   │   │   ├── use-connectors.ts # SWR hook for connector status
│   │   │   ├── use-usage.ts    # SWR hook for usage stats
│   │   │   └── use-overview.ts # SWR hook for overview summary
│   │   └── types.ts            # Dashboard-specific types
│   └── config.ts               # Gateway URL, app constants
├── next.config.ts              # output: 'export'
├── tailwind.config.ts          # (minimal, v4 auto-scans)
├── tsconfig.json
├── package.json
└── public/
    └── favicon.ico
```

### Pattern 1: Static Export SPA with Client-Side Auth
**What:** Next.js 16 static export produces pure HTML/CSS/JS. All data fetching happens client-side via SWR calling the gateway API. Auth token stored in localStorage (acceptable for admin dashboard with single admin token).
**When to use:** Always -- this is the deployment model.
**Why:** No SSR means no server to manage. Dashboard is just static files on a CDN. Gateway handles all business logic and security. The admin token is already a shared secret (pasted from CLI), so localStorage is the appropriate storage -- it is equivalent to the CLI storing it in `~/.config/feelr/config.toml`.

```typescript
// src/lib/api.ts
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://api.feelr.dev';

export async function gatewayFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('feelr_admin_token');
  if (!token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  const body = await res.json();

  if (!body.ok) {
    throw new Error(body.error?.message || 'Gateway request failed');
  }

  return body.data;
}
```

### Pattern 2: SWR Data Fetching Hooks
**What:** Custom hooks wrapping SWR for each data domain, providing automatic caching, revalidation, and loading states.
**When to use:** All dashboard pages.

```typescript
// src/lib/hooks/use-keys.ts
'use client';
import useSWR from 'swr';
import { gatewayFetch } from '../api';

export function useKeys() {
  return useSWR('keys', () => gatewayFetch<ApiKeyRecord[]>('/admin/keys'));
}

// src/lib/hooks/use-connectors.ts
export function useConnectors() {
  return useSWR('connectors', () => gatewayFetch<ConnectorStatus[]>('/admin/credentials'));
}
```

### Pattern 3: Route Group Layout for Sidebar
**What:** Next.js route group `(dashboard)` wraps all authenticated pages with the sidebar layout without affecting the URL path.
**When to use:** All pages except login.

```typescript
// src/app/(dashboard)/layout.tsx
'use client';
import { Sidebar } from '@/components/sidebar';
import { AuthGuard } from '@/components/auth-guard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
```

### Pattern 4: Recharts in Client Components
**What:** Chart components must use 'use client' directive since Recharts requires DOM access.
**When to use:** Usage visualization page.

```typescript
// src/components/usage-chart.tsx
'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface UsageDataPoint {
  timestamp: string;
  requests: number;
}

export function UsageChart({ data }: { data: UsageDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <XAxis dataKey="timestamp" />
        <YAxis />
        <Tooltip />
        <Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="#3b82f680" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### Anti-Patterns to Avoid
- **SSR for this dashboard:** The dashboard talks to an external API with a user-provided token. SSR would require the server to know the token, adding complexity for zero benefit. Static export is simpler and more portable.
- **Direct KV/D1 access from dashboard:** Violates DASH-04. All data flows through gateway API routes.
- **Storing admin token in httpOnly cookie:** Would require a server to set the cookie. Since we are a static export, localStorage is the appropriate choice. The admin token has the same security profile as the CLI config file -- it is a shared secret the user manages.
- **Building a custom component library:** shadcn/ui provides battle-tested components. Customize them, do not rebuild them.
- **Fetching data in Server Components then passing to client:** Not applicable for static export SPA. All fetching is client-side.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI components (buttons, dialogs, tables) | Custom component library | shadcn/ui | Accessible, tested, customizable, developer-standard |
| Data fetching + caching | Custom fetch wrapper with cache | SWR | Handles stale-while-revalidate, error retry, deduplication, focus revalidation |
| Charts | Canvas/SVG rendering | Recharts | D3-based, responsive, handles edge cases (empty data, resize, tooltips) |
| Form validation | Manual validation logic | react-hook-form + zod | Performant (uncontrolled), type-safe, integrates with shadcn/ui form components |
| Toast notifications | Custom notification system | sonner | Accessible, stacking, dismissal, integrates with shadcn/ui |
| Date formatting | Custom date utils | date-fns | Tree-shakeable, timezone-aware, locale support |
| Copy to clipboard | document.execCommand | navigator.clipboard.writeText | Modern API, Promise-based, works in all supported browsers |

**Key insight:** The dashboard is a standard CRUD + visualization app. Every piece has a well-established library. The differentiation is in the UX patterns (one-time key reveal, type-to-confirm revocation), not in the technology.

## Common Pitfalls

### Pitfall 1: No Usage Data Exists Yet
**What goes wrong:** DASH-03 requires usage stats per key/connector/time window, but the gateway currently has no usage recording. Phase 7 (Production Hardening) introduces D1-backed metering (PLAT-03).
**Why it happens:** Phases were scoped independently. Dashboard needs data that the gateway does not yet produce.
**How to avoid:** Introduce basic usage recording in this phase. Add a D1 binding to the gateway, create a `usage` table, and insert a row per request in the dispatch path (via `waitUntil` for non-blocking). Keep the schema simple -- the Phase 7 metering system can build on this foundation.
**Warning signs:** Usage page shows "no data" even after making API requests.

### Pitfall 2: CORS Between Dashboard and Gateway
**What goes wrong:** Static dashboard at `feelr.dev` (or `localhost:3000`) calls gateway at `api.feelr.dev` (or `localhost:8787`). Browser blocks cross-origin requests.
**Why it happens:** Different origins. The gateway already has `cors()` middleware (global), but it may need explicit origin configuration for production.
**How to avoid:** The gateway already applies `app.use('*', cors())` globally. For production, configure specific allowed origins. For development, `cors()` with defaults allows `*`. Verify CORS works during development setup.
**Warning signs:** Browser console shows "Access-Control-Allow-Origin" errors.

### Pitfall 3: Route Naming Mismatch (/admin/* vs /internal/*)
**What goes wrong:** DASH-04 says dashboard uses `/internal/*` routes, but the gateway currently only has `/admin/*` routes. Planning confusion about which routes the dashboard calls.
**Why it happens:** The original architecture docs planned `/internal/*` routes for dashboard-specific endpoints, but the actual implementation put key/credential management under `/admin/*`.
**How to avoid:** The dashboard should call the existing `/admin/*` routes for key and credential management (they already exist and work). New dashboard-specific aggregation endpoints (overview summary, usage stats) should go under `/internal/*` with admin auth. This gives a clean separation: `/admin/*` = CRUD operations (shared with CLI), `/internal/*` = dashboard-specific aggregations.
**Warning signs:** 404 errors when dashboard tries to call non-existent routes.

### Pitfall 4: Static Export Limitations
**What goes wrong:** Attempting to use server-side features (Server Components fetching data, API routes, Server Actions with database access) in a static export build.
**Why it happens:** Developers forget `output: 'export'` disables all server features.
**How to avoid:** All pages must be 'use client' or pure layout wrappers. All data fetching must use SWR/fetch from client-side code. No `app/api/` route handlers. No `cookies()` or `headers()` server functions.
**Warning signs:** Build errors: "Dynamic server usage: Page couldn't be rendered statically."

### Pitfall 5: Admin Token Exposure in Network Tab
**What goes wrong:** Admin token visible in browser DevTools Network tab on every request.
**Why it happens:** Bearer token sent in Authorization header on all gateway calls.
**How to avoid:** This is inherent to the admin token pattern and is acceptable for this use case. The admin token has the same security profile as a CLI config file -- it is a shared secret for the account owner. Add a clear warning on the login page: "This token grants full admin access." Future phases could add scoped dashboard tokens, but that is out of scope for Phase 6.
**Warning signs:** N/A -- this is expected behavior, not a bug.

### Pitfall 6: SWR Key Collisions
**What goes wrong:** Multiple SWR hooks with the same key return stale data from a different query.
**Why it happens:** SWR caches by key string. If two hooks use the same key but different fetchers, they conflict.
**How to avoid:** Use descriptive, unique keys that include query parameters: `usage-${connector}-${timeWindow}` not just `usage`.
**Warning signs:** Dashboard shows data from a different filter selection.

## Code Examples

### Gateway: D1 Usage Recording (Non-Blocking)
```typescript
// apps/gateway/src/middleware/usage-recorder.ts
// Records each API request to D1 for usage stats dashboard.
// Uses waitUntil for non-blocking writes.

import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../lib/types';

export const usageRecorder = createMiddleware<AppEnv>(async (c, next) => {
  const startTime = Date.now();
  await next();
  const durationMs = Date.now() - startTime;

  // Non-blocking write via waitUntil
  c.executionCtx.waitUntil(
    recordUsage(c.env.USAGE_DB, {
      api_key_short: c.get('apiKeyRecord')?.shortToken ?? 'unknown',
      connector: c.req.param('connector') ?? 'unknown',
      action: c.req.param('action') ?? 'unknown',
      status_code: c.res.status,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    })
  );
});

async function recordUsage(db: D1Database, record: UsageRecord): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO usage (api_key_short, connector, action, status_code, duration_ms, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      record.api_key_short,
      record.connector,
      record.action,
      record.status_code,
      record.duration_ms,
      record.timestamp,
    ).run();
  } catch {
    // Usage recording is best-effort -- never fail the request
  }
}
```

### Gateway: D1 Schema for Usage Table
```sql
-- Create with: npx wrangler d1 execute USAGE_DB --command "..."
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_short TEXT NOT NULL,
  connector TEXT NOT NULL,
  action TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_key ON usage(api_key_short);
CREATE INDEX IF NOT EXISTS idx_usage_connector ON usage(connector);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_key_connector ON usage(api_key_short, connector);
```

### Gateway: Internal Routes for Dashboard
```typescript
// apps/gateway/src/routes/internal.ts
// Dashboard-specific aggregation endpoints.
// Mounted at /internal, uses admin auth.

import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';
import { adminAuthMiddleware } from '../middleware/admin-auth';

const internal = new Hono<AppEnv>();
internal.use('*', adminAuthMiddleware);

// GET /internal/overview -- summary data for dashboard landing page
internal.get('/overview', async (c) => {
  const [keys, credentials, usageSummary] = await Promise.all([
    c.env.AUTH_KV.list({ prefix: 'apikey:' }),
    listCredentials(c.env.AUTH_KV),
    getRecentUsageSummary(c.env.USAGE_DB),
  ]);

  return c.json({
    ok: true,
    data: {
      total_keys: keys.keys.length,
      connected_services: credentials.length,
      recent_usage: usageSummary,
    },
  });
});

// GET /internal/usage?key=X&connector=Y&window=day&from=...&to=...
internal.get('/usage', async (c) => {
  const params = {
    key: c.req.query('key'),
    connector: c.req.query('connector'),
    window: c.req.query('window') || 'day',  // hour | day | month
    from: c.req.query('from'),
    to: c.req.query('to'),
  };

  const data = await queryUsage(c.env.USAGE_DB, params);
  return c.json({ ok: true, data });
});

export const internalRoutes = internal;
```

### Dashboard: Auth Guard Component
```typescript
// src/components/auth-guard.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('feelr_admin_token');
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthed(true);
    }
  }, [router]);

  if (!isAuthed) return null; // Or loading spinner
  return <>{children}</>;
}
```

### Dashboard: Key Reveal Component (One-Time Show)
```typescript
// src/components/key-reveal.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface KeyRevealProps {
  fullKey: string;
  onDismiss: () => void;
}

export function KeyReveal({ fullKey, onDismiss }: KeyRevealProps) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    await navigator.clipboard.writeText(fullKey);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-4">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
        Make sure to copy your API key now. You won't be able to see it again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-zinc-900 px-3 py-2 font-mono text-sm text-green-400">
          {fullKey}
        </code>
        <Button variant="outline" size="sm" onClick={copyKey}>
          <Copy className="h-4 w-4 mr-1" />
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
        I've copied my key
      </Button>
    </div>
  );
}
```

### Dashboard: Type-to-Confirm Revocation Dialog
```typescript
// src/components/key-revoke-dialog.tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface KeyRevokeDialogProps {
  keyLabel: string;
  shortToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function KeyRevokeDialog({
  keyLabel, shortToken, open, onOpenChange, onConfirm,
}: KeyRevokeDialogProps) {
  const [confirmation, setConfirmation] = useState('');
  const confirmText = keyLabel || shortToken;
  const isMatch = confirmation === confirmText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke API Key</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This action cannot be undone. To confirm, type <strong>{confirmText}</strong> below.
        </p>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={`Type "${confirmText}" to confirm`}
        />
        <Button variant="destructive" disabled={!isMatch} onClick={onConfirm}>
          Revoke Key
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

## Claude's Discretion Recommendations

Based on research and the developer-tool context:

### Visual Style: Developer-Minimal
**Recommendation:** Developer-minimal (dark mode default, monospace accents, clean spacing). This matches the target audience (developers using AI agents) and the reference points (Stripe/Vercel dashboards). shadcn/ui's default dark theme with zinc palette achieves this naturally.

### API Key Creation: Modal Dialog
**Recommendation:** Modal dialog (not inline). The one-time key reveal pattern requires focused attention. A modal forces the user to acknowledge the key before dismissing. Inline creation would let the key scroll off screen.

### Key List Info Density: Detailed
**Recommendation:** Detailed list with columns: label, short token (masked), created date, last used date, request count (if usage data exists). Developers want to know which keys are active. Last-used helps identify keys to revoke. This data is already available from the gateway (`/admin/keys` returns `last_used_at`).

### Connector Layout: Card Grid
**Recommendation:** Card grid (not table). Each connector is a visual card showing name, icon placeholder, status badge, and a reconnect action. Cards work better for 4 connectors (current count) than a table would. If connector count grows beyond 8-10, a table view could be added later.

### Status States: 3 States
**Recommendation:** Three states: `connected` (green), `needs re-auth` (amber), `not connected` (gray). The gateway already provides `connected`, `expired`, `not_configured` on the `/status` endpoint. Map `expired` to `needs re-auth` for user-friendly language. A fourth "error" state adds complexity without clear user action.

### Re-Auth UX: CLI Instructions
**Recommendation:** Show CLI command to reconnect (e.g., `feelr auth slack`). The OAuth flow is already implemented in the CLI (Phase 5). Adding browser-based OAuth to the dashboard would require significant new gateway routes (OAuth callback handling from browser). CLI instructions are the pragmatic choice for Phase 6. Browser-based re-auth can be added in a future phase.

### Usage Metrics: Request Count + Error Rate
**Recommendation:** Track both request count and error rate. The usage recording already captures `status_code`, so distinguishing successful (2xx) from failed (4xx/5xx) requests is trivial. Show total requests as primary metric, error rate as secondary. This gives developers visibility into both volume and health.

### Time Range Controls: Fixed Presets
**Recommendation:** Fixed presets: Last Hour, Last 24 Hours, Last 7 Days, Last 30 Days. A date picker adds complexity for minimal gain in a developer dashboard. Presets cover the common use cases. The gateway query accepts `from`/`to` parameters, so a custom date picker could be added later without backend changes.

### Chart Type: Area Chart
**Recommendation:** Area chart for the primary time-series view (requests over time). Area charts convey volume intuitively. Add a simple bar breakdown by connector as a secondary view. Both are well-supported by Recharts.

### Filter Complexity: Dropdown Filters
**Recommendation:** Two dropdown filters: Key (all keys vs specific key) and Connector (all connectors vs specific connector). These map directly to the query parameters. Aggregate-only would hide useful drill-down capability. More complex filter combinations (key + connector + action) can be added later.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` | Next.js 16 (2026) | Rename file and export; proxy.ts is NOT for API proxying, only request interception |
| `tailwind.config.js` | CSS-only config in Tailwind v4 | Tailwind v4 (2025) | No JS config file needed; customize in CSS with `@theme` directive |
| next-on-pages (Cloudflare) | @opennextjs/cloudflare | Late 2025 | next-on-pages deprecated; OpenNext is official adapter for SSR on Workers |
| SSR dashboards | Static export SPA + client-side fetching | Next.js 16 SPA guide | For admin dashboards calling external APIs, static export is simpler and recommended |
| React 18 Client Components | React 19.2 with useEffectEvent | Next.js 16 | New hooks available but not required for dashboard patterns |

**Deprecated/outdated:**
- `middleware.ts`: Renamed to `proxy.ts` in Next.js 16. Old name still works but is deprecated.
- `tailwind.config.js`: Tailwind v4 uses CSS-based configuration. JS config is legacy.
- `@cloudflare/next-on-pages`: Deprecated in favor of `@opennextjs/cloudflare`.
- Pages Router: App Router is the default and recommended approach.

## Gateway Changes Required

Phase 6 requires modifications to the gateway (not just a new dashboard app):

### 1. D1 Database Binding
Add a `USAGE_DB` D1 binding to wrangler.toml for usage recording.

### 2. Usage Recording Middleware
Add non-blocking usage recording in the `/v1/*` dispatch path via `waitUntil`.

### 3. Internal Routes
New `/internal/*` route group with admin auth:
- `GET /internal/overview` -- summary for dashboard landing page
- `GET /internal/usage` -- usage stats with key/connector/window filters

### 4. CORS Configuration
Verify the existing `cors()` middleware handles the dashboard origin correctly. May need to configure specific origins for production.

## Deployment Strategy

### Development
- Dashboard: `pnpm dev` (Next.js dev server at localhost:3000)
- Gateway: `pnpm dev` (Wrangler dev at localhost:8787)
- CORS handled by gateway's default `cors()` (allows all origins)

### Production
- Dashboard: `next build` produces `out/` directory (static HTML/CSS/JS)
- Deploy `out/` to Cloudflare Pages (or any static hosting)
- Gateway URL configured via `NEXT_PUBLIC_GATEWAY_URL` env var at build time
- Cloudflare Pages integrates with the monorepo via build command pointing to `apps/dashboard`

### Turborepo Integration
Add `apps/dashboard` to the workspace. Turbo tasks (build, dev, typecheck) automatically include it. The dashboard depends on `@feelr/tsconfig` for shared TypeScript config but has no runtime dependency on other workspace packages (it communicates with the gateway via HTTP, not imports).

## Open Questions

1. **Usage data bootstrapping**
   - What we know: Phase 7 plans more sophisticated metering. Phase 6 needs basic usage data.
   - What's unclear: Should Phase 6's D1 usage table be the same one Phase 7 extends, or a separate implementation?
   - Recommendation: Build the simplest table that satisfies Phase 6's needs. Phase 7 can extend the schema (add columns, create materialized aggregations) or migrate to Analytics Engine. The D1 table is the foundation either way.

2. **Dashboard URL for production**
   - What we know: DASH-01 says "Web dashboard at feelr.dev". The gateway is at api.feelr.dev.
   - What's unclear: Will feelr.dev serve the dashboard? Or a subdomain like dash.feelr.dev?
   - Recommendation: Use `dash.feelr.dev` or `app.feelr.dev` to keep the root domain free for a marketing/docs site (Phase 10). Configure during deployment, not in code.

3. **Admin token scope for dashboard vs CLI**
   - What we know: Both CLI and dashboard use the same ADMIN_TOKEN with the same `/admin/*` routes.
   - What's unclear: Should the dashboard eventually have its own scoped token?
   - Recommendation: Use the same ADMIN_TOKEN for Phase 6. It is already generated by `feelr init` and used by the CLI. Adding scoped tokens is a Phase 7+ concern.

## Sources

### Primary (HIGH confidence)
- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16) -- features, React 19.2, Turbopack, proxy.ts
- [Next.js SPA Guide](https://nextjs.org/docs/app/guides/single-page-applications) -- static export, client-side fetching
- [Next.js Proxy Docs](https://nextjs.org/docs/app/getting-started/proxy) -- proxy.ts limitations (NOT for API proxying)
- [shadcn/ui Next.js Installation](https://ui.shadcn.com/docs/installation/next) -- CLI setup, component installation
- [OpenNext Cloudflare Docs](https://opennext.js.org/cloudflare) -- SSR on Workers (not used, but documented for reference)
- Codebase: `apps/gateway/src/` -- existing route structure, admin auth, response envelope

### Secondary (MEDIUM confidence)
- [Cloudflare Workers Next.js Guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) -- deployment options
- [Recharts documentation](https://recharts.org/) -- chart API, Next.js compatibility
- [SWR documentation](https://swr.vercel.app/) -- data fetching patterns
- Multiple shadcn/ui dashboard starters on GitHub -- confirms pattern viability

### Tertiary (LOW confidence)
- WebSearch results on token storage security -- consensus on localStorage being acceptable for admin tokens, but httpOnly cookies preferred for user-facing auth

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Next.js 16 + shadcn/ui + Tailwind v4 is the dominant developer dashboard stack in 2026, verified via official docs
- Architecture: HIGH -- Static export SPA pattern verified via Next.js official SPA guide; gateway route patterns verified from existing codebase
- Pitfalls: MEDIUM -- Usage data gap is a real concern identified from roadmap analysis; CORS and route naming identified from codebase inspection; static export limitations from official docs
- Claude's Discretion recommendations: MEDIUM -- Based on developer dashboard conventions and project context, but are opinion-based

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days -- stable stack, no fast-moving dependencies)
