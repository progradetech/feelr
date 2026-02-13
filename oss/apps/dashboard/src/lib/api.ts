import { GATEWAY_URL } from '@/config';
import { getAdminToken } from '@/lib/auth';
import type { GatewayResponse } from '@/lib/types';

export async function gatewayFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getAdminToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(GATEWAY_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...options?.headers,
    },
  });

  const body: GatewayResponse<T> = await res.json();

  if (!body.ok) {
    throw new Error(body.error?.message || 'Gateway request failed');
  }

  return body.data;
}

export async function gatewayMutate<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  return gatewayFetch<T>(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
