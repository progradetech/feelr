/**
 * Billing types for Stripe-based plan enforcement and metered usage.
 *
 * Defines the three billing tiers (hatchling/lobster/leviathan) with
 * monthly API call limits, and maps them to existing RateLimitTier
 * values for rate limiting integration.
 */

import type { RateLimitTier } from '../auth/types'

/** Billing plan names matching Stripe product names */
export type BillingPlan = 'hatchling' | 'lobster' | 'leviathan'

/** Per-plan resource limits */
export interface PlanLimits {
  /** Maximum API calls allowed per billing month */
  api_calls_per_month: number
  /** Rate limit tier for per-minute request throttling */
  rate_limit_tier: RateLimitTier
}

/**
 * Monthly limits and rate tiers for each billing plan.
 *
 * - hatchling (Free):      1,000 calls/mo, 30 req/min
 * - lobster ($29/mo):    100,000 calls/mo, 300 req/min
 * - leviathan ($149/mo): 10,000,000 calls/mo, 3,000 req/min
 */
export const PLAN_LIMITS: Record<BillingPlan, PlanLimits> = {
  hatchling: { api_calls_per_month: 1_000, rate_limit_tier: 'free' },
  lobster: { api_calls_per_month: 100_000, rate_limit_tier: 'pro' },
  leviathan: { api_calls_per_month: 10_000_000, rate_limit_tier: 'enterprise' },
}

/** Maps billing plan names to existing RateLimitTier values */
export const PLAN_TO_TIER: Record<BillingPlan, RateLimitTier> = {
  hatchling: 'free',
  lobster: 'pro',
  leviathan: 'enterprise',
}

/**
 * Cached billing state for an API key.
 * Stored in KV at `billing:<apiKeyShort>` with TTL.
 */
export interface CustomerBilling {
  /** Stripe customer ID (cus_xxx) */
  stripeCustomerId: string
  /** Active billing plan */
  plan: BillingPlan
  /** API calls used in the current billing month */
  currentMonthUsage: number
  /** ISO 8601 timestamp of current billing cycle start */
  billingCycleStart: string
}
