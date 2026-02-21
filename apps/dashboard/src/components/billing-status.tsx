'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { useBilling } from '@/lib/hooks/use-billing';

export function BillingStatus() {
  const { data, isLoading, error } = useBilling();

  // Loading state
  if (isLoading) {
    return (
      <div className="h-16 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
    );
  }

  // Error state: silently degrade (billing is informational)
  if (error || !data) {
    return null;
  }

  // Self-hosted mode
  if (data.mode === 'self-hosted') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
        <CreditCard className="h-5 w-5 text-emerald-400" />
        <span className="text-sm font-medium text-emerald-400">
          Self-hosted (Unlimited)
        </span>
      </div>
    );
  }

  // Cloud mode
  const planName = data.plan
    ? data.plan.charAt(0).toUpperCase() + data.plan.slice(1)
    : 'Unknown';
  const isHatchling = data.plan === 'hatchling';

  // Cloud mode -- clickable, links to billing page
  return (
    <Link href="/billing" className="block">
      <div className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-800">
            <CreditCard className="h-5 w-5 text-zinc-300" />
          </div>
          <div>
            <p className="text-sm text-zinc-400">Current Plan</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-white">{planName}</p>
              {isHatchling && (
                <span className="rounded-full bg-emerald-900/30 px-2 py-0.5 text-xs text-emerald-400">
                  Free
                </span>
              )}
            </div>
          </div>
        </div>
        {data.quota_limit !== null && (
          <p className="text-sm text-zinc-400">
            {data.quota_limit.toLocaleString()} requests/mo
          </p>
        )}
      </div>
    </Link>
  );
}
