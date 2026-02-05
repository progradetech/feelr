# Phase 1: Edge Gateway Foundation - Research

**Researched:** 2026-02-05
**Domain:** Cloudflare Workers + Hono API Gateway, Connector SDK Design, Response Envelope Architecture
**Confidence:** HIGH

## Summary

Phase 1 builds the foundational edge gateway: a Cloudflare Workers + Hono application that routes requests to connector modules and returns normalized responses through a consistent envelope. This research covers the exact Hono APIs, routing patterns, middleware architecture, response envelope design, error format, Connector SDK interface types, and monorepo setup needed to plan this phase.

The standard approach is: initialize a pnpm + Turborepo monorepo with a `packages/connector-sdk` shared package and an `apps/gateway` Cloudflare Workers application. Use `OpenAPIHono` (from `@hono/zod-openapi`) as the base framework for automatic schema validation and documentation. Define the Connector SDK as TypeScript interfaces using only Web Standard APIs. Implement a mock connector for end-to-end testing of the full request/response pipeline.

**Primary recommendation:** Build the gateway skeleton, response envelope, error format, and Connector SDK types first. Validate with a mock "echo" connector before any real connector work. Use `@hono/zod-openapi` from the start -- retrofitting OpenAPI onto plain Hono routes is painful.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Standard envelope: `{ ok, data, error, meta }`
- Actionable hints: Three hints only -- `retry` (transient failure), `auth` (re-authenticate), `abort` (permanent, don't retry)
- Error messages: Feelr-authored primary message + upstream's original message in a `detail` field for context
- HTTP status codes: Feelr normalizes all upstream codes to its own set (400, 401, 403, 404, 429, 500, 502)
- API key location: Accept in both `X-Feelr-Key` header AND `?key=fk_xxx` query param (header preferred, query param for quick testing)
- Field naming: snake_case everywhere, regardless of upstream API conventions
- Raw upstream response: Available behind a `?raw=true` query param for debugging; omitted by default

### Claude's Discretion
- Meta field contents and shape
- Data field shape (always array vs match request)
- Pagination placement
- Error code format (namespaced vs short)
- URL action pattern (dots vs slashes)
- HTTP method strategy (all-POST vs method-matched)
- API versioning approach
- Response flattening depth
- Timestamp format
- Shared base types vs connector-specific shapes

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

---

## Discretionary Recommendations

These are researched recommendations for the areas marked as Claude's Discretion. Each recommendation includes rationale.

### URL Action Pattern: Dot Notation in Path

**Recommendation:** Use dot notation in paths: `/v1/github/issues.list`

**Rationale:**
- Slack's API uses this pattern (`conversations.list`, `chat.postMessage`) and it is the most agent-friendly naming convention -- agents can parse `resource.verb` as a structured action name.
- The CONTEXT.md success criteria explicitly references `curl api.feelr.dev/v1/github/issues.list` as the target developer experience.
- Dot notation in the path is a single route parameter (`:action` captures `issues.list` as one string), making Hono routing simpler than nested slash paths which would need multiple parameters.
- Hono route: `app.all('/v1/:connector/:action', handler)` -- the dot is just part of the `:action` string.

**Confidence:** HIGH (user success criteria already shows this pattern)

### HTTP Method Strategy: All Methods Accepted, Body or Query Params

**Recommendation:** Accept all HTTP methods via `app.all()`, with params from query string (GET) or JSON body (POST/PUT/DELETE).

**Rationale:**
- Feelr is an RPC-style gateway, not a REST resource server. The "action" is in the URL path, not the HTTP method.
- Agents work best with a single consistent calling convention. `POST /v1/github/issues.create` with a JSON body is clearer than relying on `POST /v1/github/issues` where the method determines behavior.
- GET for read actions (with query params) and POST for write actions (with JSON body) is the natural split, but enforcing method correctness adds complexity without benefit for this use case.
- Use `app.all()` for the main dispatch route. Let connectors declare whether they expect query params or body params.

**Confidence:** HIGH

### API Versioning: Path Prefix /v1

**Recommendation:** Use `/v1` path prefix. The version is part of the base path, not a header.

**Rationale:**
- Path-based versioning is the simplest and most discoverable approach.
- Agents see the version in every URL, eliminating ambiguity.
- Hono's `basePath` or `route()` makes this trivial: `app.route('/v1', v1Router)`.
- Breaking changes create `/v2` with a new router. Non-breaking changes stay in `/v1`.

**Confidence:** HIGH

### Meta Field Contents

**Recommendation:** Meta contains: `request_id`, `connector`, `action`, `duration_ms`, and pagination fields when applicable.

```json
{
  "ok": true,
  "data": [...],
  "meta": {
    "request_id": "req_abc123",
    "connector": "github",
    "action": "issues.list",
    "duration_ms": 142,
    "cursor": "eyJwYWdlIjozfQ==",
    "has_more": true
  }
}
```

**Rationale:**
- `request_id`: Essential for debugging and support. Agents can include it in error reports.
- `connector` + `action`: Confirms what was dispatched, useful for agent logging and chain debugging.
- `duration_ms`: Agents and dashboards use this for performance monitoring.
- `cursor` + `has_more`: Cursor-based pagination is the most agent-friendly pattern. Agents check `has_more` and pass `cursor` to the next request.
- Keeping meta flat and small. Not including `total_count` because most upstream APIs do not provide it reliably and fetching it adds latency.

**Confidence:** HIGH

### Data Field Shape: Match Request Semantics

**Recommendation:** `data` is an array for list actions, an object for single-resource actions.

**Rationale:**
- `issues.list` returns `"data": [...]` (array of issues).
- `issues.get` returns `"data": { ... }` (single issue object).
- Always-array forces agents to index into `data[0]` for single-resource responses, which is awkward and error-prone.
- The action definition in the Connector SDK declares whether it returns a list or a single item. The gateway respects this.

**Confidence:** HIGH

### Pagination Placement: Inside Meta

**Recommendation:** Pagination fields (`cursor`, `has_more`) live inside `meta`, not as top-level siblings.

**Rationale:**
- Keeps the top-level envelope clean: `ok`, `data`, `error`, `meta` -- four fields, always.
- `meta` is the right semantic home for request metadata and pagination state.
- Agents parse `meta.has_more` and `meta.cursor` consistently.
- Request sends cursor via query param: `?cursor=eyJwYWdlIjozfQ==`.

**Confidence:** HIGH

### Error Code Format: Namespaced Strings

**Recommendation:** Use `SCREAMING_SNAKE_CASE` namespaced error codes: `CONNECTOR_NOT_FOUND`, `ACTION_NOT_FOUND`, `UPSTREAM_ERROR`, `VALIDATION_ERROR`, `AUTH_REQUIRED`, `RATE_LIMITED`, `INTERNAL_ERROR`.

```json
{
  "ok": false,
  "error": {
    "code": "UPSTREAM_ERROR",
    "message": "GitHub API returned an error while listing issues.",
    "detail": "Not Found: repository owner/nonexistent does not exist",
    "hint": "abort",
    "status": 404
  }
}
```

**Rationale:**
- Namespaced strings are self-documenting. `UPSTREAM_ERROR` is immediately understandable; a numeric code like `4001` requires a lookup table.
- Agents can pattern-match on code prefixes if needed (all `UPSTREAM_*` codes indicate provider issues).
- The `hint` field (locked decision: `retry`, `auth`, `abort`) tells the agent what to do. The `code` tells it what happened. The `message` is human-readable. The `detail` preserves upstream context.
- `status` is the HTTP status code Feelr will return (from the locked set: 400, 401, 403, 404, 429, 500, 502).

**Confidence:** HIGH

### Timestamp Format: ISO 8601 with UTC

**Recommendation:** All timestamps in responses use ISO 8601 format with explicit UTC timezone: `2026-02-05T14:30:00Z`.

**Rationale:**
- ISO 8601 is the universal standard for machine-readable timestamps.
- UTC (Z suffix) eliminates timezone ambiguity across all connectors.
- Every upstream API's timestamps get normalized to this format regardless of their native format.
- Agents can parse this with any language's standard library.

**Confidence:** HIGH

### Response Flattening Depth: One Level, Preserve Structure

**Recommendation:** Flatten one level of nesting. Promote commonly-needed nested fields to the top level. Preserve deeper structures as-is.

**Rationale:**
- Aggressive deep flattening (e.g., `user.profile.avatar_url` becomes `user_profile_avatar_url`) creates absurdly long key names and loses semantic structure.
- No flattening means agents deal with deeply nested provider-specific structures, defeating the purpose.
- One level: pull `issue.user.login` up to `author_login`, pull `issue.labels[].name` to `label_names` (array of strings). Keep the core fields flat and predictable.
- Each connector's flattening rules are defined in its action definition, not globally. The gateway enforces snake_case on all keys.

**Confidence:** MEDIUM (this is inherently connector-specific; the exact flattening rules will evolve with real connector implementation)

### Shared Base Types vs Connector-Specific: Hybrid Approach

**Recommendation:** Define shared base types for the envelope, errors, and pagination. Let connectors define their own resource shapes.

**Rationale:**
- The response envelope (`FeelrResponse<T>`), error shape (`FeelrError`), and pagination (`PaginationMeta`) are universal -- they belong in the Connector SDK package.
- Resource shapes (what a GitHub issue looks like vs a Slack message) are inherently connector-specific. Forcing them into shared types creates either overly generic types or a huge shared-types package that changes with every connector.
- The Connector SDK defines the contract (envelope, error, meta). Connectors define the content (data shapes).

**Confidence:** HIGH

---

## Standard Stack

The libraries and tools for Phase 1 specifically (subset of the full project stack).

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.11.7 | Edge API framework | Cloudflare's recommended framework. Sub-12kB. Built-in middleware for CORS, logging. |
| @hono/zod-openapi | ^1.2.0 | OpenAPI route definitions | Type-safe route validation + automatic OpenAPI doc generation. Critical for agent discoverability. |
| @hono/zod-validator | ^0.7.6 | Request validation middleware | Integrates Zod validation into Hono's middleware chain. |
| Zod | ^4.3.5 | Schema validation | TypeScript-first validation. Zod 4 is stable. Use `zod` package directly (v4 is default export). |
| wrangler | ^4.61.1 | Workers CLI & dev server | Deploy, dev, manage secrets. `wrangler dev` for local development. |
| TypeScript | ^5.7 | Type system | Required for type-safe Connector SDK and Hono generics. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @cloudflare/vitest-pool-workers | ^0.9.2 | Workers test environment | Integration tests that need Workers runtime (KV, env bindings). |
| vitest | ~3.2.0 | Test runner | Must pin to 3.2.x for compatibility with pool-workers. |
| pnpm | ^9.x | Package manager | Monorepo workspace management. |
| turborepo | latest | Build orchestration | Task caching, parallel builds, dependency-aware task execution. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @hono/zod-openapi | Plain Hono + zod-validator | Lose automatic OpenAPI doc generation. Retrofitting is painful. |
| Zod 4 | Zod 3 | Zod 3 is still supported via `zod/v3` import, but no reason to use it for a greenfield project. |
| OpenAPIHono | chanfana (Cloudflare's OpenAPI lib) | chanfana is Cloudflare-specific. @hono/zod-openapi is more portable and better documented. |

**Installation (Phase 1 only):**
```bash
# Gateway
pnpm add hono@^4.11.7 @hono/zod-openapi@^1.2.0 @hono/zod-validator@^0.7.6 zod@^4.3.5

# Dev dependencies
pnpm add -D wrangler@^4.61.1 typescript@^5.7 vitest@~3.2.0 @cloudflare/vitest-pool-workers@^0.9.2
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 Scope)

```
feelr/
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml             # Workspace definitions
├── turbo.json                      # Turborepo pipeline config
├── tsconfig.base.json              # Shared TS config base
│
├── apps/
│   └── gateway/                    # Cloudflare Workers + Hono
│       ├── src/
│       │   ├── index.ts            # Hono app entry, exports default
│       │   ├── app.ts              # OpenAPIHono app creation + middleware
│       │   ├── routes/
│       │   │   └── v1.ts           # /v1/:connector/:action dispatch
│       │   ├── middleware/
│       │   │   ├── api-key.ts      # X-Feelr-Key / ?key= extraction (stub for Phase 1)
│       │   │   ├── envelope.ts     # Response wrapping middleware
│       │   │   └── error-handler.ts # Global error handler
│       │   ├── connectors/
│       │   │   ├── registry.ts     # Connector lookup by name
│       │   │   └── mock.ts         # Mock connector for testing
│       │   ├── lib/
│       │   │   ├── errors.ts       # FeelrError class, error codes
│       │   │   ├── envelope.ts     # Response envelope helpers
│       │   │   └── types.ts        # Gateway-internal types
│       │   └── __tests__/
│       │       ├── routes.test.ts  # Route dispatch tests
│       │       ├── envelope.test.ts # Response format tests
│       │       └── errors.test.ts  # Error format tests
│       ├── wrangler.toml           # Workers config
│       ├── vitest.config.ts        # Workers pool test config
│       ├── tsconfig.json           # Extends base, Workers target
│       └── package.json
│
├── packages/
│   ├── connector-sdk/              # Connector interface & types
│   │   ├── src/
│   │   │   ├── index.ts            # Public API exports
│   │   │   ├── types.ts            # ConnectorDefinition, ActionDefinition
│   │   │   ├── envelope.ts         # FeelrResponse<T>, FeelrError types
│   │   │   ├── errors.ts           # Error code enum, FeelrError class
│   │   │   └── validation.ts       # Shared Zod schemas for envelope
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── tsconfig/                   # Shared TypeScript configs
│       ├── base.json               # Strict, ES2022, declaration maps
│       ├── worker.json             # Workers-specific (no DOM)
│       └── package.json
│
└── connectors/                     # (Empty in Phase 1, prepared structure)
    └── _template/                  # Connector template
        ├── src/
        │   ├── index.ts            # Exports ConnectorDefinition
        │   └── actions/            # One file per action
        └── package.json
```

### Pattern 1: OpenAPIHono App with Typed Bindings

**What:** Create the Hono app with OpenAPIHono for automatic OpenAPI generation, typed environment bindings, and typed context variables.

**When to use:** Always. This is the app entry point.

```typescript
// apps/gateway/src/app.ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { errorHandler } from './middleware/error-handler'
import { apiKeyMiddleware } from './middleware/api-key'
import { v1Routes } from './routes/v1'

// Type the environment bindings for Cloudflare Workers
type Bindings = {
  // Phase 1: minimal bindings, expanded in later phases
  ENVIRONMENT: string
}

type Variables = {
  // Set by middleware, consumed by handlers
  requestId: string
  apiKey: string | null  // null in Phase 1 (stub)
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}

const app = new OpenAPIHono<AppEnv>()

// Global middleware
app.use('*', cors())
app.use('*', logger())

// Error handler (must be registered before routes)
app.onError(errorHandler)

// API key extraction (stub in Phase 1 -- no validation)
app.use('/v1/*', apiKeyMiddleware)

// Mount v1 routes
app.route('/v1', v1Routes)

// OpenAPI doc endpoint
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Feelr API',
    version: '1.0.0',
    description: 'Agent-friendly API simplification layer',
  },
})

