'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';
import { DEMO_KEYS } from '@/lib/demo-data';
import type { ApiKey } from '@/lib/types';

export function useKeys() {
  const { isDemo } = useDemo();
  const swr = useSWR(isDemo ? null : 'admin-keys', () =>
    gatewayFetch<ApiKey[]>('/admin/keys'),
  );
  return isDemo ? { ...swr, data: DEMO_KEYS as ApiKey[], isLoading: false } : swr;
}
