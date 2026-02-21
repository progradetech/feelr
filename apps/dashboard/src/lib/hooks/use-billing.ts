'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';
import { DEMO_BILLING } from '@/lib/demo-data';
import type { BillingData } from '@/lib/types';

/**
 * SWR hook for billing data from /internal/billing.
 *
 * Returns current plan, quota limit, and billing mode.
 * In demo mode, returns static Hatchling plan data.
 */
export function useBilling() {
  const { isDemo } = useDemo();
  const swr = useSWR(isDemo ? null : 'internal-billing', () =>
    gatewayFetch<BillingData>('/internal/billing'),
  );
  return isDemo
    ? { ...swr, data: DEMO_BILLING as BillingData, isLoading: false }
    : swr;
}