// Health check
app.get('/health', (c) => c.json({ ok: true, version: '1.0.0' }))

// 404 handler
app.notFound((c) => c.json({
  ok: false,
  error: {
    code: 'NOT_FOUND',
    message: 'The requested endpoint does not exist.',
    hint: 'abort',
    status: 404,
  },
}, 404))

export default app
```

```typescript
// apps/gateway/src/index.ts
import app from './app'
export default app
```

**Confidence:** HIGH (verified via Hono official docs and @hono/zod-openapi README)

### Pattern 2: Connector Registry with Type-Safe Dispatch

**What:** A registry that maps connector names to ConnectorDefinition objects. Routes look up connectors and dispatch to action handlers.

**When to use:** The core dispatch mechanism in `/v1/:connector/:action`.

```typescript
// apps/gateway/src/connectors/registry.ts
import type { ConnectorDefinition } from '@feelr/connector-sdk'

const connectors = new Map<string, ConnectorDefinition>()

export function registerConnector(connector: ConnectorDefinition): void {
  connectors.set(connector.name, connector)
}

export function getConnector(name: string): ConnectorDefinition | undefined {
  return connectors.get(name)
}

export function listConnectors(): ConnectorDefinition[] {
  return Array.from(connectors.values())
}
```

```typescript
// apps/gateway/src/routes/v1.ts
import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../app'
import { getConnector } from '../connectors/registry'
import { FeelrError } from '../lib/errors'
import { wrapResponse, wrapError } from '../lib/envelope'

