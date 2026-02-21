import type { BillingData, BillingStatusData } from '@/lib/types';

export const DEMO_BILLING = {
  mode: 'cloud',
  plan: 'hatchling',
  quota_limit: 1000,
  stripe_customer_id: 'cus_demo_abc123',
} satisfies BillingData;

export const DEMO_BILLING_STATUS = {
  plan: 'hatchling',
  usage: 450,
  limit: 1000,
  billing_cycle_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
  billing_cycle_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
  stripe_customer_id: 'cus_demo_abc123',
  payment_failed: false,
} satisfies BillingStatusData;
