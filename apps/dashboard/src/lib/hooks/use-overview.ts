'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import type { OverviewData } from '@/lib/types';

/**
 * SWR hook for overview data from /internal/overview.
 *
 * Returns total API keys, connected services count, and
 * recent usage data (24h total + hourly sparkline).
 */
export function useOverview() {
  return useSWR('internal-overview', () =>
    gatewayFetch<OverviewData>('/internal/overview'),
  );
}