const v1 = new OpenAPIHono<AppEnv>()

// Main dispatch route: /v1/:connector/:action
// Uses app.all to accept any HTTP method (RPC-style)
v1.all('/:connector/:action', async (c) => {
  const connectorName = c.req.param('connector')
  const actionName = c.req.param('action')
  const requestId = c.get('requestId')

  // Look up connector
  const connector = getConnector(connectorName)
  if (!connector) {
    throw new FeelrError('CONNECTOR_NOT_FOUND', {
      message: `Connector "${connectorName}" does not exist.`,
      hint: 'abort',
      status: 404,
    })
  }

  // Look up action
  const action = connector.actions[actionName]
  if (!action) {
    throw new FeelrError('ACTION_NOT_FOUND', {
      message: `Action "${actionName}" does not exist on connector "${connectorName}".`,
      hint: 'abort',
      status: 404,
    })
  }

  // Extract params from query (GET) or body (POST/PUT/DELETE)
  const params = c.req.method === 'GET'
    ? Object.fromEntries(new URL(c.req.url).searchParams)
    : await c.req.json().catch(() => ({}))

  // Remove system params
  const { key, raw, cursor, ...actionParams } = params

  const startTime = Date.now()

  // Execute the action
  const result = await action.handler({
    params: actionParams,
    fetch: fetch,
  })

  const durationMs = Date.now() - startTime

  // Check for ?raw=true
  if (params.raw === 'true' && result.raw) {
    return c.json(result.raw)
  }

  // Wrap in standard envelope
  return c.json(wrapResponse({
    data: result.data,
    meta: {
      request_id: requestId,
      connector: connectorName,
      action: actionName,
      duration_ms: durationMs,
      ...(result.meta?.cursor && { cursor: result.meta.cursor }),
      ...(result.meta?.has_more !== undefined && { has_more: result.meta.has_more }),
    },
  }))
})

