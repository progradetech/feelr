'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';
import { gatewayMutate } from '@/lib/api';
import { useBillingStatus } from '@/lib/hooks/use-billing-status';
import { useBilling } from '@/lib/hooks/use-billing';
import { PLANS } from '@/lib/billing-plans';
import { UsageBar } from '@/components/usage-bar';
import { PlanCard } from '@/components/plan-card';
import { UpgradePrompt } from '@/components/upgrade-prompt';
import { useDemo } from '@/lib/demo-context';

function BillingPageSkeleton() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="h-8 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="h-28 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        <div className="h-64 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        <div className="h-64 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
      </div>
    </div>
  );
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const { data: billing } = useBilling();
  const { data, error, isLoading, mutate } = useBillingStatus();
  const { isDemo } = useDemo();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const isSelfHosted = billing?.mode === 'self-hosted';

  // Post-checkout return detection
  const checkoutParam = searchParams.get('checkout');
  useEffect(() => {
    if (checkoutParam === 'success') {
      toast.success('Plan upgraded successfully!');
      window.history.replaceState({}, '', '/billing');
      // Re-fetch billing status after Stripe webhook processes
      setTimeout(() => mutate(), 3000);
    } else if (checkoutParam === 'cancel') {
      toast.error('Checkout cancelled.');
      window.history.replaceState({}, '', '/billing');
    }
  }, [checkoutParam, mutate]);

  async function handleCheckout(plan: string) {
    if (isDemo) {
      toast.info('Demo mode: checkout not available');
      return;
    }
    setLoadingPlan(plan);
    try {
      const result = await gatewayMutate<{ url: string }>(
        '/admin/billing/checkout',
        'POST',
        { plan },
      );
      window.location.href = result.url;
      // Don't reset loading -- redirect will unmount component
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
      setLoadingPlan(null);
    }
  }

  async function handlePortal() {
    if (isDemo) {
      toast.info('Demo mode: billing portal not available');
      return;
    }
    setPortalLoading(true);
    try {
      const result = await gatewayMutate<{ url: string }>(
        '/admin/billing/portal',
        'POST',
      );
      window.location.href = result.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open billing portal');
      setPortalLoading(false);
    }
  }

  function handlePlanAction(planId: string) {
    if (!data) return;
    // Free user selecting a paid plan: go through Checkout
    if (data.plan === 'hatchling' && planId !== 'hatchling') {
      handleCheckout(planId);
    } else {
      // Paid user changing plans: direct to Customer Portal
      handlePortal();
    }
  }

  function scrollToPlans() {
    document.getElementById('plan-cards')?.scrollIntoView({ behavior: 'smooth' });
  }

  // Self-hosted guard
  if (isSelfHosted) {
    return (
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Billing</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your subscription and usage.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">
            Billing is not available in self-hosted mode.
          </p>
          <a
            href="/overview"
            className="mt-3 inline-block text-sm text-emerald-400 hover:text-emerald-300"
          >
            Back to Overview
          </a>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return <BillingPageSkeleton />;
  }

  // Error state
  if (error || !data) {
    return (
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Billing</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your subscription and usage.
          </p>
        </div>
        <div className="rounded-md border border-red-800 bg-red-900/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-400">
              Failed to load billing data.
            </p>
            <button
              onClick={() => mutate()}
              className="rounded-md bg-red-900/50 px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/80"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const usagePercentage = (data.usage / data.limit) * 100;
  const hasOveragePlans = PLANS.some((p) => p.overage !== null);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your subscription and usage.
        </p>
      </div>

      {/* Usage section */}
      <UsageBar
        usage={data.usage}
        limit={data.limit}
        billingCycleEnd={data.billing_cycle_end}
      />

      {/* Upgrade prompt */}
      <div className="mt-4">
        <UpgradePrompt percentage={usagePercentage} onUpgrade={scrollToPlans} />
      </div>

      {/* Plan comparison section */}
      <div id="plan-cards" className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Choose Your Plan
        </h2>
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={data.plan}
              isCurrentPlan={plan.id === data.plan}
              isPaidUser={data.plan !== 'hatchling'}
              onSelect={handlePlanAction}
              isLoading={loadingPlan === plan.id}
            />
          ))}
        </div>
      </div>

      {/* Manage Billing section */}
      <div className="mt-8 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-zinc-400" />
          <p className="text-sm text-zinc-400">
            Manage invoices, payment methods, and cancellation
          </p>
        </div>
        <button
          type="button"
          onClick={handlePortal}
          disabled={portalLoading}
          className="rounded-lg bg-zinc-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-zinc-600 disabled:opacity-50"
        >
          {portalLoading ? 'Loading...' : 'Manage Billing'}
        </button>
      </div>

      {/* Overage footnote */}
      {hasOveragePlans && (
        <p className="mt-4 text-xs text-zinc-600">
          * Requests exceeding the monthly quota will be blocked. Contact support
          for custom overage pricing.
        </p>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageSkeleton />}>
      <BillingPageContent />
    </Suspense>
  );
}
