/**
 * payments.get -- Retrieve a single payment intent from Stripe.
 *
 * The payment intent ID is a path segment (not a query param).
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { stripeFetch } from '../stripe-fetch'
import { flattenPaymentIntent } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const paymentsGet: ActionDefinition = {
  name: 'payments.get',
  description:
    'Retrieves a single payment intent by ID. Accepts "id" (required, payment intent ID starting ' +
    'with pi_*). Returns {id, amount, currency, status, description, customer, created, ' +
    'payment_method_types, latest_charge}.',
  params: [
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Payment intent ID (pi_*)',
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const id = requireParam(ctx, 'id')

    const result = await stripeFetch<Record<string, unknown>>({
      path: `/payment_intents/${id}`,
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenPaymentIntent(result.data),
      raw: result.raw,
    }
  },
}
