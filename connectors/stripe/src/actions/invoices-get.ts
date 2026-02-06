/**
 * invoices.get -- Retrieve a single invoice from Stripe.
 *
 * The invoice ID is a path segment (not a query param).
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { stripeFetch } from '../stripe-fetch'
import { flattenInvoice } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const invoicesGet: ActionDefinition = {
  name: 'invoices.get',
  description:
    'Retrieves a single invoice by ID. Accepts "id" (required, invoice ID starting with in_*). ' +
    'Returns {id, customer, status, total, currency, due_date, created, paid, ' +
    'hosted_invoice_url, number}.',
  params: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Invoice ID (in_*)',
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const id = requireParam(ctx, 'id')

    const result = await stripeFetch<Record<string, unknown>>({
      path: `/invoices/${id}`,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenInvoice(result.data),
      raw: result.raw,
    }
  },
}
