'use client';

import { differenceInDays, format } from 'date-fns';

interface UsageBarProps {
  usage: number;
  limit: number;
  billingCycleEnd: string;
}

export function UsageBar({ usage, limit, billingCycleEnd }: UsageBarProps) {
  const percentage = Math.min((usage / limit) * 100, 100);
  const endDate = new Date(billingCycleEnd);
  const daysRemaining = differenceInDays(endDate, new Date());

  let barColor = 'bg-emerald-500';
  let textColor = 'text-zinc-400';
  if (percentage >= 90) {
    barColor = 'bg-red-500';
    textColor = 'text-red-400';
  } else if (percentage >= 75) {
    barColor = 'bg-amber-500';
    textColor = 'text-amber-400';
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm font-medium text-white">Monthly Usage</p>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className={`mt-2 text-sm ${textColor}`}>
        {usage.toLocaleString()} / {limit.toLocaleString()} requests ({percentage.toFixed(1)}%)
      </p>

      <p className="mt-1 text-xs text-zinc-500">
        Resets {format(endDate, 'MMM d')} ({daysRemaining} days)
      </p>
    </div>
  );
}
