/**
 * Response flattening functions for Stripe resources.
 *
 * Each function takes a raw Stripe API response object and extracts
 * only the essential fields, eliminating nested objects and reducing
 * token overhead for agent consumption.
 *
 * Field counts: PaymentIntent (9), Customer (9), Invoice (10).
 * Stripe timestamps are Unix epoch seconds -- kept as-is for consistency.
 */

/**
 * Flatten a Stripe PaymentIntent response to 9 essential fields.
 *
 * Extracts: id, amount, currency, status, description, customer,
 * created, payment_method_types, latest_charge
 */
export function flattenPaymentIntent(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    amount: raw.amount,
    currency: raw.currency,
    status: raw.status,
    description: raw.description ?? null,
    customer: raw.customer ?? null,
    created: raw.created,
    payment_method_types: raw.payment_method_types ?? [],
    latest_charge: raw.latest_charge ?? null,
  }
}

/**
 * Flatten a Stripe Customer response to 9 essential fields.
 *
 * Extracts: id, email, name, phone, description, created,
 * currency, default_source, balance
 */
export function flattenCustomer(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    email: raw.email ?? null,
    name: raw.name ?? null,
    phone: raw.phone ?? null,
    description: raw.description ?? null,
    created: raw.created,
    currency: raw.currency ?? null,
    default_source: raw.default_source ?? null,
    balance: raw.balance ?? 0,
  }
}

/**
 * Flatten a Stripe Invoice response to 10 essential fields.
 *
 * Extracts: id, customer, status, total, currency, due_date,
 * created, paid, hosted_invoice_url, number
 */
export function flattenInvoice(
  raw: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: raw.id,
    customer: raw.customer ?? null,
    status: raw.status,
    total: raw.total,
    currency: raw.currency,
    due_date: raw.due_date ?? null,
    created: raw.created,
    paid: raw.paid ?? false,
    hosted_invoice_url: raw.hosted_invoice_url ?? null,
    number: raw.number ?? null,
  }
}
