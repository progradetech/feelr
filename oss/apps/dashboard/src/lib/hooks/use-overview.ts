'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';
import { DEMO_OVERVIEW } from '@/lib/demo-data';
import type { OverviewData } from '@/lib/types';

/**
 * SWR hook for overview data from /internal/overview.
 *
 * Returns total API keys, connected services count, and
 * recent usage data (24h total + hourly sparkline).
 */
export function useOverview() {
  const { isDemo } = useDemo();
  const swr = useSWR(isDemo ? null : 'internal-overview', () =>
    gatewayFetch<OverviewData>('/internal/overview'),
  );
  return isDemo
    ? { ...swr, data: DEMO_OVERVIEW as OverviewData, isLoading: false }
    : swr;
}