export { v1 as v1Routes }
```

**Confidence:** HIGH

### Pattern 3: Global Error Handler with Consistent Envelope

**What:** All errors (thrown, unhandled, validation failures) are caught and returned in the standard error envelope format.

**When to use:** Registered as `app.onError()`.

```typescript
// apps/gateway/src/middleware/error-handler.ts
import type { ErrorHandler } from 'hono'
import type { AppEnv } from '../app'
import { FeelrError } from '../lib/errors'

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  // Known Feelr errors
  if (err instanceof FeelrError) {
    return c.json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        detail: err.detail,
        hint: err.hint,
        status: err.status,
      },
    }, err.status as any)
  }

  // Hono HTTPException
  if (err instanceof Error && 'status' in err) {
    const status = (err as any).status || 500
    return c.json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        hint: 'retry',
        status,
      },
    }, status)
  }

  // Unknown errors
  console.error('Unhandled error:', err)
  return c.json({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      hint: 'retry',
      status: 500,
    },
  }, 500)
}
```

```typescript
// apps/gateway/src/lib/errors.ts
export type ErrorCode =
  | 'CONNECTOR_NOT_FOUND'
  | 'ACTION_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'FORBIDDEN'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'

export type Hint = 'retry' | 'auth' | 'abort'

export class FeelrError extends Error {
  constructor(
    public code: ErrorCode,
    public options: {
      message: string
      hint: Hint
      status: 400 | 401 | 403 | 404 | 429 | 500 | 502
      detail?: string
    }
  ) {
    super(options.message)
    this.name = 'FeelrError'
  }

