'use client';

import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface SparklineChartProps {
  hourly: Array<{ hour: string; count: number }>;
}

/**
 * Format an ISO hour string (e.g. "2026-02-07T14:00:00Z") to "14:00".
 */
function formatHour(hour: string): string {
  try {
    const date = new Date(hour);
    const h = date.getUTCHours().toString().padStart(2, '0');
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return hour;
  }
}

export default function SparklineChart({ hourly }: SparklineChartProps) {
  const chartData = hourly.map((item) => ({
    hour: formatHour(item.hour),
    count: item.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart
        data={chartData}
        margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
      >
        <defs>
          <linearGradient id="fillBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="hour"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#71717a', fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            color: '#fafafa',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#a1a1aa' }}
          formatter={(value: number) => [value.toLocaleString(), 'Requests']}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#fillBlue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
