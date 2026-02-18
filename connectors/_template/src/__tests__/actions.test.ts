/**
 * Connector Template Tests
 *
 * These tests demonstrate how to test connector actions.
 * When building your own connector, copy this file and adapt the tests
 * to match your action definitions and expected responses.
 *
 * Key patterns:
 * - Create a mock ActionContext for each test
 * - Verify response structure (data, meta, raw)
 * - Test required vs optional params
 * - Test error handling
 */

import { describe, it, expect } from 'vitest'
import type { ActionContext } from '@feelr/connector-sdk'
import { validateConnector } from '@feelr/connector-test-utils'

import { templateConnector } from '../index'
import { itemsList } from '../actions/items'
import { itemGet } from '../actions/item-get'
import { itemCreate } from '../actions/item-create'

/**
 * SDK Contract Tests
 *
 * Auto-generated tests that validate the connector definition
 * against Feelr SDK interface rules. These run first to catch
 * structural issues before action-specific tests.
 */
validateConnector(templateConnector)

/**
 * Helper: create a mock ActionContext.
 * Reuse this pattern in your own tests.
 */
function createMockContext(params: Record<string, unknown> = {}): ActionContext {
  return {
    params,
    fetch: globalThis.fetch,
    credential: 'mock-token-for-testing',
    cursor: undefined,
  }
}

describe('items.list', () => {
  it('returns a data array with pagination metadata', async () => {
    const ctx = createMockContext({ page: 1, per_page: 5 })
    const result = await itemsList.handler(ctx)

    // List actions return an array of objects
    expect(Array.isArray(result.data)).toBe(true)
    expect((result.data as Record<string, unknown>[]).length).toBe(5)

    // Each item has the expected shape
    const firstItem = (result.data as Record<string, unknown>[])[0]
    expect(firstItem).toHaveProperty('id')
    expect(firstItem).toHaveProperty('name')
    expect(firstItem).toHaveProperty('status')
    expect(firstItem).toHaveProperty('created_at')

    // Meta includes pagination info
    expect(result.meta).toBeDefined()
    expect(result.meta!.has_more).toBe(true)
    expect(result.meta!.cursor).toBe('2')
    expect(result.meta!.total_count).toBe(57)

    // Raw response is included for debugging
    expect(result.raw).toBeDefined()
  })

  it('respects pagination parameters', async () => {
    const ctx = createMockContext({ page: 3, per_page: 20 })
    const result = await itemsList.handler(ctx)

    // Page 3 with 57 total items and 20 per page should have 17 items
    expect((result.data as Record<string, unknown>[]).length).toBe(17)
    expect(result.meta!.has_more).toBe(false)
    expect(result.meta!.cursor).toBeUndefined()
  })

  it('applies default parameters when not provided', async () => {
    const ctx = createMockContext({})
    const result = await itemsList.handler(ctx)

    // Defaults: page=1, per_page=20
    expect((result.data as Record<string, unknown>[]).length).toBe(20)
    expect(result.meta!.has_more).toBe(true)
  })

  it('filters by status parameter', async () => {
    const ctx = createMockContext({ status: 'archived', per_page: 5 })
    const result = await itemsList.handler(ctx)

    const items = result.data as Record<string, unknown>[]
    items.forEach((item) => {
      expect(item.status).toBe('archived')
    })
  })
})

describe('item.get', () => {
  it('returns a single item object', async () => {
    const ctx = createMockContext({ id: 'item_42' })
    const result = await itemGet.handler(ctx)

    // Single actions return an object (not array)
    expect(Array.isArray(result.data)).toBe(false)

    const item = result.data as Record<string, unknown>
    expect(item.id).toBe('item_42')
    expect(item.name).toBe('Item 42')
    expect(item.status).toBe('active')
    expect(item).toHaveProperty('description')
    expect(item).toHaveProperty('created_at')
    expect(item).toHaveProperty('updated_at')
  })

  it('includes raw response for debugging', async () => {
    const ctx = createMockContext({ id: 'item_1' })
    const result = await itemGet.handler(ctx)

    expect(result.raw).toBeDefined()
    // Raw may include fields not in the normalized response
    const raw = result.raw as Record<string, unknown>
    expect(raw).toHaveProperty('tags')
  })
})

describe('item.create', () => {
  it('creates an item with required params only', async () => {
    const ctx = createMockContext({ name: 'My New Item' })
    const result = await itemCreate.handler(ctx)

    const item = result.data as Record<string, unknown>
    expect(item.name).toBe('My New Item')
    expect(item.status).toBe('active')
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('created_at')
  })

  it('creates an item with all optional params', async () => {
    const ctx = createMockContext({
      name: 'Full Item',
      description: 'A detailed description',
      tags: 'backend, api, testing',
    })
    const result = await itemCreate.handler(ctx)

    const item = result.data as Record<string, unknown>
    expect(item.name).toBe('Full Item')
    expect(item.description).toBe('A detailed description')
    expect(item.tags).toBe('backend, api, testing')
  })

  it('returns the created item in raw response', async () => {
    const ctx = createMockContext({ name: 'Raw Check' })
    const result = await itemCreate.handler(ctx)

    const raw = result.raw as Record<string, unknown>
    expect(raw.name).toBe('Raw Check')
    expect(raw).toHaveProperty('updated_at')
    expect(Array.isArray(raw.tags)).toBe(true)
  })
})

/**
 * Error handling example
 *
 * In a real connector, you would test error scenarios like:
 * - Invalid credentials (401 from upstream)
 * - Resource not found (404 from upstream)
 * - Rate limiting (429 from upstream)
 * - Validation errors (422 from upstream)
 *
 * The template uses mock data so there are no upstream errors to trigger.
 * Here's what a real error test would look like:
 *
 * describe('error handling', () => {
 *   it('throws NOT_FOUND for missing items', async () => {
 *     // Mock fetch to return 404
 *     const ctx = createMockContext({ id: 'nonexistent' })
 *     ctx.fetch = async () => new Response('Not Found', { status: 404 })
 *
 *     await expect(itemGet.handler(ctx)).rejects.toThrow('not found')
 *   })
 *
 *   it('throws UPSTREAM_ERROR on server failure', async () => {
 *     const ctx = createMockContext({ page: 1 })
 *     ctx.fetch = async () => new Response('Internal Server Error', { status: 500 })
 *
 *     await expect(itemsList.handler(ctx)).rejects.toThrow()
 *   })
 * })
 */
