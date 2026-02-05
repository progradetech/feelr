# Architecture Patterns

**Domain:** Agent-friendly API simplification layer (multi-runtime: edge gateway, connector runtime, CLI binary, web dashboard)
**Researched:** 2026-02-05
**Confidence:** MEDIUM-HIGH (verified with official Cloudflare docs, Hono docs, and established architectural patterns)

---

## Recommended Architecture

Feelr is a multi-runtime system with four distinct deployment targets that share code through a monorepo. The architecture follows a **hub-and-spoke model** where the Edge Gateway is the central hub, connectors are spokes, and the CLI and Dashboard are clients that communicate exclusively through the gateway.

```
                        +------------------+
                        |   Dashboard      |
                        |   (Next.js)      |
                        +--------+---------+
                                 |
                                 | HTTPS
                                 v
+-------------+          +------+----------+          +------------------+
|  Go CLI     +--------->+  Edge Gateway   +--------->+  Upstream APIs   |
|  (binary)   |  HTTPS   |  (CF Workers +  |  HTTPS   |  (GitHub, Slack, |
+-------------+          |   Hono)         |          |   Stripe, etc.)  |
                         +------+----------+          +------------------+
                                |
                    +-----------+-----------+
                    |           |           |
              +-----+   +------+    +------+---+
              | KV   |  | D1   |   | Durable   |
              | Auth |  | Meta |   | Objects   |
              | Vault|  | data |   | (Rate     |
              +------+  +------+   | Limiting) |
                                   +----------+
```

### High-Level Architecture Summary

