import type { BillingData } from '@/lib/types';

export const DEMO_BILLING = {
  mode: 'cloud',
  plan: 'hatchling',
  quota_limit: 1000,
  stripe_customer_id: 'cus_demo_abc123',
} satisfies BillingData;
