/**
 * invoices.create -- Create a new invoice in Stripe.
 *
 * Uses POST with form-encoded body (handled by stripeFetch).
 * Requires a customer ID; other params are optional.
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { stripeFetch } from '../stripe-fetch'
import { flattenInvoice } from '../flatten'
import { requireCredential, requireParam } from '../utils'

export const invoicesCreate: ActionDefinition = {
  name: 'invoices.create',
  description:
    'Creates a new invoice in Stripe. Accepts "customer" (required, customer ID cus_*), ' +
    'optional "description" (string), optional "auto_advance" (boolean, default true -- ' +
    'whether to auto-finalize). Returns the created invoice as {id, customer, status, total, ' +
    'currency, due_date, created, paid, hosted_invoice_url, number}.',
  params: [
    {
      name: 'customer',
      type: 'string',
      required: true,
      description: 'Customer ID to create invoice for (cus_*)',
    },
    {
      name: 'description',
      type: 'string',
      required: false,
      description: 'Invoice description',
    },
    {
      name: 'auto_advance',
      type: 'boolean',
      required: false,
      description:
        'Whether to auto-finalize the invoice (default true)',
      default: true,
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)
    const customer = requireParam(ctx, 'customer')

    const autoAdvance = ctx.params.auto_advance ?? true

    const result = await stripeFetch<Record<string, unknown>>({
      path: '/invoices',
      method: 'POST',
      body: {
        customer,
        description: ctx.params.description as string | undefined,
        auto_advance: String(autoAdvance),
      },
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenInvoice(result.data),
      raw: result.raw,
    }
  },
}
