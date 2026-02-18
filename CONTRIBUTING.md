# Contributing to Feelr

Thanks for wanting to contribute to Feelr! This guide covers everything you need to get started -- from setting up the monorepo to building your own connector.

## Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/feelr.git
cd feelr

# Install dependencies
pnpm install

# Verify everything compiles
pnpm turbo typecheck
```

**Requirements:** Node.js 20+, pnpm 9+, Go 1.25+ (for CLI work)

## Project Structure

```
feelr/
  apps/
    gateway/        # Cloudflare Workers + Hono edge gateway
    dashboard/      # Next.js admin dashboard
    docs/           # Nextra documentation site (feelr.dev/docs)
  packages/
    connector-sdk/  # Shared types and utilities for connectors
    tsconfig/       # Shared TypeScript config
  connectors/
    _template/      # Starter template for new connectors
    github/         # GitHub connector
    slack/          # Slack connector
    stripe/         # Stripe connector
    discord/        # Discord connector
  cli/              # Go CLI binary
  chains/           # Pre-built composable action chains
  self-host/        # Docker-based self-hosting setup
```

## Creating a New Connector

This is the most common way to contribute. Each connector wraps an upstream API and exposes it through standardized actions that AI agents can discover and call.

### Quick Start

Scaffold a new connector using the built-in generator:

```bash
pnpm create-connector <name> --auth <type>
```

The `--auth` flag accepts one of four authentication types:

| Auth Type      | When to Use                                    | Example APIs           |
|----------------|------------------------------------------------|------------------------|
| `api_key`      | API key sent in a header                       | Stripe, SendGrid       |
| `oauth2`       | OAuth 2.0 flow with token refresh              | Slack, Discord         |
| `bearer_token` | Personal access token or long-lived token      | GitHub, Linear         |
| `none`         | No authentication required                     | Public/open APIs       |

For example, to create a Todoist connector with API key auth:

```bash
pnpm create-connector todoist --auth api_key
```

This scaffolds `connectors/todoist/` with all the boilerplate in place, runs `pnpm install` to register the workspace package, and prints next steps.

### Auth Types

Each connector declares its `auth_type` in the `ConnectorDefinition`. The gateway handles credential storage and (for OAuth) token refresh. Your connector receives the credential via `ctx.credential`.

#### `api_key`

API key sent in a custom header. Used by Stripe-style APIs where the key goes in a specific header (not `Authorization`).

```typescript
handler: async (ctx: ActionContext): Promise<ActionResult> => {
  const response = await ctx.fetch('https://api.example.com/v1/items', {
    headers: {
      'X-API-Key': ctx.credential!,
      'Content-Type': 'application/json',
    },
  })
  // ...
}
```

Some APIs expect the key in a query parameter or in a Basic Auth header. Adapt the header placement to match the upstream API docs.

#### `oauth2`

OAuth 2.0 flow. The gateway handles the entire OAuth dance (authorization redirect, code exchange, token refresh). Your connector receives a **valid access token** via `ctx.credential` -- you never deal with refresh tokens.

```typescript
handler: async (ctx: ActionContext): Promise<ActionResult> => {
  const response = await ctx.fetch('https://api.example.com/v1/items', {
    headers: {
      Authorization: `Bearer ${ctx.credential}`,
    },
  })
  // ...
}
```

If the upstream API returns a 401, the gateway will attempt a token refresh and retry. Your connector does not need to handle refresh logic.

#### `bearer_token`

Personal access token or long-lived token. The code looks identical to `oauth2` -- you send `Authorization: Bearer ${ctx.credential}` -- but there is no refresh flow. Used by APIs like GitHub where users generate tokens in their account settings.

```typescript
handler: async (ctx: ActionContext): Promise<ActionResult> => {
  const response = await ctx.fetch('https://api.github.com/repos', {
    headers: {
      Authorization: `Bearer ${ctx.credential}`,
      'User-Agent': 'feelr-connector',
    },
  })
  // ...
}
```

#### `none`

No authentication required. `ctx.credential` is `undefined`. Do not send authorization headers.

```typescript
handler: async (ctx: ActionContext): Promise<ActionResult> => {
  const response = await ctx.fetch('https://api.open.example.com/v1/data')
  // ...
}
```

### Action Patterns

Each action in a connector is an `ActionDefinition` with a name, description, params, return type, and handler.

#### Naming Convention

Use `resource.verb` dot notation for action names:

- `issues.list` -- list issues
- `repos.get` -- get a single repository
- `tasks.create` -- create a task
- `channels.archive` -- archive a channel

The resource is always plural (even for single-item actions like `repos.get`) and the verb describes the operation.

#### Parameter Conventions

- Use `snake_case` for parameter names: `per_page`, `repo_owner`, `issue_id`
- Mark parameters as `required: true` only when the action cannot function without them
- Provide sensible defaults where possible (e.g., `per_page: 20`, `page: 1`)
- Keep descriptions concise -- agents read these to understand what to pass

```typescript
params: [
  { name: 'owner', type: 'string', required: true, description: 'Repository owner (user or org)' },
  { name: 'repo', type: 'string', required: true, description: 'Repository name' },
  { name: 'state', type: 'string', required: false, description: 'Filter by state: open, closed, all', default: 'open' },
  { name: 'per_page', type: 'number', required: false, description: 'Results per page (max 100)', default: 20 },
],
```

#### Pagination

For cursor-based APIs, use `ctx.cursor` to get the pagination cursor from the request:

```typescript
handler: async (ctx: ActionContext): Promise<ActionResult> => {
  const url = new URL('https://api.example.com/v1/items')
  if (ctx.cursor) {
    url.searchParams.set('cursor', ctx.cursor)
  }

  const response = await ctx.fetch(url.toString(), {
    headers: { Authorization: `Bearer ${ctx.credential}` },
  })
  const raw = await response.json()

  return {
    data: raw.items.map(normalize),
    meta: {
      has_more: raw.has_more,
      cursor: raw.next_cursor,
    },
    raw,
  }
}
```

The response `meta.has_more` tells the caller whether more pages exist, and `meta.cursor` provides the value to pass in the next request.

#### LIST Pattern

Returns multiple items with pagination. Use `returns: 'list'` and return `data` as an array.

```typescript
const itemsList: ActionDefinition = {
  name: 'items.list',
  description: 'Lists items with optional filtering and pagination. Returns array of { id, name, status } objects.',
  params: [
    { name: 'status', type: 'string', required: false, description: 'Filter by status', default: 'active' },
    { name: 'per_page', type: 'number', required: false, description: 'Items per page', default: 20 },
  ],
  returns: 'list',
  handler: async (ctx) => { /* ... */ },
}
```

#### GET Pattern

Returns a single resource by ID. Use `returns: 'single'` and return `data` as an object.

```typescript
const itemGet: ActionDefinition = {
  name: 'items.get',
  description: 'Gets an item by ID. Returns { id, name, status, created_at } object.',
  params: [
    { name: 'id', type: 'string', required: true, description: 'Item ID' },
  ],
  returns: 'single',
  handler: async (ctx) => { /* ... */ },
}
```

#### CREATE Pattern

Creates a new resource. Use `returns: 'single'` and return the created resource.

```typescript
const itemCreate: ActionDefinition = {
  name: 'items.create',
  description: 'Creates a new item. Requires name. Returns the created { id, name, status, created_at } object.',
  params: [
    { name: 'name', type: 'string', required: true, description: 'Item name' },
    { name: 'description', type: 'string', required: false, description: 'Optional description' },
  ],
  returns: 'single',
  handler: async (ctx) => { /* ... */ },
}
```

### Response Normalization Rules

Consistent response shapes are critical for AI agents. Follow these rules for all actions:

1. **Return flat JSON objects with `snake_case` keys.** Map upstream field names: `createdAt` becomes `created_at`, `firstName` becomes `first_name`.

2. **For `returns: 'list'`:** `data` must be an array of objects.
   ```typescript
   return {
     data: [
       { id: '1', name: 'Item One', created_at: '2024-01-01' },
       { id: '2', name: 'Item Two', created_at: '2024-01-02' },
     ],
     meta: { has_more: true, cursor: 'abc123' },
     raw,
   }
   ```

3. **For `returns: 'single'`:** `data` must be a single object.
   ```typescript
   return {
     data: { id: '1', name: 'Item One', created_at: '2024-01-01' },
     raw,
   }
   ```

4. **Include `meta` with pagination info for list actions.** At minimum: `has_more` (boolean) and `cursor` (string, if cursor-based). Optionally include `total_count`.

5. **Include `raw` with the original upstream response.** This is exposed to callers via the `?raw=true` query parameter for debugging.

6. **Strip deeply nested objects.** Flatten useful nested fields into the top level or omit them. For example, if the upstream returns `{ user: { name: "Alice", id: 1 } }`, flatten to `{ user_name: "Alice", user_id: 1 }`.

### Testing Patterns

Every connector must include tests. Tests live in `src/__tests__/` and use Vitest.

#### SDK Contract Tests

Use `@feelr/connector-test-utils` to automatically validate your connector against the SDK contract:

```typescript
// src/__tests__/contract.test.ts
import { validateConnector } from '@feelr/connector-test-utils'
import { myConnector } from '../index'

