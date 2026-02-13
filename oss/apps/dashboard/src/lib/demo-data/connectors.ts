import type { ConnectorStatus } from '@/lib/types';

export const DEMO_CONNECTORS = [
  { name: 'github', status: 'connected' },
  { name: 'slack', status: 'connected' },
  { name: 'stripe', status: 'needs_reauth' },
  { name: 'discord', status: 'not_connected' },
] satisfies ConnectorStatus[];
