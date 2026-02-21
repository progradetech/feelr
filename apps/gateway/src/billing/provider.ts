/**
 * Pluggable billing provider interface and no-op default implementation.
 *
 * Defines the contract for billing enforcement and usage recording.
 * The gateway core delegates to a BillingProvider without knowing the
 * implementation -- cloud deployments inject StripeBillingProvider,
 * self-hosted deployments use the default NoopBillingProvider.
 *
 * This follows the same provider/adapter pattern used by KeyValueStore,
 * RateLimiter, and TokenCoordinatorClient in runtime/interfaces.ts.
 */

import type { BillingPlan, CustomerBilling } from './types'

// ---------------------------------------------------------------------------
// QuotaResult -- returned by enforceQuota()
// ---------------------------------------------------------------------------

/**
 * Result of a quota enforcement check.
 */
export interface QuotaResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean
  /** If denied, the billing plan that hit its limit */
  plan?: BillingPlan
  /** If denied, the limit that was exceeded */
  limit?: number
}

// ---------------------------------------------------------------------------
// BillingProvider -- strategy interface
// ---------------------------------------------------------------------------

/**
 * Pluggable billing provider interface.
 *
 * Implementations:
 * - NoopBillingProvider: always allows, never records (public/self-hosted)
 * - StripeBillingProvider: enforces quotas via KV, records to Stripe meters (cloud)
 */
export interface BillingProvider {
  /**
   * Check whether the current request is within the user's billing quota.
   * Called BEFORE the request is processed.
   *
   * @param apiKeyShort - Short token identifying the API key
   * @param kvGet - Function to read billing state from KV
   * @returns QuotaResult indicating whether to proceed or deny
   */
  enforceQuota(
    apiKeyShort: string,
    kvGet: (key: string) => Promise<CustomerBilling | null>,
  ): Promise<QuotaResult>

  /**
   * Record a successful API call for billing purposes.
   * Called AFTER the request succeeds. Must be best-effort (never throw).
   *
   * @param apiKeyShort - Short token identifying the API key
   * @param billing - Current billing state (may be null for free tier)
   * @param customerId - Stripe customer ID (if available)
   * @param kvPut - Function to update billing state in KV
   */
  recordUsage(
    apiKeyShort: string,
    billing: CustomerBilling | null,
    customerId: string | undefined,
    kvPut: (key: string, value: string) => Promise<void>,
  ): Promise<void>

  /**
   * Create a Stripe customer for an API key.
   * Used during key creation (cloud) and lazy migration (legacy keys).
   *
   * @param shortToken - Short token identifying the API key
   * @param metadata - Optional additional metadata for the Stripe customer
   * @returns Stripe customer ID (cus_xxx)
   */
  createCustomer(
    shortToken: string,
    metadata?: Record<string, string>,
  ): Promise<string>
}

// ---------------------------------------------------------------------------
// NoopBillingProvider -- default for self-hosted and public repo
// ---------------------------------------------------------------------------

/**
 * No-op billing provider. Always allows requests, never records usage.
 * Default for self-hosted deployments and public repo.
 */
export class NoopBillingProvider implements BillingProvider {
  async enforceQuota(): Promise<QuotaResult> {
    return { allowed: true }
  }

  async recordUsage(): Promise<void> {
    // Intentionally empty -- no billing in self-hosted mode
  }

  async createCustomer(): Promise<string> {
    return 'noop_customer'
  }
}
