'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';
import { DEMO_USAGE, DEMO_RATE_LIMITS, DEMO_KEYS } from '@/lib/demo-data';
import type { ApiKey, UsageResponse } from '@/lib/types';

export interface UsageFilters {
  key?: string;
  connector?: string;
  window: 'hour' | 'day' | 'month';
}

export interface RateLimitInfo {
  api_key_short: string;
  label: string | null;
  tier: string;
  limit: number;
  usage_1m: number;
  throttle_24h: number;
}

export function useUsage(filters: UsageFilters) {
  const { isDemo } = useDemo();
  const swrKey = `usage-${filters.window}-${filters.key || 'all'}-${filters.connector || 'all'}`;

  const swr = useSWR(isDemo ? null : swrKey, () => {
    const params = new URLSearchParams();
    params.set('window', filters.window);
    if (filters.key) params.set('key', filters.key);
    if (filters.connector) params.set('connector', filters.connector);
    return gatewayFetch<UsageResponse>('/internal/usage?' + params.toString());
  });
  return isDemo
    ? { ...swr, data: DEMO_USAGE as UsageResponse, isLoading: false }
    : swr;
}

export function useRateLimits() {
  const { isDemo } = useDemo();
  const swr = useSWR<RateLimitInfo[]>(
    isDemo ? null : 'admin-rate-limits',
    () => gatewayFetch<RateLimitInfo[]>('/internal/rate-limits'),
    { refreshInterval: 30000 },
  );
  return isDemo
    ? { ...swr, data: DEMO_RATE_LIMITS as RateLimitInfo[], isLoading: false }
    : swr;
}

export function useAvailableKeys() {
  const { isDemo } = useDemo();
  const swr = useSWR(isDemo ? null : 'admin-keys-for-filter', () =>
    gatewayFetch<ApiKey[]>('/admin/keys'),
  );
  return isDemo
    ? { ...swr, data: DEMO_KEYS as ApiKey[], isLoading: false }
    : swr;
}

const CONNECTORS = ['github', 'slack', 'stripe', 'discord'] as const;

export function useAvailableConnectors() {
  return [...CONNECTORS];
}
