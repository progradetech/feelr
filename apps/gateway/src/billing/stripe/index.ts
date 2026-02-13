/**
 * Stripe billing provider -- cloud-only implementation of BillingProvider.
 *
 * Encapsulates all Stripe-specific billing logic:
 * - Quota enforcement via KV-cached billing state
 * - Usage recording to Stripe Billing Meters
 * - KV usage counter increment (best-effort)
 *
 * This module lives in billing/stripe/ and has zero imports from gateway
 * core outside of the billing/ directory. It depends only on:
 * - ../provider (BillingProvider interface, QuotaResult type)
 * - ../types (CustomerBilling, PLAN_LIMITS)
 * - ./stripe-client (createStripeClient)
 * - ./meter (recordMeterEvent)
 * - stripe (npm package)
 *
 * The cloud entry point (Phase 27) instantiates StripeBillingProvider
 * and registers it as BILLING_PROVIDER on the environment.
 */

import type Stripe from 'stripe'
import type { BillingProvider, QuotaResult } from '../provider'
import type { CustomerBilling } from '../types'
import { PLAN_LIMITS } from '../types'
import { createStripeClient } from './stripe-client'
import { recordMeterEvent } from './meter'

/**
 * Stripe-backed billing provider for cloud deployments.
 *
 * Implements BillingProvider by checking monthly quotas against
 * KV-cached billing state and recording usage to Stripe meters.
 */
export class StripeBillingProvider implements BillingProvider {
  private readonly stripe: Stripe

  /**
   * @param secretKey - Stripe secret key (sk_live_xxx or sk_test_xxx)
   */
  constructor(secretKey: string) {
    this.stripe = createStripeClient(secretKey)
  }

  /**
   * Check whether the current request is within the user's billing quota.
   *
   * Reads billing state from KV. If no record exists, defaults to the
   * hatchling (free) plan. On KV read error, allows the request through
   * (best-effort enforcement -- prefer availability over strictness).
   */
  async enforceQuota(
    apiKeyShort: string,
    kvGet: (key: string) => Promise<CustomerBilling | null>,
  ): Promise<QuotaResult> {
    let billing: CustomerBilling | null = null
    try {
      billing = await kvGet(`billing:${apiKeyShort}`)
    } catch {
      // KV read failed -- allow through (best-effort)
      return { allowed: true }
    }

    const plan = billing?.plan ?? 'hatchling'
    const currentUsage = billing?.currentMonthUsage ?? 0
    const limits = PLAN_LIMITS[plan]

    if (currentUsage >= limits.api_calls_per_month) {
      return { allowed: false, plan, limit: limits.api_calls_per_month }
    }

    return { allowed: true }
  }

  /**
   * Record a successful API call for billing purposes.
   *
   * Fires a Stripe meter event (if customerId available) and increments
   * the KV-cached usage counter. Both operations are best-effort.
   */
  async recordUsage(
    apiKeyShort: string,
    billing: CustomerBilling | null,
    customerId: string | undefined,
    kvPut: (key: string, value: string) => Promise<void>,
  ): Promise<void> {
    // Fire Stripe meter event (best-effort)
    if (customerId) {
      await recordMeterEvent(this.stripe, customerId).catch(() => {})
    }

    // Increment cached usage count in KV (best-effort)
    if (billing) {
      const updatedBilling: CustomerBilling = {
        ...billing,
        currentMonthUsage: billing.currentMonthUsage + 1,
      }
      await kvPut(
        `billing:${apiKeyShort}`,
        JSON.stringify(updatedBilling),
      ).catch(() => {})
    }
  }
}
