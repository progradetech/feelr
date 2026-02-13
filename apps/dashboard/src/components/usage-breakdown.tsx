'use client';

import type { UsageBucket } from '@/lib/types';

interface UsageBreakdownProps {
  data: UsageBucket[];
}

export function UsageBreakdown({ data }: UsageBreakdownProps) {
  if (data.length === 0) return null;

  const totalRequests = data.reduce((sum, b) => sum + b.total_requests, 0);
  const totalErrors = data.reduce((sum, b) => sum + b.error_count, 0);
  const errorRate =
    totalRequests > 0
      ? ((totalErrors / totalRequests) * 100).toFixed(1)
      : '0.0';
  const errorRateNum = parseFloat(errorRate);

  const avgLatency =
    data.length > 0
      ? Math.round(
          data.reduce((sum, b) => sum + b.avg_duration_ms, 0) / data.length,
        )
      : 0;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Total Requests
        </p>
        <p className="mt-1 text-2xl font-semibold text-zinc-100">
          {totalRequests.toLocaleString()}
        </p>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Error Rate
        </p>
        <p
          className={`mt-1 text-2xl font-semibold ${
            errorRateNum > 5 ? 'text-red-400' : 'text-zinc-100'
          }`}
        >
          {errorRate}%
        </p>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Avg Latency
        </p>
        <p className="mt-1 text-2xl font-semibold text-zinc-100">
          {avgLatency}ms
        </p>
      </div>
    </div>
  );
}