  get hint(): Hint { return this.options.hint }
  get status(): number { return this.options.status }
  get detail(): string | undefined { return this.options.detail }
}
```

**Confidence:** HIGH

### Pattern 4: Connector SDK Types (Web Standard APIs Only)

**What:** The Connector SDK interface that all connectors implement. Uses only Web Standard APIs.

**When to use:** Every connector package implements these interfaces.

```typescript
// packages/connector-sdk/src/types.ts

/**
 * A connector wraps an upstream API (GitHub, Slack, etc.)
 * and exposes its functionality through standardized actions.
 */
export interface ConnectorDefinition {
  /** Lowercase identifier: "github", "slack" */
  name: string
  /** Display name: "GitHub", "Slack" */
  display_name: string
  /** Connector version */
  version: string
  /** Auth mechanism this connector uses */
  auth_type: 'oauth2' | 'api_key' | 'bearer_token' | 'none'
  /** Map of action name to action definition */
  actions: Record<string, ActionDefinition>
}

/**
 * A single action within a connector (e.g., "issues.list").
 */
export interface ActionDefinition {
  /** Action name using dot notation: "issues.list" */
  name: string
  /** Agent-optimized description, 50-100 tokens */
  description: string
  /** Parameter definitions for this action */
  params: ParamDefinition[]
  /** Whether this action returns a list or single item */
  returns: 'list' | 'single'
  /** Execute the action */
  handler: (ctx: ActionContext) => Promise<ActionResult>
}

/**
 * Context passed to action handlers.
 * Uses only Web Standard APIs -- no Cloudflare-specific bindings.
 */
export interface ActionContext {
  /** Validated parameters from the request */
  params: Record<string, unknown>
  /** Web Standard fetch function */
  fetch: typeof globalThis.fetch
  /** User's upstream API credential (decrypted). Undefined in Phase 1. */
  credential?: string
}

/**
 * Result returned by action handlers.
 */
export interface ActionResult {
  /** The response data -- array for list actions, object for single */
  data: Record<string, unknown>[] | Record<string, unknown>
  /** Optional pagination and metadata */
  meta?: {
    cursor?: string
    has_more?: boolean
    total_count?: number
  }
  /** Raw upstream response for ?raw=true debugging */
  raw?: unknown
}

/**
 * Definition of a single parameter for an action.
 */
export interface ParamDefinition {
  /** Parameter name in snake_case */
  name: string
  /** Parameter type */
  type: 'string' | 'number' | 'boolean'
  /** Whether the parameter is required */
  required: boolean
  /** Short description for agent consumption */
  description: string
  /** Default value if not provided */
  default?: string | number | boolean
}
```

```typescript
// packages/connector-sdk/src/envelope.ts

/**
 * Standard Feelr response envelope.
 * Every response from the gateway follows this shape.
 */
export interface FeelrResponse<T = unknown> {
  ok: true
  data: T
  meta: ResponseMeta
}

export interface FeelrErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    detail?: string
    hint: 'retry' | 'auth' | 'abort'
    status: number
  }
}

export interface ResponseMeta {
  request_id: string
  connector: string
  action: string
  duration_ms: number
  cursor?: string
  has_more?: boolean
}
```

**Confidence:** HIGH (CONN-05 and CONN-06 requirements directly specify this)

### Pattern 5: Monorepo Configuration

**What:** pnpm workspace + Turborepo configuration for the monorepo.

**When to use:** Project initialization.

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'connectors/*'
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "deploy": {
      "dependsOn": ["build", "test"]
    }
  }
}
```

```json
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

```toml
# apps/gateway/wrangler.toml
name = "feelr-gateway"
main = "src/index.ts"
compatibility_date = "2026-02-05"

