import type { ApiKey } from '@/lib/types';

export const DEMO_KEYS = [
  {
    short_token: 'flr_a1b2',
    label: 'production-agent',
    created_at: '2026-01-15T10:30:00Z',
    last_used_at: '2026-02-10T08:45:00Z',
  },
  {
    short_token: 'flr_c3d4',
    label: 'staging-bot',
    created_at: '2026-01-20T14:00:00Z',
    last_used_at: '2026-02-09T22:15:00Z',
  },
  {
    short_token: 'flr_e5f6',
    label: null,
    created_at: '2026-02-01T09:00:00Z',
    last_used_at: null,
  },
] satisfies ApiKey[];
