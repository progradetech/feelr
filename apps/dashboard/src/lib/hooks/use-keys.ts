'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import type { ApiKey } from '@/lib/types';

export function useKeys() {
  return useSWR('admin-keys', () => gatewayFetch<ApiKey[]>('/admin/keys'));
}