# Phase 1: minimal bindings
[vars]
ENVIRONMENT = "development"
```

**Confidence:** HIGH (verified pattern from Cloudflare docs and Outstand monorepo blog)

### Anti-Patterns to Avoid

- **Registering plain Hono routes and adding OpenAPI later:** Retrofitting OpenAPI onto existing routes requires rewriting every route handler. Use `OpenAPIHono` and `createRoute` from the start.
- **Importing Cloudflare-specific types in connector-sdk:** The SDK must use only Web Standard APIs. No `KVNamespace`, `D1Database`, or `DurableObjectNamespace` in connector code. These live only in the gateway.
- **Deep nesting in wrangler.toml bindings for Phase 1:** Start with minimal bindings. Add KV, D1, Durable Objects in later phases when actually needed. Premature binding configuration creates testing complexity.
- **Creating individual OpenAPI routes for each connector action:** Actions are dynamic (determined by the connector registry). The gateway has ONE dispatch route (`/v1/:connector/:action`), not individual routes per action. OpenAPI docs for individual actions come from the connector metadata, not from Hono route definitions.
- **Using `response.json()` on raw upstream responses without size limits:** Buffer only up to a reasonable limit (e.g., 10MB). For larger responses, consider streaming or returning an error.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request validation | Custom param parsing | `@hono/zod-validator` with Zod schemas | Handles type coercion, nested objects, error messages. Edge cases are numerous. |
| OpenAPI documentation | Manual JSON schema | `@hono/zod-openapi` | Schemas derive from same Zod types used for validation. Always in sync. |
| CORS handling | Custom headers middleware | `hono/cors` built-in | Handles preflight, credentials, allowed origins correctly. |
| Request logging | Custom console.log wrapper | `hono/logger` built-in | Formatted output, timing, method/path/status. |
| UUID generation | Custom ID function | `crypto.randomUUID()` | Web Standard API, available in Workers. Cryptographically random. |
| Monorepo task orchestration | Shell scripts | Turborepo | Dependency-aware caching, parallelization, proven at scale. |

**Key insight:** Hono has batteries included for most cross-cutting concerns. Check the built-in middleware list before reaching for npm packages.

---

## Common Pitfalls

### Pitfall 1: @cloudflare/vitest-pool-workers Version Incompatibility

**What goes wrong:** Installing latest Vitest (4.x) and @cloudflare/vitest-pool-workers together. Tests fail with cryptic errors because pool-workers only supports Vitest 2.0.x - 3.2.x.
**Why it happens:** `pnpm add vitest` installs 4.x by default. The version constraint is not enforced by peer dependencies in all cases.
**How to avoid:** Pin vitest to `~3.2.0` explicitly in the gateway's package.json. Use `vitest@~3.2.0` (tilde, not caret) to prevent minor version drift past the compatibility window.
**Warning signs:** `TypeError: Cannot read properties of undefined` or `pool 'workers' not found` errors in test output.

### Pitfall 2: OpenAPIHono basePath Not Reflected in OpenAPI Docs

**What goes wrong:** When using `app.route('/v1', v1Router)` where `v1Router` is an OpenAPIHono instance with routes defined via `createRoute`, the OpenAPI doc may not include the `/v1` prefix.
**Why it happens:** Known issue in @hono/zod-openapi (GitHub issue #952). The basePath of nested apps is not always propagated to the OpenAPI document.
**How to avoid:** Define the OpenAPI `doc()` endpoint on the root app, not the sub-app. Include the full path including `/v1` prefix in your `createRoute` path definitions, OR use the root OpenAPIHono instance directly with basePath. For Phase 1, the simplest approach is to use a single OpenAPIHono instance with routes prefixed via `basePath('/v1')`.
**Warning signs:** OpenAPI doc shows `/github/issues.list` instead of `/v1/github/issues.list`.

### Pitfall 3: Zod 4 Breaking Changes from Zod 3

**What goes wrong:** Copy-pasting Zod 3 patterns (from tutorials, Stack Overflow, or Claude's training data) that break in Zod 4.
**Why it happens:** Zod 4 changed error customization APIs, made `.strict()` and `.passthrough()` top-level functions (`z.strictObject()`, `z.looseObject()`), and changed default behavior for optional object properties with defaults.
**How to avoid:** Always reference the Zod 4 migration guide at https://zod.dev/v4/changelog. Key changes: use `z.strictObject()` not `z.object().strict()`. Error customization uses a single unified `error` parameter. Optional fields with defaults now apply defaults even when the field is omitted.
**Warning signs:** TypeScript errors on `.strict()` or `.passthrough()` methods. Unexpected default values appearing.

### Pitfall 4: Not Separating Connector SDK from Gateway Types

**What goes wrong:** Connector SDK types import gateway-specific types (Hono context, Worker bindings). Connectors become tightly coupled to the gateway.
**Why it happens:** It is faster to put everything in one package during initial development. The coupling is invisible until someone tries to test a connector without the gateway.
**How to avoid:** Strict package boundary from day one. `@feelr/connector-sdk` has ZERO dependencies on `apps/gateway`. The SDK defines interfaces; the gateway implements the dispatch. If a type needs to be in both places, it goes in the SDK.
**Warning signs:** Connector tests require wrangler to run. Connector package.json lists `hono` as a dependency.

### Pitfall 5: Forgetting Request ID Generation

**What goes wrong:** Error responses and logs have no correlation ID. Debugging production issues becomes impossible.
**Why it happens:** Request IDs are invisible during development (single user, sequential requests).
**How to avoid:** Generate a `request_id` in the first middleware and attach it to every response via `meta.request_id`. Use `crypto.randomUUID()` which is available in the Workers runtime.
**Warning signs:** Support requests that say "I got an error" with no way to find the corresponding log entry.

---

## Code Examples

### Complete Response Envelope Helpers

```typescript
// apps/gateway/src/lib/envelope.ts
import type { FeelrResponse, FeelrErrorResponse, ResponseMeta } from '@feelr/connector-sdk'

export function wrapResponse<T>(options: {
  data: T
  meta: ResponseMeta
}): FeelrResponse<T> {
  return {
    ok: true,
    data: options.data,
    meta: options.meta,
  }
}