The system comprises six logical components across four runtimes. The Edge Gateway (Cloudflare Workers + Hono) is the single entry point for all traffic. Connectors are TypeScript modules loaded within the Worker runtime, not separate services. The Go CLI is a thin HTTP client that formats output for agents. The Next.js Dashboard is a web client that also talks to the Edge Gateway API. State is distributed across Cloudflare KV (auth tokens), D1 (metadata, usage), and optionally Durable Objects (rate limiting). For self-hosting, the entire Worker stack runs on `workerd` (Cloudflare's open-source runtime) with SQLite replacing D1 and local KV storage.

---

## Component Boundaries

| Component | Responsibility | Communicates With | Runtime | Deployment |
|-----------|---------------|-------------------|---------|------------|
| **Edge Gateway** | Request routing, API key validation, rate limiting, usage metering, response envelope | CLI, Dashboard, Auth Vault, Connector Registry, D1 | Cloudflare Workers | `wrangler deploy` |
| **Connector Registry** | Hosts all connector modules, action dispatch, request mapping | Edge Gateway (in-process), Upstream APIs (HTTP) | Same Worker process | Bundled with gateway |
| **Transform Layer** | Response flattening, error normalization, pagination handling | Connector Registry (in-process pipeline) | Same Worker process | Bundled with gateway |
| **Auth Vault** | Stores encrypted user API tokens, handles token refresh, OAuth state | Edge Gateway via KV binding | Cloudflare KV + Worker code | KV namespace |
| **CLI Tool** | User-facing command interface, output formatting, local config | Edge Gateway (HTTPS) | Go binary | GitHub Releases / Homebrew |
| **Dashboard** | Key management, connector setup, usage visualization, OAuth callback UI | Edge Gateway API (HTTPS), OAuth providers | Next.js on Vercel | Vercel deploy |
| **Composable Actions Engine** | Chain definitions, step execution, data passing between steps, conditional logic | Connector Registry (in-process) | Same Worker process | Bundled with gateway |

### Critical Boundary: Connectors Are NOT Microservices

**Confidence: HIGH** (architectural decision, verified against Cloudflare Workers constraints)

Connectors run **in-process** within the Worker, not as separate services. This is a deliberate architectural choice:

- Cloudflare Workers have a 128MB memory limit and 30s CPU time limit (paid plan). Connectors must be lightweight modules, not separate processes.
- Inter-service communication on Workers would require Service Bindings or external HTTP calls, adding latency and complexity unnecessarily.
- Each connector is a TypeScript module with a standard interface. The gateway imports and dispatches to them directly.

This means the Edge Gateway + Connector Registry + Transform Layer are a **single deployable unit** (one Worker). This simplifies deployment but means all connectors ship together. A connector update redeploys the whole gateway.

---

## Data Flow

### Primary Request Flow (Agent Calling an API)

```
1. Agent invokes CLI:
   $ feelr run github issues.list --repo owner/repo --state open

2. CLI resolves to HTTP request:
   GET https://api.feelr.dev/v1/github/issues.list?repo=owner/repo&state=open
   Headers: X-Feelr-Key: fk_abc123

3. Edge Gateway receives request:
   a. Parse route → connector: "github", action: "issues.list"
   b. Validate API key (fk_abc123) → look up user_id in D1 or KV
   c. Check rate limit → Durable Object or KV-based counter
   d. Fetch user's GitHub token from Auth Vault (KV)
      - Decrypt token using application-level AES-256-GCM via Web Crypto API
      - If OAuth token expired, attempt refresh

4. Dispatch to Connector:
   a. Connector Registry looks up "github" connector
   b. Action "issues.list" maps to connector's handler
   c. Request Mapper transforms flat args → GitHub API params
      { repo: "owner/repo", state: "open" } → GET /repos/owner/repo/issues?state=open
   d. Auth Adapter injects Authorization header with decrypted token
   e. Connector makes HTTP call to api.github.com
   f. Handles pagination if needed (auto-fetch up to N pages)

5. Transform Layer processes response:
   a. Response Flattener: nested JSON → flat key-value pairs
   b. Error Normalizer: GitHub 404 → Feelr standard error format
   c. Strip unnecessary metadata (rate limit headers, etc.)

6. Edge Gateway wraps response:
   {
     "ok": true,
     "data": [...],
     "meta": { "count": 12, "connector": "github", "action": "issues.list" }
   }

7. CLI formats output:
   - JSON mode (default for agents): raw JSON
   - Table mode: formatted table
   - Minimal mode: just data array
```

### Auth Setup Flow

```
1. User runs: $ feelr auth github

2. CLI opens browser to: https://feelr.dev/auth/github/connect?session=xyz

3. Dashboard handles OAuth flow:
   a. User authorizes Feelr's GitHub App
   b. GitHub redirects to callback with auth code
   c. Dashboard exchanges code for access_token + refresh_token
   d. Dashboard sends tokens to Edge Gateway API:
      POST /v1/internal/auth/store
      { connector: "github", access_token: "...", refresh_token: "..." }

4. Edge Gateway encrypts and stores in KV:
   Key: auth:{user_id}:github
   Value: AES-256-GCM encrypted JSON { access_token, refresh_token, expires_at }

5. CLI polls for completion:
   GET /v1/internal/auth/status?session=xyz
   → { "ok": true, "connector": "github", "status": "connected" }

6. CLI confirms: "GitHub connected. Run 'feelr tools github' to see available actions."
```

### Composable Actions Flow

```
1. Agent runs: $ feelr run chain deploy-notify --repo owner/repo --channel general

2. Gateway loads chain definition:
   {
     "name": "deploy-notify",
     "steps": [
       { "connector": "github", "action": "repos.latest-release", "args": { "repo": "{{repo}}" } },
       { "connector": "slack", "action": "message.send",
         "args": { "channel": "{{channel}}", "text": "Deployed {{steps.0.data.tag_name}}" } }
     ]
   }

3. Engine executes steps sequentially:
   Step 0: Call github.repos.latest-release → { tag_name: "v1.2.3" }
   Step 1: Call slack.message.send with interpolated data → { ok: true }

4. Return aggregated response:
   { "ok": true, "steps": [{ ... }, { ... }], "meta": { "chain": "deploy-notify" } }
```

---

## Where State Lives

| State Type | Storage | Why | Consistency Needs |
|------------|---------|-----|-------------------|
| **User API tokens** (encrypted) | Cloudflare KV | High read, low write. Tokens change rarely (OAuth refresh). KV's AES-256 at-rest encryption + application-level AES-256-GCM. Eventually consistent is fine -- tokens are per-user. | Eventually consistent (OK) |
| **API keys** (fk_xxx → user_id mapping) | Cloudflare KV | High read, very low write. Created once, read on every request. KV caching gives sub-1ms reads for hot keys. | Eventually consistent (OK -- new keys may take seconds to propagate) |
| **User accounts + metadata** | Cloudflare D1 | Relational data: users, teams, connector configs, chain definitions. D1's 10GB limit is fine for metadata. Strongly consistent. | Strongly consistent |
| **Usage metrics** | Cloudflare D1 or Analytics Engine | Per-user call counts, per-connector usage. Analytics Engine is purpose-built for time-series metrics. D1 works for simple counters. | Eventually consistent (OK for metrics) |
| **Rate limiting counters** | Durable Objects (recommended) or KV with TTL | Rate limiting needs precise per-key counting. Durable Objects give strict serializability. KV with TTL is simpler but only eventually consistent (could allow brief overages). | Strictly serializable (Durable Objects) or best-effort (KV) |
| **Chain definitions** (composable actions) | D1 (user-defined) + bundled JSON (pre-built) | User-defined chains need CRUD. Pre-built chains ship with the codebase. | Strongly consistent for user chains |
| **OAuth state** (CSRF tokens, pending flows) | KV with TTL | Short-lived state during OAuth flows. TTL auto-expires. | Eventually consistent (OK -- single-user flow) |
| **CLI local config** | Filesystem (`~/.config/feelr/`) | Feelr API key, preferred output format, default endpoint URL. XDG base directory spec on Linux, `~/Library/Application Support/` on macOS. | Local only |

### Self-Hosting State Mapping

| Cloud State | Self-Hosted Equivalent | Notes |
|-------------|----------------------|-------|
| Cloudflare KV | workerd local KV (disk-backed) | Same API surface via workerd |
| Cloudflare D1 | SQLite (via workerd or direct) | D1 is SQLite-based anyway |
| Durable Objects | workerd Durable Objects (single-machine) | Limited to single machine, no geo-distribution |
| Analytics Engine | SQLite table or Prometheus metrics | Simpler, no distributed analytics needed |
| Vercel (Dashboard) | Node.js server or Docker container | Next.js runs standalone with `next start` |

---

## Monorepo Structure (Recommended)

**Confidence: MEDIUM-HIGH** (pattern verified across multiple Turborepo + pnpm workspace + Cloudflare Workers projects)

Use **pnpm workspaces + Turborepo** for monorepo orchestration. This is the most widely adopted pattern for multi-runtime TypeScript projects that include Cloudflare Workers.

```
feelr/
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # Workspace definitions
├── turbo.json                # Turborepo pipeline config
│
├── apps/
│   ├── gateway/              # Cloudflare Workers + Hono (Edge Gateway)
│   │   ├── src/
│   │   │   ├── index.ts      # Hono app entry point
│   │   │   ├── routes/       # Route handlers per domain
│   │   │   │   ├── v1.ts     # /v1/* routes
│   │   │   │   └── internal.ts # /internal/* routes (dashboard API)
│   │   │   ├── middleware/    # Auth, rate limiting, metering
│   │   │   │   ├── auth.ts
│   │   │   │   ├── rate-limit.ts
│   │   │   │   └── meter.ts
│   │   │   ├── connectors/   # Connector dispatch & registry
│   │   │   │   └── registry.ts
│   │   │   ├── transform/    # Response flattening, error normalization
│   │   │   │   ├── flatten.ts
│   │   │   │   ├── errors.ts
│   │   │   │   └── paginate.ts
│   │   │   ├── vault/        # Auth token encryption/decryption
│   │   │   │   └── crypto.ts
│   │   │   └── chains/       # Composable actions engine
│   │   │       └── engine.ts
│   │   ├── wrangler.toml     # Workers config
│   │   └── package.json
│   │
│   ├── dashboard/            # Next.js dashboard
│   │   ├── src/
│   │   │   ├── app/          # App router pages
│   │   │   ├── components/
│   │   │   └── lib/
│   │   ├── next.config.js
│   │   └── package.json
│   │
│   └── docs/                 # Documentation site (future)
│       └── package.json
│
├── cli/                      # Go CLI (outside pnpm workspace)
│   ├── cmd/                  # Cobra commands
│   │   ├── root.go
│   │   ├── run.go
│   │   ├── tools.go
│   │   ├── auth.go
│   │   └── status.go
│   ├── internal/             # Internal packages
│   │   ├── client/           # HTTP client for gateway API
│   │   ├── config/           # Local config management
│   │   ├── output/           # JSON/table/minimal formatters
│   │   └── version/
│   ├── go.mod
│   ├── go.sum
│   └── Makefile
│
├── connectors/               # Individual connector packages
│   ├── github/
│   │   ├── src/
│   │   │   ├── index.ts      # Connector entry: exports actions
│   │   │   ├── actions/      # One file per action
│   │   │   │   ├── issues-list.ts
│   │   │   │   ├── issues-create.ts
│   │   │   │   ├── pr-list.ts
│   │   │   │   └── repos-list.ts
│   │   │   ├── auth.ts       # Auth adapter (OAuth/PAT)
│   │   │   ├── mapper.ts     # Request mapping
│   │   │   ├── flatten.ts    # Response flattening rules
│   │   │   └── docs.ts       # Agent-optimized descriptions
│   │   ├── tests/
│   │   └── package.json
│   ├── slack/
│   ├── stripe/
│   ├── discord/
│   └── _template/            # Connector template for contributors
│       └── ...
│
├── packages/                 # Shared TypeScript packages
│   ├── connector-sdk/        # Connector interface & utilities
│   │   ├── src/
│   │   │   ├── types.ts      # ConnectorDefinition, Action, etc.
│   │   │   ├── base.ts       # Base connector class
│   │   │   ├── flatten.ts    # Shared flattening utilities
│   │   │   ├── errors.ts     # Standard error types
│   │   │   └── docs.ts       # Doc generation helpers
│   │   └── package.json
│   │
│   ├── shared-types/         # Types shared across gateway + dashboard
│   │   ├── src/
│   │   │   ├── api.ts        # API request/response types
│   │   │   ├── auth.ts       # Auth-related types
│   │   │   └── user.ts       # User/team types
│   │   └── package.json
│   │
│   └── tsconfig/             # Shared TypeScript configs
│       ├── base.json
│       ├── worker.json
│       └── nextjs.json
│
├── docker/                   # Self-hosting Docker configs
│   ├── Dockerfile.gateway    # workerd-based gateway
│   ├── Dockerfile.dashboard  # Next.js standalone
│   └── docker-compose.yml    # Full self-hosted stack
│
└── .github/
    └── workflows/
        ├── gateway.yml       # Deploy Workers on push to main
        ├── dashboard.yml     # Deploy dashboard to Vercel
        ├── cli-release.yml   # Build + release Go binaries
        └── connectors.yml    # Test connectors on PR
```

### Why This Structure

| Decision | Rationale |
|----------|-----------|
| **Go CLI outside pnpm workspace** | Go has its own module system. Including it in the pnpm workspace would be confusing. It lives as a sibling directory with its own build tooling. |
| **Connectors as separate packages** | Each connector is independently testable and versioned. Community contributors work in isolated packages. The gateway bundles them at build time. |
| **Connector SDK as shared package** | Defines the interface all connectors must implement. Versioning the SDK independently allows backward-compatible evolution. |
| **shared-types package** | Types shared between gateway and dashboard (API response shapes, auth types). Exported as raw TypeScript source -- each consumer transpiles for its own runtime. |
| **docker/ directory** | Self-hosting is a first-class concern. Docker Compose makes it approachable. |

---

## Patterns to Follow

### Pattern 1: Connector Interface Contract

**What:** Every connector exports a standardized interface. The gateway never reaches into connector internals.
**When:** Always. This is the core extensibility pattern.
**Confidence:** HIGH (standard adapter/plugin pattern, verified for TypeScript)

```typescript
// packages/connector-sdk/src/types.ts

export interface ConnectorDefinition {
  name: string;          // "github"
  displayName: string;   // "GitHub"
  version: string;       // "1.0.0"
  authType: "oauth2" | "api_key" | "bearer_token";
  actions: Record<string, ActionDefinition>;
  docs: ConnectorDocs;
}

export interface ActionDefinition {
  name: string;          // "issues.list"
  description: string;   // ~50 tokens for agent consumption
  params: ParamDefinition[];
  handler: (ctx: ActionContext) => Promise<ActionResult>;
}

export interface ActionContext {
  params: Record<string, string>;
  userToken: string;     // Decrypted upstream API token
  fetch: typeof fetch;   // Workers-compatible fetch
}

export interface ActionResult {
  data: Record<string, unknown>[] | Record<string, unknown>;
  meta?: { count?: number; hasMore?: boolean; cursor?: string };
}

export interface ParamDefinition {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  description: string;   // Short, for agent consumption
  default?: string;
}
```

### Pattern 2: Middleware Pipeline (Hono)

**What:** Use Hono's middleware chain for cross-cutting concerns. Each middleware does one thing.
**When:** All request processing in the gateway.
**Confidence:** HIGH (verified via Hono official docs)

```typescript
// apps/gateway/src/index.ts

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { meterMiddleware } from "./middleware/meter";
import { v1Routes } from "./routes/v1";
import { internalRoutes } from "./routes/internal";

type Bindings = {
  AUTH_KV: KVNamespace;
  META_DB: D1Database;
  ENCRYPTION_KEY: string;
  RATE_LIMITER: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware (order matters)
app.use("*", cors());
app.use("*", logger());

// API routes with auth + rate limiting
app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.use("/v1/*", meterMiddleware);
app.route("/v1", v1Routes);

// Internal routes (dashboard API, auth callbacks)
app.route("/internal", internalRoutes);

export default app;
```

### Pattern 3: Response Envelope

**What:** Every response follows the same envelope. Agents can parse any Feelr response with identical logic.
**When:** All API responses.
**Confidence:** HIGH (standard API design pattern)

```typescript
// Success response
{
  "ok": true,
  "data": [ ... ],       // Always flat objects, never nested
  "meta": {
    "connector": "github",
    "action": "issues.list",
    "count": 12,
    "cursor": "abc123",  // Only present if more pages exist
    "cached": false
  }
}

// Error response
{
  "ok": false,
  "error": {
    "code": "UPSTREAM_AUTH_FAILED",
    "message": "GitHub token expired. Run 'feelr auth github' to reconnect.",
    "connector": "github",
    "upstream_status": 401
  }
}
```

### Pattern 4: Application-Level Encryption for Auth Vault

**What:** Encrypt user tokens with AES-256-GCM via Web Crypto API before storing in KV. KV encrypts at rest too (defense in depth).
**When:** All token storage and retrieval.
**Confidence:** HIGH (verified via Cloudflare Web Crypto docs and KV security docs)

```typescript
// apps/gateway/src/vault/crypto.ts

export async function encryptToken(
  plaintext: string,
  encryptionKey: string
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(encryptionKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Pack salt + iv + ciphertext into single base64 string
  const packed = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...packed));
}
```

### Pattern 5: Connector Action Dispatch

**What:** Route-based dispatch from URL path to connector action.
**When:** All /v1/ requests.
**Confidence:** HIGH

```typescript
// apps/gateway/src/routes/v1.ts

import { Hono } from "hono";
import { connectorRegistry } from "../connectors/registry";

const v1 = new Hono();

// Pattern: /v1/:connector/:action
v1.all("/:connector/:action", async (c) => {
  const connectorName = c.req.param("connector");
  const actionName = c.req.param("action");

  const connector = connectorRegistry.get(connectorName);
  if (!connector) {
    return c.json({ ok: false, error: { code: "UNKNOWN_CONNECTOR" } }, 404);
  }

  const action = connector.actions[actionName];
  if (!action) {
    return c.json({ ok: false, error: { code: "UNKNOWN_ACTION" } }, 404);
  }

  // Params from query string (GET) or body (POST)
  const params = c.req.method === "GET"
    ? Object.fromEntries(new URL(c.req.url).searchParams)
    : await c.req.json();

  // User token was decrypted in auth middleware and placed in context
  const userToken = c.get("userToken");

  const result = await action.handler({
    params,
    userToken,
    fetch: fetch, // Workers fetch
  });

  return c.json({
    ok: true,
    data: result.data,
    meta: { connector: connectorName, action: actionName, ...result.meta },
  });
});

export { v1 as v1Routes };
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Connectors as Separate Workers (Service Bindings)

**What:** Deploying each connector as its own Cloudflare Worker and using Service Bindings to route between them.
**Why bad:** Adds inter-worker latency (even same-zone Service Bindings have overhead). Multiplies deployment complexity. Each Worker has its own limits and billing. For 20+ connectors, this becomes unmanageable.
**Instead:** Bundle all connectors into a single Worker. Use in-process module dispatch. A connector is a TypeScript module, not a service.

### Anti-Pattern 2: Storing Unencrypted Tokens in KV

**What:** Relying solely on KV's at-rest encryption without application-level encryption.
**Why bad:** KV's encryption protects against Cloudflare infrastructure compromise, but anyone with KV read access (e.g., a compromised Worker, a rogue deploy) can read tokens in plaintext. Application-level encryption means the ENCRYPTION_KEY secret must also be compromised.
**Instead:** Always encrypt tokens at the application level before writing to KV. Use the ENCRYPTION_KEY Worker secret for key derivation.

### Anti-Pattern 3: Synchronous Pagination in Request Path

**What:** Fetching ALL pages from an upstream API before returning a response. If GitHub has 50 pages of issues, the Worker fetches all 50 before responding.
**Why bad:** Workers have CPU time limits (30s on paid plan). Large paginated responses can hit limits. Also wastes resources when the agent only needs the first page.
**Instead:** Return one page at a time with a `cursor` in the response. Let the agent/CLI request more pages if needed. Offer an optional `--all` flag that auto-paginates, with a sane maximum (e.g., 10 pages / 1000 items).

### Anti-Pattern 4: Tightly Coupling Dashboard to Gateway Internals

**What:** Having the Dashboard directly access KV, D1, or other Cloudflare bindings.
**Why bad:** Creates two entry points to state, bypassing gateway middleware (auth, metering, rate limiting). Makes self-hosting harder since Dashboard needs Cloudflare-specific bindings.
**Instead:** Dashboard communicates ONLY through the gateway's /internal/* API routes. The gateway is the single source of truth and the single writer to all state stores.

### Anti-Pattern 5: Monolithic Connector Files

**What:** Putting all actions for a connector in a single file (e.g., a 2000-line `github.ts`).
**Why bad:** Hard to review, test, and contribute to. Community contributors need to understand the whole file to add one action.
**Instead:** One file per action. Each action is ~50-100 lines: param validation, request mapping, response flattening. The connector's `index.ts` just re-exports them.

---

## Build Order (Dependency Chain)

The build order is driven by hard dependencies between components. Build what enables the next thing.

### Phase 1: Foundation (Gateway + SDK + First Connector)

**Must build first because everything depends on it.**

1. **Connector SDK types** (`packages/connector-sdk/`) -- defines the interface all connectors implement
2. **Edge Gateway skeleton** (`apps/gateway/`) -- Hono app with route structure, env bindings typed
3. **Auth Vault** (encryption module + KV integration) -- needed before any connector can work
4. **API key validation middleware** -- basic `fk_xxx` key → user lookup
5. **Response envelope** (transform layer) -- standardized response wrapping
6. **GitHub connector** (first connector) -- proves the whole pipeline works end-to-end

**End state:** `curl api.feelr.dev/v1/github/issues.list -H "X-Feelr-Key: fk_test"` returns flat JSON.

### Phase 2: CLI + More Connectors

**Depends on:** Phase 1 (working gateway to call)

7. **Go CLI** (`cli/`) -- `feelr run`, `feelr tools`, `feelr auth`, `feelr status`
8. **Slack connector** -- second connector validates the SDK pattern works for different APIs
9. **Stripe connector** -- third connector validates for non-REST/webhook-heavy APIs
10. **Discord connector** -- fourth connector, community management use case
11. **`feelr tools` discovery** -- gateway endpoint that returns connector/action metadata

**End state:** `feelr run github issues.list --repo x/y` works from terminal.

### Phase 3: Dashboard + Auth Flows

**Depends on:** Phase 1 (gateway API), can partially parallel with Phase 2

12. **Internal API routes** (`/internal/*`) -- dashboard-specific endpoints for key management, user settings
13. **Next.js Dashboard** (`apps/dashboard/`) -- API key management, connector status, usage display
14. **OAuth flows** -- GitHub App OAuth, Slack OAuth, browser-based auth via dashboard
15. **`feelr auth` CLI flow** -- opens browser, polls for completion

**End state:** Full auth setup flow works: CLI opens browser, user connects, CLI confirms.

### Phase 4: Production Hardening

**Depends on:** Phases 1-3 (core features working)

16. **Rate limiting** (Durable Objects or KV-based)
17. **Usage metering** (D1 or Analytics Engine)
18. **Error normalization** (comprehensive mapping from upstream errors)
19. **Agent-optimized descriptions** (~100 token per connector docs)

### Phase 5: Composable Actions + Self-Hosting

**Depends on:** Phase 4 (stable connector system)

20. **Composable Actions engine** -- chain definitions, step execution, data passing
21. **Pre-built chains** -- common workflows shipped as JSON definitions
22. **User-defined chains** -- CRUD for custom chains in D1
23. **Self-hosting package** -- Docker Compose with workerd + SQLite + Next.js standalone

### Phase 6: Billing + Launch

**Depends on:** Phase 4-5 (metering exists, features complete)

24. **Stripe Billing integration** -- metered subscriptions, plan enforcement
25. **Documentation site** -- feelr.dev/docs
26. **Open-source preparation** -- LICENSE, CONTRIBUTING.md, README, connector template

---

## Self-Hosting Architecture

**Confidence: MEDIUM** (workerd is open-source and functional, but self-hosting a full Cloudflare Workers app with KV/D1/Durable Objects locally is an emerging pattern, not a mature one)

### Cloud vs. Self-Hosted

| Component | Cloud (api.feelr.dev) | Self-Hosted |
|-----------|----------------------|-------------|
| Edge Gateway | Cloudflare Workers (global edge) | workerd binary (single machine) |
| KV (Auth Vault) | Cloudflare KV (distributed) | workerd local KV (disk-backed) |
| D1 (Metadata) | Cloudflare D1 (managed SQLite) | SQLite file (direct) |
| Durable Objects | Cloudflare DO (distributed) | workerd DO (single machine) |
| Dashboard | Vercel (managed) | `next start` or Docker |
| DNS/TLS | Cloudflare (automatic) | User-provided (nginx/caddy reverse proxy) |
| Billing | Stripe (enabled) | Disabled (toggle off) |

### Self-Hosting Docker Compose

```yaml
# docker/docker-compose.yml
version: "3.8"

services:
  gateway:
    build:
      context: ..
      dockerfile: docker/Dockerfile.gateway
    ports:
      - "8787:8787"
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - ENVIRONMENT=self-hosted
    volumes:
      - gateway-data:/data  # KV + D1 persistence

  dashboard:
    build:
      context: ..
      dockerfile: docker/Dockerfile.dashboard
    ports:
      - "3000:3000"
    environment:
      - GATEWAY_URL=http://gateway:8787
      - NEXTAUTH_URL=http://localhost:3000
      - BILLING_ENABLED=false

volumes:
  gateway-data:
```

### Self-Hosting Architectural Differences

1. **No global edge distribution** -- all requests hit one machine. Latency depends on user proximity to the server.
2. **No distributed KV** -- eventually-consistent model is moot; it is just local disk.
3. **Durable Objects are single-machine** -- rate limiting works but cannot scale horizontally.
4. **Billing is toggled off** -- no Stripe integration, no metering enforcement (but usage tracking can still work for the user's own analytics).
5. **User manages TLS** -- need a reverse proxy (nginx, caddy) for HTTPS.

### Code Abstraction for Dual Deployment

To support both cloud and self-hosted, abstract storage behind interfaces:

```typescript
// packages/connector-sdk/src/storage.ts

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}
```

In cloud mode, these wrap KV/D1 bindings. In self-hosted mode, they wrap workerd's local equivalents (which have the same API surface, so the abstraction may be thin). The key point: **connector code and gateway logic never import Cloudflare-specific APIs directly**. They go through the adapter.

**Caveat:** workerd provides the same API surface as Workers (KV namespace, D1 database), so in practice the "abstraction" may just be passing through the binding. The value is in making the boundary explicit for when someone wants to run on a non-workerd runtime (e.g., plain Node.js with SQLite).

---

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| **Request throughput** | Single Worker handles easily. CF free tier: 100K req/day. | Paid plan: 10M req/month ($5). Workers auto-scale globally. | Workers scale horizontally on CF edge. No changes needed. |
| **Auth Vault reads** | KV cache hits for repeated reads. Sub-ms latency. | Same -- KV caching is per-location. Hot keys are fast everywhere. | Same -- KV is designed for this pattern. |
| **D1 metadata queries** | Minimal load. Single query per key validation. | Read replicas help. May need to cache user→plan mappings in KV. | Consider migrating hot paths off D1 to KV. D1 has 10GB limit. |
| **Rate limiting** | KV-based is fine for 100 users. | Durable Objects recommended for accurate counting. | DO per-user rate limiting scales with user count (each user = 1 DO). |
| **CLI distribution** | GitHub Releases. | Homebrew tap, apt repo, Go install. | Same + CDN for binary downloads. |
| **Connector count** | 4-5 connectors, small bundle. | 20+ connectors, bundle size matters. Consider lazy loading. | 50+ connectors -- may need to split into connector "packs" or use dynamic imports. |
| **Composable actions** | Simple sequential execution. | Add timeout per step. Consider max chain length. | May need async execution for long chains (Queues). |

---

## Key Architectural Decisions Summary

| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| **Monorepo tool** | pnpm + Turborepo | Industry standard for multi-runtime TS projects. Proven with CF Workers + Next.js. | nx (heavier, more features than needed), Lerna (legacy) |
| **Gateway framework** | Hono on CF Workers | Lightweight, Web Standards based, first-class CF Workers support, rich middleware ecosystem. | itty-router (too minimal), Express-style (not edge-compatible) |
| **Connector architecture** | In-process modules, not microservices | Avoids inter-service latency, simplifies deployment, fits Worker constraints. | Service Bindings (too much overhead for this use case) |
| **Auth token storage** | KV with app-level AES-256-GCM encryption | KV's read-heavy pattern fits token access. Double encryption (KV at-rest + app-level). | D1 (overkill for key-value token storage), Durable Objects (unnecessary consistency for per-user tokens) |
| **Metadata storage** | D1 | Relational queries needed for users, teams, chains. Managed. Free tier generous. | Neon Postgres via Hyperdrive (more powerful but external dependency), KV (not relational) |
| **Rate limiting** | Durable Objects (phase 4+), KV with TTL (MVP) | DO gives accuracy. KV gives simplicity for MVP. | External service like Upstash (adds latency, external dependency) |
| **CLI language** | Go with Cobra | Single binary, no runtime, fast startup, Cobra is the standard CLI framework (powers gh, kubectl, docker). | Rust (slower dev velocity), Node (requires runtime) |
| **Self-hosting runtime** | workerd (CF open-source runtime) | Same API surface as production Workers. Bug-for-bug compatible. | Plain Node.js (would need shims for KV/D1/DO APIs), Docker + miniflare (deprecated in favor of workerd) |
| **Dashboard deployment** | Next.js on Vercel (cloud), standalone (self-hosted) | Next.js App Router for dashboard UI. Vercel for zero-config deploys. `next start` for self-hosted. | Remix (fine alternative), SvelteKit (smaller community) |

---

## Sources

- [Cloudflare Workers Storage Options](https://developers.cloudflare.com/workers/platform/storage-options/) -- HIGH confidence, official docs
- [Cloudflare KV Data Security](https://developers.cloudflare.com/kv/reference/data-security/) -- HIGH confidence, official docs
- [Cloudflare Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) -- HIGH confidence, official docs
- [Hono Getting Started with Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers) -- HIGH confidence, official docs
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) -- HIGH confidence, official docs
- [workerd GitHub Repository](https://github.com/cloudflare/workerd) -- HIGH confidence, official source
- [TypeScript Monorepo Setup: Sharing Types Between Workers and Next.js](https://www.outstand.so/blog/typescript-monorepo-setup) -- MEDIUM confidence, verified pattern
- [Cloudflare Monorepo Advanced Setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/) -- HIGH confidence, official docs
- [Cobra CLI Framework](https://github.com/spf13/cobra) -- HIGH confidence, official source
- [API Gateway Architecture Deep Dive](https://api7.ai/learning-center/api-gateway-guide/api-gateway-architecture) -- MEDIUM confidence, industry reference
- [Designing an Effective API Orchestration Layer](https://api7.ai/blog/designing-an-effective-api-orchestration-layer) -- MEDIUM confidence, industry reference
- [Encrypt Workers KV](https://github.com/bradyjoslin/encrypt-workers-kv) -- MEDIUM confidence, community reference implementation
- [Adapter Pattern in TypeScript](https://refactoring.guru/design-patterns/adapter/typescript/example) -- HIGH confidence, canonical reference
- [Plugin System in TypeScript](https://dev.to/hexshift/designing-a-plugin-system-in-typescript-for-modular-web-applications-4db5) -- LOW confidence, single community source
