/**
 * customers.get -- Retrieve a single customer from Stripe.
 *
 * The customer ID is a path segment (not a query param).
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { stripeFetch } from '../stripe-fetch'
import { flattenCustomer } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const customersGet: ActionDefinition = {
  name: 'customers.get',
  description:
    'Retrieves a single customer by ID. Accepts "id" (required, customer ID starting with cus_*). ' +
    'Returns {id, email, name, phone, description, created, currency, default_source, balance}.',
  params: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Customer ID (cus_*)',
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const id = requireParam(ctx, 'id')

    const result = await stripeFetch<Record<string, unknown>>({
      path: `/customers/${id}`,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenCustomer(result.data),
      raw: result.raw,
    }
  },
}
