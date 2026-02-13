/**
 * customers.list -- List customers from Stripe.
 *
 * Uses Stripe's cursor-based pagination via starting_after parameter.
 * Supports filtering by email address.
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { stripeFetch } from '../stripe-fetch'
import { flattenCustomer } from '../flatten'
import { requireCredential } from '../utils'

export const customersList: ActionDefinition = {
  name: 'customers.list',
  description:
    'Lists customers from Stripe. Accepts optional "limit" (number, default 10, max 100), ' +
    '"email" (filter by exact email address). Returns array of {id, email, name, phone, ' +
    'description, created, currency, default_source, balance}.',
  params: [
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Number of results to return (max 100)',
      default: 10,
    },
    {
      name: 'email',
      type: 'string',
      required: false,
      description: 'Filter by exact email address',
    },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)

    const result = await stripeFetch<{
      data: Record<string, unknown>[]
      has_more: boolean
    }>({
      path: '/customers',
      params: {
        limit: String(ctx.params.limit ?? 10),
        ...(ctx.params.email ? { email: ctx.params.email as string } : {}),
        ...(ctx.cursor ? { starting_after: ctx.cursor } : {}),
      },
      credential,
      fetch: ctx.fetch,
    })

    const items = result.data.data

    return {
      data: items.map(flattenCustomer),
      meta: {
        has_more: result.hasMore ?? false,
        ...(result.lastId ? { cursor: result.lastId } : {}),
      },
      raw: result.raw,
    }
  },
}