// Auto-generates tests that verify:
// - Valid name, display_name, version, auth_type
// - All actions have dot-notation names
// - All actions have descriptions and valid params
// - All handlers are functions
validateConnector(myConnector)
```

#### Connector-Specific Tests

Write tests for your action handlers using mock `ActionContext` objects:

```typescript
// src/__tests__/actions.test.ts
import { describe, it, expect, vi } from 'vitest'
import type { ActionContext } from '@feelr/connector-sdk'
import { itemsList } from '../actions/items'

function createMockContext(
  params: Record<string, unknown> = {},
  overrides: Partial<ActionContext> = {},
): ActionContext {
  return {
    params,
    fetch: vi.fn(),
    credential: 'mock-token',
    cursor: undefined,
    ...overrides,
  }
}

describe('items.list', () => {
  it('returns a data array with pagination', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ id: '1', name: 'Test' }],
        has_more: false,
      }),
    })

    const ctx = createMockContext({ per_page: 10 }, { fetch: mockFetch as any })
    const result = await itemsList.handler(ctx)

    expect(Array.isArray(result.data)).toBe(true)
    expect(result.meta?.has_more).toBe(false)
  })
})
```

#### Running Tests

```bash
# Run tests for a specific connector
pnpm --filter @feelr/connector-<name> test

