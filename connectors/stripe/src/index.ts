/**
 * @feelr/connector-stripe
 *
 * Stripe connector for Feelr. Implements 8 actions covering
 * payments (list, get), customers (list, get, create), and
 * invoices (list, get, create).
 *
 * Auth: api_key (Stripe API key sk_live_* or sk_test_*)
 * All actions use the shared stripeFetch helper for consistent
 * error mapping, form-encoded body encoding, and pagination.
 */
import type { ConnectorDefinition } from '@feelr/connector-sdk'

export const stripeConnector: ConnectorDefinition = {
  name: 'stripe',
  display_name: 'Stripe',
  version: '0.1.0',
  auth_type: 'api_key',
  actions: {},
}
