# Feelr Connector Template

A full working example connector that demonstrates how to build Feelr connectors. Copy this directory and modify it to create a new connector.

## What's Included

This template has 3 example actions that cover the main patterns you'll use:

| Action | Pattern | Description |
|--------|---------|-------------|
| `items.list` | LIST | Paginated collection retrieval with filtering |
| `item.get` | GET | Single resource by ID |
| `item.create` | CREATE | Write/mutation operation |

Plus a full test suite and this documentation.

## Quick Start

```bash
# 1. Copy to a new directory
cp -r connectors/_template connectors/your-service

# 2. Update package.json
#    Change "name" to "@feelr/connector-your-service"

# 3. Implement your actions (see below)

# 4. Register in the gateway
#    In apps/gateway/src/routes/v1.ts:
#    import { yourConnector } from '../connectors/your-service'
#    registerConnector(yourConnector)

# 5. Install and verify
pnpm install
pnpm turbo typecheck
```

## File Structure

```
connectors/your-connector/
  src/
    index.ts              # ConnectorDefinition (name, auth_type, actions map)
    actions/
      items.ts            # List action example
      item-get.ts         # Get action example
      item-create.ts      # Create action example
    __tests__/
      actions.test.ts     # Test examples
  package.json            # Workspace package config
  tsconfig.json           # TypeScript config
  README.md               # This file
```

## Action Patterns

### LIST Pattern (paginated collection)

Used for actions that return multiple items with pagination.

```typescript
const thingsList: ActionDefinition = {
  name: 'things.list',
  description: 'Lists things with pagination...',
  params: [
    { name: 'page', type: 'number', required: false, default: 1, description: '...' },
    { name: 'per_page', type: 'number', required: false, default: 20, description: '...' },
  ],
  returns: 'list',
  handler: async (ctx) => {
    const response = await ctx.fetch(`https://api.example.com/things?page=${ctx.params.page}`, {
      headers: { Authorization: `Bearer ${ctx.credential}` },
    })
    const raw = await response.json()
    return {
      data: raw.items.map(item => ({ id: item.id, name: item.name })),
      meta: { has_more: raw.has_next, cursor: raw.next_page },
      raw,
    }
  },
}
```

Key points:
- `returns: 'list'` -- data is an array
- Include pagination in `meta` (has_more, cursor, total_count)
- Use `ctx.cursor` for cursor-based APIs (set via `?cursor=` query param)

### GET Pattern (single resource)

Used for fetching one item by ID.

```typescript
const thingGet: ActionDefinition = {
  name: 'thing.get',
  description: 'Gets a thing by ID...',
  params: [
    { name: 'id', type: 'string', required: true, description: 'Thing ID' },
  ],
  returns: 'single',
  handler: async (ctx) => {
    const response = await ctx.fetch(`https://api.example.com/things/${ctx.params.id}`, {
      headers: { Authorization: `Bearer ${ctx.credential}` },
    })
    const raw = await response.json()
    return {
      data: { id: raw.id, name: raw.name, status: raw.status },
      raw,
    }
  },
}
```

Key points:
- `returns: 'single'` -- data is an object
- No `meta` needed (no pagination)
- Handle 404s by throwing `FeelrError('NOT_FOUND', ...)`

### CREATE Pattern (mutation)

Used for write operations that create or modify resources.

```typescript
const thingCreate: ActionDefinition = {
  name: 'thing.create',
  description: 'Creates a new thing...',
  params: [
    { name: 'name', type: 'string', required: true, description: 'Thing name' },
    { name: 'description', type: 'string', required: false, description: 'Optional description' },
  ],
  returns: 'single',
  handler: async (ctx) => {
    const response = await ctx.fetch('https://api.example.com/things', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.credential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: ctx.params.name, description: ctx.params.description }),
    })
    const raw = await response.json()
    return {
      data: { id: raw.id, name: raw.name, created_at: raw.created_at },
      raw,
    }
  },
}
```

Key points:
- Use `method: 'POST'` (or PUT/PATCH) for mutations
- Set `Content-Type` header for JSON bodies
- Return the created/updated resource

## Testing

Tests use vitest and live in `src/__tests__/`.

```typescript
import { describe, it, expect } from 'vitest'
import type { ActionContext } from '@feelr/connector-sdk'

// Create a mock context for testing
function createMockContext(params: Record<string, unknown> = {}): ActionContext {
  return {
    params,
    fetch: globalThis.fetch,
    credential: 'mock-token',
    cursor: undefined,
  }
}

describe('things.list', () => {
  it('returns data array with pagination', async () => {
    const ctx = createMockContext({ page: 1 })
    const result = await thingsList.handler(ctx)

    expect(Array.isArray(result.data)).toBe(true)
    expect(result.meta?.has_more).toBeDefined()
  })
})
```

Run tests with:

```bash
pnpm --filter @feelr/connector-your-name test
```

## Registration

After implementing your actions, register the connector in the gateway:

```typescript
// apps/gateway/src/routes/v1.ts
import { yourConnector } from '../connectors/your-service'

registerConnector(yourConnector)
```

The gateway will automatically:
- Expose actions at `/v1/your-service/{action-name}`
- Include actions in `feelr tools` discovery
- Handle auth, rate limiting, and response enveloping

## Further Reading

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full contributor guidelines, commit conventions, and PR process.
