'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  useUsage,
  useAvailableKeys,
  useAvailableConnectors,
} from '@/lib/hooks/use-usage';
import { UsageChart } from '@/components/usage-chart';
import { UsageBreakdown } from '@/components/usage-breakdown';

type WindowValue = 'hour' | 'day' | 'month';

interface TimePreset {
  label: string;
  window: WindowValue;
  id: string;
}

const TIME_PRESETS: TimePreset[] = [
  { label: 'Last Hour', window: 'hour', id: '1h' },
  { label: 'Last 24 Hours', window: 'hour', id: '24h' },
  { label: 'Last 7 Days', window: 'day', id: '7d' },
  { label: 'Last 30 Days', window: 'month', id: '30d' },
];

export default function UsagePage() {
  const [activePreset, setActivePreset] = useState('7d');
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [selectedConnector, setSelectedConnector] = useState<
    string | undefined
  >(undefined);

  const preset = TIME_PRESETS.find((p) => p.id === activePreset) || TIME_PRESETS[2];
  const { data, error, isLoading } = useUsage({
    key: selectedKey,
    connector: selectedConnector,
    window: preset.window,
  });

  const { data: availableKeys } = useAvailableKeys();
  const availableConnectors = useAvailableConnectors();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Monitor API request volume, error rates, and latency over time.
        </p>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Time window presets */}
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePreset(p.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activePreset === p.id
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Key filter */}
        <select
          value={selectedKey || ''}
          onChange={(e) =>
            setSelectedKey(e.target.value || undefined)
          }
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-600"
        >
          <option value="">All Keys</option>
          {availableKeys?.map((key) => (
            <option key={key.short_token} value={key.short_token}>
              {key.label || `fk_...${key.short_token}`}
            </option>
          ))}
        </select>

        {/* Connector filter */}
        <select
          value={selectedConnector || ''}
          onChange={(e) =>
            setSelectedConnector(e.target.value || undefined)
          }
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-600"
        >
          <option value="">All Connectors</option>
          {availableConnectors.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="h-[350px] animate-pulse rounded-lg bg-zinc-800/50" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-zinc-800/50"
              />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-400">
          Failed to load usage data. Please check your gateway connection and
          try again.
        </div>
      )}

      {/* Data states */}
      {!isLoading && !error && data && (
        <>
          {data.buckets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 py-16">
              <BarChart3 className="mb-3 h-10 w-10 text-zinc-600" />
              <p className="text-zinc-400">No usage data yet.</p>
              <p className="mt-1 text-sm text-zinc-500">
                Usage is recorded when API requests are made through Feelr.
              </p>
            </div>
          ) : (
            <>
              <UsageChart
                data={data.buckets}
                window={data.window || preset.window}
              />
              <UsageBreakdown data={data.buckets} />
            </>
          )}
        </>
      )}
    </div>
  );
}
