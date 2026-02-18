/**
 * item.create action
 *
 * Demonstrates the CREATE (mutation) pattern: sending data to create a new resource.
 * Use this pattern for write operations (POST/PUT/PATCH) that modify upstream state.
 */

import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
  ParamDefinition,
} from '@feelr/connector-sdk'

export const itemCreate: ActionDefinition = {
  name: 'item.create',

  description:
    'Creates a new item. ' +
    'Requires "name" (string). Accepts optional "description" (string) and "tags" (string, comma-separated). ' +
    'Returns the created item with { id, name, description, tags, status, created_at }.',

  params: [
    {
      name: 'name',
      type: 'string',
      required: true,
      description: 'Name for the new item',
    },
    {
      name: 'description',
      type: 'string',
      required: false,
      description: 'Optional description of the item',
    },
    {
      name: 'tags',
      type: 'string',
      required: false,
      description: 'Comma-separated list of tags',
    },
  ] satisfies ParamDefinition[],

  returns: 'single',

  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const name = String(ctx.params.name)
    const description = ctx.params.description ? String(ctx.params.description) : undefined
    const tags = ctx.params.tags ? String(ctx.params.tags).split(',').map((t) => t.trim()) : []

    // --- Replace with your actual upstream API call ---
    //
    // const body: Record<string, unknown> = { name }
    // if (description) body.description = description
    // if (tags.length > 0) body.tags = tags
    //
    // const response = await ctx.fetch('https://api.example.com/items', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${ctx.credential}`,
    //     'Content-Type': 'application/json',
    //     'Accept': 'application/json',
    //   },
    //   body: JSON.stringify(body),
    // })
    //
    // if (!response.ok) {
    //   if (response.status === 422) {
    //     throw new FeelrError('VALIDATION_ERROR', {
    //       message: 'Invalid item data',
    //       hint: 'abort',
    //       status: 422,
    //       detail: await response.text(),
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
      id: `item_${Date.now()}`,
      name,
      description: description ?? '',
      tags,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Normalize the response
    return {
      data: {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        tags: raw.tags.join(', '),
        status: raw.status,
        created_at: raw.created_at,
      },
      raw,
    }
  },
}
