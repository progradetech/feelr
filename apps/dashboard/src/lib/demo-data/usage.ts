import type { UsageResponse } from '@/lib/types';
import type { RateLimitInfo } from '@/lib/hooks/use-usage';

export const DEMO_USAGE = {
  window: '24h',
  buckets: [
    { time_bucket: '2026-02-09T00:00:00Z', total_requests: 2, error_count: 0, avg_duration_ms: 145 },
    { time_bucket: '2026-02-09T01:00:00Z', total_requests: 3, error_count: 0, avg_duration_ms: 132 },
    { time_bucket: '2026-02-09T02:00:00Z', total_requests: 2, error_count: 0, avg_duration_ms: 128 },
    { time_bucket: '2026-02-09T03:00:00Z', total_requests: 4, error_count: 0, avg_duration_ms: 140 },
    { time_bucket: '2026-02-09T04:00:00Z', total_requests: 3, error_count: 0, avg_duration_ms: 135 },
    { time_bucket: '2026-02-09T05:00:00Z', total_requests: 5, error_count: 0, avg_duration_ms: 150 },
    { time_bucket: '2026-02-09T06:00:00Z', total_requests: 8, error_count: 0, avg_duration_ms: 165 },
    { time_bucket: '2026-02-09T07:00:00Z', total_requests: 15, error_count: 1, avg_duration_ms: 180 },
    { time_bucket: '2026-02-09T08:00:00Z', total_requests: 22, error_count: 0, avg_duration_ms: 195 },
    { time_bucket: '2026-02-09T09:00:00Z', total_requests: 35, error_count: 1, avg_duration_ms: 210 },
    { time_bucket: '2026-02-09T10:00:00Z', total_requests: 42, error_count: 0, avg_duration_ms: 225 },
    { time_bucket: '2026-02-09T11:00:00Z', total_requests: 45, error_count: 2, avg_duration_ms: 240 },
    { time_bucket: '2026-02-09T12:00:00Z', total_requests: 38, error_count: 0, avg_duration_ms: 230 },
    { time_bucket: '2026-02-09T13:00:00Z', total_requests: 52, error_count: 1, avg_duration_ms: 255 },
    { time_bucket: '2026-02-09T14:00:00Z', total_requests: 67, error_count: 0, avg_duration_ms: 280 },
    { time_bucket: '2026-02-09T15:00:00Z', total_requests: 78, error_count: 3, avg_duration_ms: 310 },
    { time_bucket: '2026-02-09T16:00:00Z', total_requests: 72, error_count: 1, avg_duration_ms: 295 },
    { time_bucket: '2026-02-09T17:00:00Z', total_requests: 58, error_count: 0, avg_duration_ms: 270 },
    { time_bucket: '2026-02-09T18:00:00Z', total_requests: 35, error_count: 0, avg_duration_ms: 245 },
    { time_bucket: '2026-02-09T19:00:00Z', total_requests: 28, error_count: 1, avg_duration_ms: 220 },
    { time_bucket: '2026-02-09T20:00:00Z', total_requests: 18, error_count: 0, avg_duration_ms: 190 },
    { time_bucket: '2026-02-09T21:00:00Z', total_requests: 12, error_count: 0, avg_duration_ms: 175 },
    { time_bucket: '2026-02-09T22:00:00Z', total_requests: 8, error_count: 0, avg_duration_ms: 155 },
    { time_bucket: '2026-02-09T23:00:00Z', total_requests: 5, error_count: 0, avg_duration_ms: 140 },
  ],
  filters: {},
} satisfies UsageResponse;

export const DEMO_RATE_LIMITS = [
  {
    api_key_short: 'flr_a1b2',
    label: 'production-agent',
    tier: 'pro',
    limit: 10000,
    usage_1m: 4521,
    throttle_24h: 0,
  },
  {
    api_key_short: 'flr_c3d4',
    label: 'staging-bot',
    tier: 'free',
    limit: 1000,
    usage_1m: 287,
    throttle_24h: 2,
  },
  {
    api_key_short: 'flr_e5f6',
    label: null,
    tier: 'free',
    limit: 1000,
    usage_1m: 0,
    throttle_24h: 0,
  },
] satisfies RateLimitInfo[];
