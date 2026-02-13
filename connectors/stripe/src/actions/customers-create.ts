/**
 * customers.create -- Create a new customer in Stripe.
 *
 * Uses POST with form-encoded body (handled by stripeFetch).
 * All params are optional -- Stripe allows creating empty customers.
 */
import type {
  ActionDefinition,
  ActionContext,
  ActionResult,
} from '@feelr/connector-sdk'
import { stripeFetch } from '../stripe-fetch'
import { flattenCustomer } from '../flatten'
import { requireCredential } from '../utils'

export const customersCreate: ActionDefinition = {
  name: 'customers.create',
  description:
    'Creates a new customer in Stripe. Accepts optional "email" (string), "name" (string), ' +
    '"phone" (string), "description" (string). All params are optional. ' +
    'Returns the created customer as {id, email, name, phone, description, created, currency, ' +
    'default_source, balance}.',
  params: [
    {
      name: 'email',
      type: 'string',
      required: false,
      description: 'Customer email address',
    },
    {
      name: 'name',
      type: 'string',
      required: false,
      description: 'Customer full name',
    },
    {
      name: 'phone',
      type: 'string',
      required: false,
      description: 'Customer phone number',
    },
    {
      name: 'description',
      type: 'string',
      required: false,
      description: 'Internal description for the customer',
    },
  ],
  returns: 'single',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const credential = requireCredential(ctx)

    const result = await stripeFetch<Record<string, unknown>>({
      path: '/customers',
      method: 'POST',
      body: {
        email: ctx.params.email as string | undefined,
        name: ctx.params.name as string | undefined,
        phone: ctx.params.phone as string | undefined,
        description: ctx.params.description as string | undefined,
      },
      credential,
      fetch: ctx.fetch,
    })

    return {
      data: flattenCustomer(result.data),
      raw: result.raw,
    }
  },
}
