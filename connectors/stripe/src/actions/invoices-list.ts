/**
 * invoices.list -- List invoices from Stripe.
 *
 * Uses Stripe's cursor-based pagination via starting_after parameter.
 * Supports filtering by customer ID and status.
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { stripeFetch } from '../stripe-fetch'
import { flattenInvoice } from '../flatten'
import { requireCredential } from '../utils'

export const invoicesList: ActionDefinition = {
  name: 'invoices.list',
  description:
    'Lists invoices from Stripe. Accepts optional "limit" (number, default 10, max 100), ' +
    '"customer" (customer ID to filter by), "status" (draft/open/paid/void/uncollectible). ' +
    'Returns array of {id, customer, status, total, currency, due_date, created, paid, ' +
    'hosted_invoice_url, number}.',
  params: [
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Number of results to return (max 100)',
      default: 10,
    },
    {
      name: 'customer',
      type: 'string',
      required: false,
      description: 'Filter by customer ID (cus_*)',
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description:
        'Filter by status: draft, open, paid, void, uncollectible',
    },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)

    const result = await stripeFetch<{
      data: Record<string, unknown>[]
      has_more: boolean
    }>({
      path: '/invoices',
      params: {
        limit: String(ctx.params.limit ?? 10),
        ...(ctx.params.customer
          ? { customer: ctx.params.customer as string }
          : {}),
        ...(ctx.params.status
          ? { status: ctx.params.status as string }
          : {}),
        ...(ctx.cursor ? { starting_after: ctx.cursor } : {}),
      },
      credential,
      fetch: ctx.fetch,
    })

    const items = result.data.data

    return {
      data: items.map(flattenInvoice),
      meta: {
        has_more: result.hasMore ?? false,
        ...(result.lastId ? { cursor: result.lastId } : {}),
      },
      raw: result.raw,
    }
  },
}