export function wrapError(options: {
  code: string
  message: string
  hint: 'retry' | 'auth' | 'abort'
  status: number
  detail?: string
}): FeelrErrorResponse {
  return {
    ok: false,
    error: {
      code: options.code,
      message: options.message,
      hint: options.hint,
      status: options.status,
      ...(options.detail && { detail: options.detail }),
    },
  }
}
```

### API Key Extraction Middleware (Phase 1 Stub)

```typescript
// apps/gateway/src/middleware/api-key.ts
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app'

/**
 * Phase 1: Extract API key from header or query param.
 * No validation -- just extraction. Validation comes in Phase 2.
 */
export const apiKeyMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // Generate request ID
  c.set('requestId', crypto.randomUUID())

  // Extract API key from header (preferred) or query param
  const headerKey = c.req.header('X-Feelr-Key')
  const queryKey = new URL(c.req.url).searchParams.get('key')
  c.set('apiKey', headerKey || queryKey || null)

  await next()
})
```

### Mock Connector for Testing

```typescript
// apps/gateway/src/connectors/mock.ts
import type { ConnectorDefinition } from '@feelr/connector-sdk'

export const mockConnector: ConnectorDefinition = {
  name: 'mock',
  display_name: 'Mock Connector',
  version: '1.0.0',
  auth_type: 'none',
  actions: {
    'echo': {
      name: 'echo',
      description: 'Returns the provided params back as data. Useful for testing the gateway pipeline.',
      params: [
        {
          name: 'message',
          type: 'string',
          required: false,
          description: 'A message to echo back',
          default: 'hello',
        },
      ],
      returns: 'single',
      handler: async (ctx) => ({
        data: {
          message: (ctx.params.message as string) || 'hello',
          timestamp: new Date().toISOString(),
        },
        raw: { original_params: ctx.params },
      }),
    },
    'items.list': {
      name: 'items.list',
      description: 'Returns a list of mock items with pagination. Tests the list response format.',
      params: [
        {
          name: 'count',
          type: 'number',
          required: false,
          description: 'Number of items to return (1-100)',
          default: 10,
        },
        {
          name: 'cursor',
          type: 'string',
          required: false,
          description: 'Pagination cursor from a previous response',
        },
      ],
      returns: 'list',
      handler: async (ctx) => {
        const count = Math.min(Number(ctx.params.count) || 10, 100)
        const items = Array.from({ length: count }, (_, i) => ({
          id: `item_${i + 1}`,
          name: `Item ${i + 1}`,
          created_at: new Date().toISOString(),
        }))
        return {
          data: items,
          meta: {
            has_more: true,
            cursor: 'mock_cursor_next',
          },
        }
      },
    },
  },
}
```

### Integration Test Example

```typescript
// apps/gateway/src/__tests__/routes.test.ts
import { env, SELF } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

