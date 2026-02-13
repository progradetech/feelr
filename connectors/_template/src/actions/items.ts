/**
 * items.list action
 *
 * Demonstrates the LIST pattern: paginated collection retrieval.
 * This is the most common action type -- fetching a filtered, paginated
 * list of resources from the upstream API.
 */

import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
  ParamDefinition,
} from '@feelr/connector-sdk'

export const itemsList: ActionDefinition = {
  name: 'items.list',

  description:
    'Lists items with optional filtering and pagination. ' +
    'Accepts optional "page" (number, default 1), "per_page" (number, default 20), ' +
    'and "status" (string, default "active") params. ' +
    'Returns array of { id, name, status, created_at } objects with pagination metadata.',

  params: [
    {
      name: 'page',
      type: 'number',
      required: false,
      description: 'Page number to fetch (1-indexed)',
      default: 1,
    },
    {
      name: 'per_page',
      type: 'number',
      required: false,
      description: 'Number of items per page (max 100)',
      default: 20,
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by status: active, archived, or all',
      default: 'active',
    },
  ] satisfies ParamDefinition[],

  returns: 'list',

  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const page = Number(ctx.params.page ?? 1)
    const perPage = Number(ctx.params.per_page ?? 20)
    const status = String(ctx.params.status ?? 'active')

    // --- Replace this block with your actual upstream API call ---
    //
    // const url = new URL('https://api.example.com/items')
    // url.searchParams.set('page', String(page))
    // url.searchParams.set('per_page', String(perPage))
    // if (status !== 'all') {
    //   url.searchParams.set('status', status)
    // }
    //
    // const response = await ctx.fetch(url.toString(), {
    //   headers: {
    //     'Authorization': `Bearer ${ctx.credential}`,
    //     'Accept': 'application/json',
    //   },
    // })
    //
    // if (!response.ok) {
    //   throw new FeelrError('UPSTREAM_ERROR', {
    //     message: `API returned ${response.status}`,
    //     hint: response.status === 401 ? 'auth' : 'retry',
    //     status: 502,
    //     detail: await response.text(),
    //   })
    // }
    //
    // const raw = await response.json()
    //
    // --- End real API call pattern ---

    // Mock data for template demonstration
    const total = 57
    const items = Array.from({ length: Math.min(perPage, total - (page - 1) * perPage) }, (_, i) => {
      const idx = (page - 1) * perPage + i + 1
      return {
        id: `item_${idx}`,
        name: `Item ${idx}`,
        status: status === 'all' ? (idx % 3 === 0 ? 'archived' : 'active') : status,
        created_at: new Date(Date.now() - idx * 86400000).toISOString(),
      }
    })

    const raw = { items, total, page, per_page: perPage }

    // Normalize response into Feelr ActionResult format
    const data = items.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      created_at: item.created_at,
    }))

    const hasMore = page * perPage < total

    return {
      data,
      meta: {
        has_more: hasMore,
        cursor: hasMore ? String(page + 1) : undefined,
        total_count: total,
      },
      raw,
    }
  },
}
