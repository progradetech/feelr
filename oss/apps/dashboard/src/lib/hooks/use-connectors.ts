'use client';

import useSWR from 'swr';
import { gatewayFetch } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';
import { DEMO_CONNECTORS } from '@/lib/demo-data';
import type { ConnectorStatus } from '@/lib/types';

/**
 * All known connectors in the Feelr ecosystem.
 * Used to derive status by comparing against /admin/credentials response.
 */
const KNOWN_CONNECTORS = ['github', 'slack', 'stripe', 'discord'] as const;

/**
 * CLI auth commands per connector.
 */
export const AUTH_COMMANDS: Record<string, string> = {
  github: 'feelr auth github',
  slack: 'feelr auth slack',
  stripe: 'feelr auth stripe',
  discord: 'feelr auth discord',
};

interface CredentialEntry {
  connector: string;
}

/**
 * Hook to fetch connector statuses.
 *
 * Fetches GET /admin/credentials to get the list of stored connectors,
 * then maps each known connector to its status.
 *
 * TODO: 'needs_reauth' state cannot be determined from /admin/credentials alone.
 * The gateway needs to expose auth_state (e.g., token expiry, last refresh error)
 * on the /admin/credentials response for the 3-state model. For now, only
 * 'connected' and 'not_connected' are derived.
 */
export function useConnectors() {
  const { isDemo } = useDemo();
  const swr = useSWR(isDemo ? null : 'admin-connectors', async () => {
    const credentials = await gatewayFetch<CredentialEntry[]>('/admin/credentials');
    const connectedSet = new Set(credentials.map((c) => c.connector));

    const statuses: ConnectorStatus[] = KNOWN_CONNECTORS.map((name) => ({
      name,
      status: connectedSet.has(name) ? 'connected' : 'not_connected',
    }));

    return statuses;
  });
  return isDemo
    ? { ...swr, data: DEMO_CONNECTORS as ConnectorStatus[], isLoading: false }
    : swr;
}
