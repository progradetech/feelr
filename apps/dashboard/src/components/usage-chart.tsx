'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { UsageBucket } from '@/lib/types';

interface UsageChartProps {
  data: UsageBucket[];
  window: string;
}

function formatTimeBucket(value: string, window: string): string {
  try {
    const date = parseISO(value);
    switch (window) {
      case 'hour':
        return format(date, 'HH:mm');
      case 'day':
        return format(date, 'MMM dd');
      case 'month':
        return format(date, 'MMM yyyy');
      default:
        return format(date, 'MMM dd');
    }
  } catch {
    return value;
  }
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  window,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  window: string;
}) {
  if (!active || !payload || !label) return null;

  const bucket = payload[0]?.value !== undefined ? payload : [];

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-zinc-300">
        {formatTimeBucket(label, window)}
      </p>
      {bucket.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name === 'total_requests'
            ? 'Requests'
            : entry.name === 'error_count'
              ? 'Errors'
              : entry.name}
          : {entry.value}
        </p>
      ))}
    </div>
  );
}

export function UsageChart({ data, window }: UsageChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50">
        <p className="text-sm text-zinc-500">
          No usage data for this time range
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
          <XAxis
            dataKey="time_bucket"
            tickFormatter={(v: string) => formatTimeBucket(v, window)}
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            label={{
              value: 'Requests',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#71717a', fontSize: 12 },
            }}
          />
          <Tooltip
            content={<CustomTooltip window={window} />}
          />
          <Area
            type="monotone"
            dataKey="total_requests"
            stroke="#3b82f6"
            fill="#3b82f680"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="error_count"
            stroke="#ef4444"
            fill="#ef444440"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
