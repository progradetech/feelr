'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import type { ApiKey, UsageResponse } from '@/lib/types';

export interface UsageFilters {
  key?: string;
  connector?: string;
  window: 'hour' | 'day' | 'month';
}

export function useUsage(filters: UsageFilters) {
  const swrKey = `usage-${filters.window}-${filters.key || 'all'}-${filters.connector || 'all'}`;

  return useSWR(swrKey, () => {
    const params = new URLSearchParams();
    params.set('window', filters.window);
    if (filters.key) params.set('key', filters.key);
    if (filters.connector) params.set('connector', filters.connector);
    return gatewayFetch<UsageResponse>('/internal/usage?' + params.toString());
  });
}

export function useAvailableKeys() {
  return useSWR('admin-keys-for-filter', () =>
    gatewayFetch<ApiKey[]>('/admin/keys'),
  );
}

const CONNECTORS = ['github', 'slack', 'stripe', 'discord'] as const;

export function useAvailableConnectors() {
  return [...CONNECTORS];
}
