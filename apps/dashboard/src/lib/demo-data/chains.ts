import type { ChainHistoryEntry } from '@/lib/types';

export const DEMO_CHAINS = [
  {
    id: 'ch_001',
    chain_name: 'github-to-slack',
    success: true,
    steps_executed: 3,
    steps_total: 3,
    total_duration_ms: 1250,
    executed_at: '2026-02-10T14:30:00Z',
    steps: [
      { step_id: 'fetch-issue', skipped: false, error: null, duration_ms: 420 },
      { step_id: 'format-message', skipped: false, error: null, duration_ms: 85 },
      { step_id: 'post-slack', skipped: false, error: null, duration_ms: 745 },
    ],
  },
  {
    id: 'ch_002',
    chain_name: 'stripe-invoice-notify',
    success: true,
    steps_executed: 1,
    steps_total: 2,
    total_duration_ms: 890,
    executed_at: '2026-02-10T12:15:00Z',
    steps: [
      { step_id: 'fetch-invoice', skipped: false, error: null, duration_ms: 890 },
      { step_id: 'notify-discord', skipped: true, error: null, duration_ms: 0 },
    ],
  },
  {
    id: 'ch_003',
    chain_name: 'discord-github-sync',
    success: false,
    steps_executed: 2,
    steps_total: 4,
    total_duration_ms: 2100,
    executed_at: '2026-02-09T18:45:00Z',
    steps: [
      { step_id: 'read-channel', skipped: false, error: null, duration_ms: 650 },
      { step_id: 'create-issue', skipped: false, error: 'Rate limit exceeded', duration_ms: 1450 },
      { step_id: 'label-issue', skipped: true, error: null, duration_ms: 0 },
      { step_id: 'confirm-discord', skipped: true, error: null, duration_ms: 0 },
    ],
  },
  {
    id: 'ch_004',
    chain_name: 'issue-triage',
    success: true,
    steps_executed: 2,
    steps_total: 2,
    total_duration_ms: 650,
    executed_at: '2026-02-09T09:00:00Z',
    steps: [
      { step_id: 'fetch-issues', skipped: false, error: null, duration_ms: 380 },
      { step_id: 'apply-labels', skipped: false, error: null, duration_ms: 270 },
    ],
  },
] satisfies ChainHistoryEntry[];
