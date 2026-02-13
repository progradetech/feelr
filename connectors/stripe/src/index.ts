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

import { paymentsList } from './actions/payments-list'
import { paymentsGet } from './actions/payments-get'
import { customersList } from './actions/customers-list'
import { customersGet } from './actions/customers-get'
import { customersCreate } from './actions/customers-create'
import { invoicesList } from './actions/invoices-list'
import { invoicesGet } from './actions/invoices-get'
import { invoicesCreate } from './actions/invoices-create'

export const stripeConnector: ConnectorDefinition = {
  name: 'stripe',
  display_name: 'Stripe',
  version: '0.1.0',
  auth_type: 'api_key',
  actions: {
    'payments.list': paymentsList,
    'payments.get': paymentsGet,
    'customers.list': customersList,
    'customers.get': customersGet,
    'customers.create': customersCreate,
    'invoices.list': invoicesList,
    'invoices.get': invoicesGet,
    'invoices.create': invoicesCreate,
  },
}