# Run all tests across the monorepo
pnpm turbo test

# Run with coverage
pnpm --filter @feelr/connector-<name> test -- --coverage
```

### Error Handling

Use `FeelrError` from `@feelr/connector-sdk` for all error responses. This ensures consistent error envelopes that agents can parse and act on.

#### Error Codes

| Code              | When to Use                          | Hint    | HTTP Status |
|-------------------|--------------------------------------|---------|-------------|
| `NOT_FOUND`       | Upstream resource doesn't exist      | `abort` | 404         |
| `AUTH_REQUIRED`   | No credential provided               | `auth`  | 401         |
| `AUTH_INVALID`    | Credential rejected by upstream      | `auth`  | 401         |
| `RATE_LIMITED`    | Upstream rate limit hit              | `retry` | 429         |
| `UPSTREAM_ERROR`  | Upstream returned unexpected error   | `retry` | 502         |
| `VALIDATION_ERROR`| Invalid parameters                   | `abort` | 400         |

#### Hints

The `hint` field tells agents what to do:

- **`retry`** -- Transient failure. Wait and try again. Include `detail` with retry guidance when possible.
- **`auth`** -- Re-authenticate and retry. The credential is invalid or expired.
- **`abort`** -- Permanent failure. Do not retry. The request itself is wrong.

#### Example

```typescript
import { FeelrError } from '@feelr/connector-sdk'

handler: async (ctx: ActionContext): Promise<ActionResult> => {
  const response = await ctx.fetch(
    `https://api.example.com/issues/${ctx.params.id}`,
    { headers: { Authorization: `Bearer ${ctx.credential}` } },
  )

  if (response.status === 404) {
    throw new FeelrError('NOT_FOUND', {
      message: 'Issue not found',
      hint: 'abort',
      status: 404,
      detail: `No issue with ID ${ctx.params.id}`,
    })
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    throw new FeelrError('RATE_LIMITED', {
      message: 'Rate limit exceeded',
      hint: 'retry',
      status: 429,
      detail: retryAfter ? `Retry after ${retryAfter} seconds` : undefined,
    })
  }

  if (!response.ok) {
    throw new FeelrError('UPSTREAM_ERROR', {
      message: `Upstream API error: ${response.status}`,
      hint: 'retry',
      status: 502,
      detail: await response.text(),
    })
  }

  const raw = await response.json()
  return {
    data: { id: raw.id, title: raw.title, status: raw.status },
    raw,
  }
}
```

### Connector Guidelines

- **Web Standard APIs only** -- use `fetch`, `URL`, `Headers`, etc. No Node.js or Cloudflare-specific bindings.
- **`@feelr/connector-sdk` is the only runtime dependency** -- no other packages.
- **Agent-optimized descriptions** -- 50-100 tokens, explain what the action does, what params it accepts, and what it returns. Agents read these to decide which action to call.

## CLI Development

The CLI is written in Go and lives in the `cli/` directory.

```bash
cd cli

# Build
go build .

# Run tests
go test ./...

# Run the CLI
./feelr status
```

## Commit Convention

Follow conventional commits:

- `feat(scope):` -- new feature or capability
- `fix(scope):` -- bug fix
- `docs(scope):` -- documentation only
- `test(scope):` -- test additions or fixes
- `refactor(scope):` -- code cleanup, no behavior change
- `chore(scope):` -- tooling, config, dependencies

Scope is typically the connector or subsystem name: `github`, `cli`, `gateway`, `dashboard`, etc.

## Pull Requests

- Describe **what** changed and **why**
- Include test output or verification steps
- Keep PRs focused -- one feature or fix per PR
- Link related issues if applicable

## No CLA Required

Feelr is MIT-licensed. By submitting a pull request, you agree that your contribution is licensed under the same MIT license. No Contributor License Agreement to sign.

## Questions?

Open an issue or start a discussion on GitHub. We are happy to help with connector development or point you in the right direction.
