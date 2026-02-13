/**
 * item.get action
 *
 * Demonstrates the GET (single resource) pattern: fetching one item by ID.
 * Use this pattern when the action returns a single object rather than a list.
 */

import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
  ParamDefinition,
} from '@feelr/connector-sdk'

export const itemGet: ActionDefinition = {
  name: 'item.get',

  description:
    'Gets a single item by ID. ' +
    'Requires "id" (string) param. ' +
    'Returns { id, name, status, description, created_at, updated_at } object.',

  params: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'The item ID to retrieve',
    },
  ] satisfies ParamDefinition[],

  returns: 'single',

  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const id = String(ctx.params.id)

    // --- Replace with your actual upstream API call ---
    //
    // const response = await ctx.fetch(`https://api.example.com/items/${id}`, {
    //   headers: {
    //     'Authorization': `Bearer ${ctx.credential}`,
    //     'Accept': 'application/json',
    //   },
    // })
    //
    // if (!response.ok) {
    //   if (response.status === 404) {
    //     throw new FeelrError('NOT_FOUND', {
    //       message: `Item ${id} not found`,
    //       hint: 'abort',
    //       status: 404,
    //     })
    //   }
    //   throw new FeelrError('UPSTREAM_ERROR', {
    //     message: `API returned ${response.status}`,
    //     hint: response.status === 401 ? 'auth' : 'retry',
    //     status: 502,
    //   })
    // }
    //
    // const raw = await response.json()
    //
    // --- End real API call pattern ---

    // Mock data for template demonstration
    const raw = {
      id,
      name: `Item ${id.replace('item_', '')}`,
      status: 'active',
      description: 'A sample item for demonstration purposes.',
      tags: ['example', 'template'],
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Normalize: flatten the response, use snake_case keys
    return {
      data: {
        id: raw.id,
        name: raw.name,
        status: raw.status,
        description: raw.description,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
      },
      raw,
    }
  },
}