describe('Gateway Routes', () => {
  it('returns 200 with envelope for mock connector', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo?message=test')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.message).toBe('test')
    expect(body.meta.connector).toBe('mock')
    expect(body.meta.action).toBe('echo')
    expect(body.meta.request_id).toBeDefined()
    expect(body.meta.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('returns 404 for unknown connector', async () => {
    const res = await SELF.fetch('http://localhost/v1/nonexistent/action')
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONNECTOR_NOT_FOUND')
    expect(body.error.hint).toBe('abort')
  })

  it('returns 404 for unknown action', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/nonexistent')
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('ACTION_NOT_FOUND')
    expect(body.error.hint).toBe('abort')
  })

  it('returns list format for list actions', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/items.list?count=3')
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBe(3)
    expect(body.meta.has_more).toBe(true)
    expect(body.meta.cursor).toBeDefined()
  })

  it('returns raw response when ?raw=true', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo?message=test&raw=true')
    const body = await res.json()

    // Raw response is the unprocessed upstream data
    expect(body.original_params).toBeDefined()
    expect(body.ok).toBeUndefined() // No envelope wrapper
  })

  it('accepts API key in header', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo', {
      headers: { 'X-Feelr-Key': 'fk_test123' },
    })
    expect(res.status).toBe(200)
  })

  it('accepts API key in query param', async () => {
    const res = await SELF.fetch('http://localhost/v1/mock/echo?key=fk_test123')
    expect(res.status).toBe(200)
  })

  it('returns health check', async () => {
    const res = await SELF.fetch('http://localhost/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod 3 `.strict()` method | Zod 4 `z.strictObject()` top-level | Zod 4.0 (2025) | Must use new API from day one. Do not copy Zod 3 patterns. |
| `wrangler.toml` only | `wrangler.jsonc` supported | Wrangler 4.x | Either format works. TOML is more established, JSONC is recommended for new projects. |
| Miniflare standalone for testing | `@cloudflare/vitest-pool-workers` | 2024 | Miniflare v2 standalone is deprecated. Use Vitest pool. |
| Express-style error handling | Hono `app.onError` + `HTTPException` | Hono 4.x | Hono's error handling is middleware-based, not callback-based. |
| Manual OpenAPI spec | `@hono/zod-openapi` auto-generation | 2024 | Schema + validation + documentation from single Zod definition. |

**Deprecated/outdated:**
- `Miniflare` standalone: Replaced by `@cloudflare/vitest-pool-workers`.
- `z.object().strict()`: Use `z.strictObject()` in Zod 4.
- `wrangler.toml` `type = "javascript"`: No longer needed. Workers auto-detect TypeScript via `main` entry point.

---

## Open Questions

1. **@hono/zod-openapi basePath propagation**
   - What we know: Known issue (#952) where nested OpenAPIHono apps don't propagate basePath to OpenAPI docs.
   - What's unclear: Whether this is fixed in the latest version.
   - Recommendation: For Phase 1, use a single OpenAPIHono instance. The dynamic dispatch route (`/v1/:connector/:action`) means most routes are not individually defined in OpenAPI anyway -- connector metadata provides action documentation separately.

2. **Shared package export strategy**
   - What we know: Exporting raw TypeScript source (not compiled JS) is the recommended pattern for Turborepo monorepos with Workers.
   - What's unclear: Whether wrangler bundles `workspace:*` dependencies correctly from raw TS source.
   - Recommendation: Start with raw TS exports. If wrangler has issues, add a simple `tsc --emitDeclarationOnly` build step to the shared packages. The Outstand blog confirms this works at scale.

3. **Zod 4 compatibility with @hono/zod-openapi**
   - What we know: Zod 4 is the default export. @hono/zod-openapi re-exports `z` from `@hono/zod-openapi`. There was a GitHub issue (#1148) about compatibility.
   - What's unclear: Whether the latest @hono/zod-openapi version fully supports Zod 4 features.
   - Recommendation: Import `z` from `@hono/zod-openapi` (not directly from `zod`) for route schemas. This ensures compatibility. For standalone schemas in the connector-sdk, import from `zod` directly.

---

## Sources

### Primary (HIGH confidence)
- [Hono - Cloudflare Workers Getting Started](https://hono.dev/docs/getting-started/cloudflare-workers) -- project setup, Bindings type, dev/deploy commands
- [Hono - Routing API](https://hono.dev/docs/api/routing) -- path params, wildcards, route grouping, `app.all()`
- [Hono - Context API](https://hono.dev/docs/api/context) -- `c.json()`, `c.req.param()`, `c.set()`/`c.get()`, `c.env`
- [Hono - Hono App API](https://hono.dev/docs/api/hono) -- constructor, generics, `route()`, `onError`, `notFound`
- [Hono - HTTPException](https://hono.dev/docs/api/exception) -- throwing errors, `getResponse()`, `cause` parameter
- [Hono - Middleware Guide](https://hono.dev/docs/guides/middleware) -- `createMiddleware`, variable passing, execution order
- [Hono - Best Practices](https://hono.dev/docs/guides/best-practices) -- route organization, `app.route()`, factory pattern
- [Hono - Zod OpenAPI Example](https://hono.dev/examples/zod-openapi) -- `OpenAPIHono`, `createRoute`, schema definitions
- [Hono - Validator Error Handling](https://hono.dev/examples/validator-error-handling) -- custom validation error responses
- [Cloudflare - Vitest Integration](https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/) -- pool-workers setup, SELF binding, version compatibility
- [Cloudflare - Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) -- wrangler.toml reference, bindings, environments
- [Zod 4 Migration Guide](https://zod.dev/v4/changelog) -- breaking changes, new APIs, migration path

### Secondary (MEDIUM confidence)
- [Outstand - TypeScript Monorepo Setup](https://www.outstand.so/blog/typescript-monorepo-setup) -- pnpm + Turborepo + Workers shared packages pattern
- [Slack Engineering - API Design](https://slack.engineering/how-we-design-our-apis-at-slack/) -- dot-notation method naming rationale, error handling principles
- [Cloudflare - Advanced Monorepo Setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/) -- Turborepo + wrangler deploy per service
- [@hono/zod-openapi npm](https://www.npmjs.com/package/@hono/zod-openapi) -- package docs, OpenAPIHono API
- [honojs/middleware #952](https://github.com/honojs/middleware/issues/952) -- basePath propagation issue in OpenAPI docs

### Tertiary (LOW confidence)
- [@hono/zod-openapi + @cloudflare/workers-types conflict](https://github.com/honojs/middleware/issues/781) -- type conflict workaround; may be version-specific

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via official docs and established in project research
- Architecture: HIGH -- monorepo pattern, Hono middleware chain, and connector dispatch are well-documented
- Discretionary recommendations: HIGH -- based on user's own success criteria, established API patterns (Slack), and agent-first design principles
- Pitfalls: HIGH -- vitest version pinning and Zod 4 changes are documented gotchas; SDK coupling is an architectural discipline concern
- Code examples: MEDIUM-HIGH -- patterns verified against Hono/Cloudflare docs, but exact API surface for latest @hono/zod-openapi should be validated during implementation

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days -- stable stack, no fast-moving dependencies)
