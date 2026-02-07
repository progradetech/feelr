'use client';

import { Key, Plug, Activity } from 'lucide-react';
import { useOverview } from '@/lib/hooks/use-overview';
import dynamic from 'next/dynamic';
import type { OverviewData } from '@/lib/types';

/**
 * Recharts components loaded dynamically to avoid SSR issues with static export.
 * Recharts uses browser APIs internally, so we need to ensure client-only rendering.
 */
const SparklineChart = dynamic(() => import('./sparkline-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] animate-pulse rounded-lg bg-zinc-800/50" />
  ),
});

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
}

function SummaryCard({ icon, label, value, subtitle }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-800">
          {icon}
        </div>
        <div>
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && (
            <p className="text-xs text-zinc-500">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="h-24 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
  );
}

export default function OverviewPage() {
  const { data, error, isLoading, mutate } = useOverview();

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Dashboard summary of your Feelr gateway.
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-400">
              Failed to load overview: {error.message}
            </p>
            <button
              onClick={() => mutate()}
              className="rounded-md bg-red-900/50 px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/80"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {isLoading ? (
          <>
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
          </>
        ) : data ? (
          <>
            <SummaryCard
              icon={<Key className="h-5 w-5 text-zinc-300" />}
              label="Total API Keys"
              value={data.total_keys}
            />
            <SummaryCard
              icon={<Plug className="h-5 w-5 text-zinc-300" />}
              label="Connected Services"
              value={data.connected_services}
              subtitle={`of 4 connectors`}
            />
            <SummaryCard
              icon={<Activity className="h-5 w-5 text-zinc-300" />}
              label="Requests (24h)"
              value={data.recent_usage.total_24h.toLocaleString()}
            />
          </>
        ) : null}
      </div>

      {/* Sparkline section */}
      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <p className="text-sm text-zinc-400">Last 24 hours</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {isLoading ? (
            <div className="h-[200px] animate-pulse rounded-lg bg-zinc-800/50" />
          ) : data ? (
            <SparklineContent data={data} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SparklineContent({ data }: { data: OverviewData }) {
  if (!data.recent_usage.hourly || data.recent_usage.hourly.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-sm text-zinc-500">No usage data yet</p>
      </div>
    );
  }

  return <SparklineChart hourly={data.recent_usage.hourly} />;
}
