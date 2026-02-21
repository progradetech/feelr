'use client';

import { Loader2 } from 'lucide-react';
import type { PlanDefinition } from '@/lib/billing-plans';

interface PlanCardProps {
  plan: PlanDefinition;
  currentPlan: string;
  isCurrentPlan: boolean;
  onSelect: (planId: string) => void;
  isLoading: boolean;
  isPaidUser: boolean;
}

export function PlanCard({
  plan,
  currentPlan,
  isCurrentPlan,
  onSelect,
  isLoading,
  isPaidUser,
}: PlanCardProps) {
  const isFeatured = plan.featured;

  const cardClasses = isFeatured
    ? 'rounded-xl border border-emerald-600/50 bg-zinc-900 p-6 relative scale-105 shadow-lg shadow-emerald-900/20 z-10'
    : 'rounded-xl border border-zinc-800 bg-zinc-900 p-6 relative';

  // Determine CTA button state
  const showUpgrade = !isCurrentPlan && !isPaidUser && plan.id !== 'hatchling';
  const showManage = !isCurrentPlan && isPaidUser && plan.id !== 'hatchling';
  const showCurrentBadge = isCurrentPlan;

  return (
    <div className={cardClasses}>
      {isFeatured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
          Recommended
        </span>
      )}

      <h3 className="text-xl font-bold text-white">{plan.name}</h3>

      <div className="mt-3">
        {plan.price === 0 ? (
          <p className="text-3xl font-bold text-white">Free</p>
        ) : (
          <p className="text-3xl font-bold text-white">
            ${plan.price}
            <span className="text-base font-normal text-zinc-400">/mo</span>
          </p>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-sm text-zinc-400">
          {plan.quota.toLocaleString()} requests/mo
        </p>
        <p className="text-sm text-zinc-400">{plan.rateLimit}</p>
        {plan.overage && (
          <p className="text-xs text-zinc-500">{plan.overage}</p>
        )}
      </div>

      <div className="mt-6">
        {showCurrentBadge && (
          <span className="block w-full cursor-default rounded-lg bg-zinc-800 py-2.5 text-center text-sm font-medium text-zinc-400">
            Current Plan
          </span>
        )}

        {showUpgrade && (
          <button
            type="button"
            onClick={() => onSelect(plan.id)}
            disabled={isLoading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              'Upgrade'
            )}
          </button>
        )}

        {showManage && (
          <button
            type="button"
            onClick={() => onSelect(plan.id)}
            disabled={isLoading}
            className="w-full rounded-lg bg-zinc-700 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-600 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              'Manage Subscription'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
