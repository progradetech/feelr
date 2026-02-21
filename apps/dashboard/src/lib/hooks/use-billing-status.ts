'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';
import { DEMO_BILLING_STATUS } from '@/lib/demo-data';
import type { BillingStatusData } from '@/lib/types';

/**
 * SWR hook for billing status from /admin/billing/status.
 *
 * Returns plan, usage, limits, and billing cycle dates.
 * In demo mode, returns static sample data.
 */
export function useBillingStatus() {
  const { isDemo } = useDemo();
  const swr = useSWR(isDemo ? null : 'admin-billing-status', () =>
    gatewayFetch<BillingStatusData>('/admin/billing/status'),
  );
  return isDemo
    ? { ...swr, data: DEMO_BILLING_STATUS as BillingStatusData, isLoading: false }
    : swr;
}
