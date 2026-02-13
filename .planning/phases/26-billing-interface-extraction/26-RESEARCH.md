# Phase 26: Billing Interface Extraction - Research

**Researched:** 2026-02-13
**Domain:** TypeScript provider/strategy pattern, Hono middleware refactoring, pnpm monorepo package extraction, Stripe SDK decoupling
**Confidence:** HIGH

## Summary

Phase 26 extracts all Stripe billing logic from the gateway into a pluggable provider interface so the public open-source repo has zero Stripe dependencies. The current codebase has a cleanly scoped billing surface: 4 files in `apps/gateway/src/billing/` (plan-enforcer.ts, meter.ts, stripe-client.ts, types.ts) totaling ~150 lines, one `stripe` npm dependency in gateway's package.json, and two Stripe-related bindings in AppEnv (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). The plan-enforcer middleware already has a no-op path when `billing.enabled` is false, which provides a natural seam for extraction.

The dashboard currently has NO billing-specific UI components. There are no pricing pages, subscription management pages, or billing-specific usage meters. The sidebar navigation has four items (Overview, Keys, Connectors, Usage) with no billing entry. The usage charts show API request analytics, not billing meters. This means BILL-05 (extract dashboard billing UI) is effectively satisfied by the current state -- there is nothing to extract. The planner should verify this and create a simple validation task rather than a complex extraction.

The critical distinction that must not be confused: `@feelr/connector-stripe` (in `connectors/stripe/`) is the **Stripe API connector** that lets users manage their Stripe resources (customers, payments, invoices) through Feelr. This stays in the public repo. The **billing** code (in `apps/gateway/src/billing/`) is Feelr's own internal billing system that uses Stripe to charge Feelr users. Only the billing code moves out.

**Primary recommendation:** Define a `BillingProvider` interface with `enforceQuota()` and `recordUsage()` methods, implement `NoopBillingProvider` as the default, refactor `plan-enforcer.ts` to delegate to the provider, move all Stripe-specific code into a self-contained module that can be deleted without breaking the build, remove the `stripe` npm dependency, and write a boundary check script.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.11.7 | Web framework -- middleware where billing hooks in | Already in use; createMiddleware factory for provider-based middleware |
| typescript | ^5.7.0 | Type system for interface contracts | Already in use; interface + type-only imports for clean boundaries |
| vitest | ~3.2.0 | Testing provider implementations | Already in use; @cloudflare/vitest-pool-workers for gateway tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| stripe | ^20.3.1 | Stripe API calls for billing metering | Only in StripeBillingProvider module (cloud-only, NOT in public gateway package.json) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Simple interface + factory | Full DI container (tsyringe, inversify) | Overkill for single provider swap; the gateway already uses manual wiring in factory.ts and self-hosted-entry.ts -- keep consistent |
| Provider on AppEnv bindings | Global singleton registry | Bindings approach matches existing patterns (RateLimiter, KeyValueStore, etc.) and works with Cloudflare Workers isolate model |
| Interface in gateway core | Interface in shared package | Interface is gateway-internal; no other app needs it. Keep in `apps/gateway/src/billing/` |

**Installation:**
```bash
# No new dependencies needed for the public repo
# The stripe dependency is REMOVED from apps/gateway/package.json
pnpm remove stripe --filter @feelr/gateway
```

## Architecture Patterns

### Current Billing Code Map

```
apps/gateway/
  src/
    billing/
      types.ts            # BillingPlan, PlanLimits, PLAN_LIMITS, CustomerBilling
      stripe-client.ts    # createStripeClient(), webCrypto (Stripe SDK import)
      meter.ts            # recordMeterEvent(), createStripeClientFromEnv() (Stripe SDK import)
      plan-enforcer.ts    # planEnforcer() middleware (imports from meter.ts, types.ts)
    app.ts                # Imports planEnforcer, mounts as middleware on /v1/*
    lib/types.ts          # AppEnv with STRIPE_SECRET_KEY?, STRIPE_WEBHOOK_SECRET?
  package.json            # "stripe": "^20.3.1" in dependencies
```

### Target Architecture After Extraction

```
apps/gateway/
  src/
    billing/
      types.ts            # BillingPlan, PlanLimits, PLAN_LIMITS, CustomerBilling (STAYS)
      provider.ts         # NEW: BillingProvider interface + NoopBillingProvider
      middleware.ts        # NEW: billingMiddleware() that delegates to provider
      stripe/             # NEW directory: all Stripe-specific code isolated
        index.ts          # StripeBillingProvider implementation
        stripe-client.ts  # MOVED: createStripeClient(), webCrypto
        meter.ts          # MOVED: recordMeterEvent()
    app.ts                # Imports billingMiddleware (no Stripe knowledge)
    lib/types.ts          # AppEnv gains BillingProvider?, loses direct Stripe refs
  package.json            # stripe REMOVED from dependencies
```

### Pattern 1: BillingProvider Interface

**What:** A strategy interface that the gateway calls without knowing the implementation.
**When to use:** Any operation that currently touches Stripe directly.

```typescript
// apps/gateway/src/billing/provider.ts

import type { CustomerBilling, BillingPlan, PlanLimits } from './types'

/**
 * Result of a quota enforcement check.
 */
export interface QuotaResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean
  /** If denied, the billing plan that hit its limit */
  plan?: BillingPlan
  /** If denied, the limit that was exceeded */
  limit?: number
}

/**
 * Pluggable billing provider interface.
 *
 * Implementations:
 * - NoopBillingProvider: always allows, never records (public/self-hosted)
 * - StripeBillingProvider: enforces quotas via KV, records to Stripe meters (cloud)
 */
export interface BillingProvider {
  /**
   * Check whether the current request is within the user's billing quota.
   * Called BEFORE the request is processed.
   *
   * @param apiKeyShort - Short token identifying the API key
   * @param kvGet - Function to read billing state from KV
   * @returns QuotaResult indicating whether to proceed or deny
   */
  enforceQuota(
    apiKeyShort: string,
    kvGet: (key: string) => Promise<CustomerBilling | null>,
  ): Promise<QuotaResult>

  /**
   * Record a successful API call for billing purposes.
   * Called AFTER the request succeeds. Must be best-effort (never throw).
   *
   * @param apiKeyShort - Short token identifying the API key
   * @param billing - Current billing state (may be null for free tier)
   * @param customerId - Stripe customer ID (if available)
   * @param kvPut - Function to update billing state in KV
   */
  recordUsage(
    apiKeyShort: string,
    billing: CustomerBilling | null,
    customerId: string | undefined,
    kvPut: (key: string, value: string) => Promise<void>,
  ): Promise<void>
}
```

### Pattern 2: NoopBillingProvider (Ships in Public Repo)

**What:** Default provider that allows all requests and records nothing.
**When to use:** Self-hosted deployments and public repo default.

```typescript
// apps/gateway/src/billing/provider.ts (continued)

import type { BillingProvider, QuotaResult } from './provider'
import type { CustomerBilling } from './types'

/**
 * No-op billing provider. Always allows requests, never records usage.
 * This is the default for self-hosted deployments and the public repo.
 */
export class NoopBillingProvider implements BillingProvider {
  async enforceQuota(): Promise<QuotaResult> {
    return { allowed: true }
  }

  async recordUsage(): Promise<void> {
    // Intentionally empty -- no billing in self-hosted mode
  }
}
```

### Pattern 3: Billing Middleware Refactor

**What:** Replace direct `planEnforcer()` with provider-delegating middleware.
**When to use:** The middleware registered on `/v1/*` in app.ts.

```typescript
// apps/gateway/src/billing/middleware.ts

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { NoopBillingProvider } from './provider'
import type { BillingProvider } from './provider'

/**
 * Billing middleware factory.
 *
 * Delegates to the BillingProvider on the environment bindings.
 * Falls back to NoopBillingProvider if none is registered.
 */
export function billingMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const provider: BillingProvider = c.env.BILLING_PROVIDER ?? new NoopBillingProvider()

    const apiKeyRecord = c.get('apiKeyRecord')
    if (!apiKeyRecord) {
      return next()
    }

    const apiKeyShort = apiKeyRecord.shortToken

    // Enforce quota
    const result = await provider.enforceQuota(
      apiKeyShort,
      async (key) => c.env.AUTH_KV.get<CustomerBilling>(key, 'json'),
    )

    if (!result.allowed) {
      throw new FeelrError('PLAN_QUOTA_EXCEEDED', {
        message: `Monthly API quota exceeded for ${result.plan} plan (${result.limit?.toLocaleString()} calls/month). Upgrade your plan for higher limits.`,
        hint: 'abort',
        status: 402,
      })
    }

    await next()

    // Record usage (best-effort, non-blocking)
    const billing = await c.env.AUTH_KV.get<CustomerBilling>(`billing:${apiKeyShort}`, 'json')
    const customerId = billing?.stripeCustomerId ?? apiKeyRecord.stripeCustomerId

    c.executionCtx.waitUntil(
      provider.recordUsage(
        apiKeyShort,
        billing,
        customerId,
        async (key, value) => { await c.env.AUTH_KV.put(key, value) },
      ).catch(() => {
        // Best-effort: silently swallow errors
      })
    )
  })
}
```

### Pattern 4: Provider Registration via AppEnv Bindings

**What:** Add `BILLING_PROVIDER` to AppEnv bindings, set in entry points.
**When to use:** Cloud entry point registers StripeBillingProvider; self-hosted uses default (undefined = Noop).

```typescript
// In lib/types.ts -- add to AppEnv.Bindings:
import type { BillingProvider } from '../billing/provider'

// Add to Bindings interface:
/** Billing provider (undefined = NoopBillingProvider) */
BILLING_PROVIDER?: BillingProvider
```

```typescript
// In index.ts (cloud entry) -- StripeBillingProvider registered:
import { StripeBillingProvider } from './billing/stripe'

// In createCloudBindings():
BILLING_PROVIDER: rawEnv.STRIPE_SECRET_KEY
  ? new StripeBillingProvider(rawEnv.STRIPE_SECRET_KEY)
  : undefined,
```

### Pattern 5: StripeBillingProvider (Cloud-Only Module)

**What:** Isolated module containing all Stripe SDK usage.
**When to use:** Only in cloud deployment; can be deleted without breaking build.

```typescript
// apps/gateway/src/billing/stripe/index.ts

import Stripe from 'stripe'
import type { BillingProvider, QuotaResult } from '../provider'
import type { CustomerBilling } from '../types'
import { PLAN_LIMITS } from '../types'
import { createStripeClient } from './stripe-client'
import { recordMeterEvent } from './meter'

/**
 * Stripe-backed billing provider for cloud deployments.
 *
 * Enforces monthly API quotas from KV-cached billing state and
 * records usage events to Stripe Billing Meters.
 */
export class StripeBillingProvider implements BillingProvider {
  private stripe: Stripe

  constructor(secretKey: string) {
    this.stripe = createStripeClient(secretKey)
  }

  async enforceQuota(
    apiKeyShort: string,
    kvGet: (key: string) => Promise<CustomerBilling | null>,
  ): Promise<QuotaResult> {
    const billingKey = `billing:${apiKeyShort}`
    let billing: CustomerBilling | null = null
    try {
      billing = await kvGet(billingKey)
    } catch {
      // KV read failed -- allow request (best-effort)
      return { allowed: true }
    }

    const plan = billing?.plan ?? 'hatchling'
    const currentUsage = billing?.currentMonthUsage ?? 0
    const limits = PLAN_LIMITS[plan]

    if (currentUsage >= limits.api_calls_per_month) {
      return {
        allowed: false,
        plan,
        limit: limits.api_calls_per_month,
      }
    }

    return { allowed: true }
  }

  async recordUsage(
    apiKeyShort: string,
    billing: CustomerBilling | null,
    customerId: string | undefined,
    kvPut: (key: string, value: string) => Promise<void>,
  ): Promise<void> {
    // Record Stripe meter event
    if (customerId) {
      await recordMeterEvent(this.stripe, customerId)
    }

    // Increment cached usage in KV
    if (billing) {
      const updated: CustomerBilling = {
        ...billing,
        currentMonthUsage: billing.currentMonthUsage + 1,
      }
      await kvPut(`billing:${apiKeyShort}`, JSON.stringify(updated)).catch(() => {})
    }
  }
}
```

### Anti-Patterns to Avoid

- **Confusing connector-stripe with billing-stripe:** The `@feelr/connector-stripe` package (connectors/stripe/) is the user-facing Stripe connector that stays PUBLIC. The billing code (apps/gateway/src/billing/) is Feelr's internal billing that moves to cloud-only. These must be treated as completely separate concerns.
- **Importing from gateway core in StripeBillingProvider:** The StripeBillingProvider must only import from `billing/types.ts` (which contains pure types like BillingPlan, PlanLimits) and from within its own `stripe/` directory. It must NOT import from `lib/types.ts`, `lib/errors.ts`, or any other gateway module.
- **Leaving Stripe type references in gateway core:** Even `import type Stripe from 'stripe'` in a core file would require the stripe package to be installed for type resolution. Use dependency-free types in the interface.
- **Creating a separate npm package for the provider interface:** The interface lives in gateway core (`billing/provider.ts`). Creating a separate `@feelr/billing-sdk` package adds unnecessary indirection. The cloud repo will import directly from the oss gateway source via the git subtree.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider pattern | Custom event emitter / hook system | TypeScript interface + class implementations | Simple, type-safe, zero dependencies, matches existing patterns in codebase (KeyValueStore, RateLimiter interfaces) |
| Stripe SDK initialization | Custom fetch wrapper for Stripe API | `stripe` npm package (in cloud module only) | Stripe SDK handles auth, retries, Worker-compatible fetch, API versioning |
| Boundary checking | Manual code review | Automated grep/script that fails CI | Humans miss imports; a script that greps for `stripe`, `STRIPE_SECRET_KEY` outside allowed paths is deterministic |
| Middleware delegation | Multiple conditional middleware | Single middleware + provider interface | One middleware, swappable behavior. Matches how rate limiting already works via RateLimiter interface |

**Key insight:** The gateway already uses the provider/adapter pattern extensively -- `KeyValueStore`, `UsageDatabase`, `RateLimiter`, `TokenCoordinatorClient` are all interfaces with platform-specific implementations. BillingProvider follows exactly the same pattern. Do not introduce a new architectural pattern.

## Common Pitfalls

### Pitfall 1: Type Resolution Breakage After Removing stripe Package
**What goes wrong:** After removing `stripe` from gateway's package.json, TypeScript compilation fails because some file still has `import type { Stripe } from 'stripe'` or references a Stripe type transitively.
**Why it happens:** TypeScript needs the package installed to resolve `import type` statements, even though no runtime code uses the package. Types from the Stripe package may have leaked into billing/types.ts or other shared files.
**How to avoid:** (1) Ensure `billing/types.ts` contains ONLY pure TypeScript types with zero external imports. Currently it imports `RateLimitTier` from `auth/types.ts` which is fine. (2) The `BillingProvider` interface must NOT reference any Stripe types. (3) After removing the package, run `pnpm typecheck --filter @feelr/gateway` and verify zero errors.
**Warning signs:** Any `import ... from 'stripe'` (including `import type`) outside the `billing/stripe/` directory.

### Pitfall 2: Breaking the plan-enforcer's No-Op Path
**What goes wrong:** The refactored billing middleware changes the no-op behavior (when billing is disabled) in a subtle way that breaks existing tests. For example, the current code checks `c.env.FEELR_CONFIG?.billing?.enabled` before doing anything. If the new middleware delegates to NoopBillingProvider differently, the timing or behavior of `next()` calls could change.
**Why it happens:** The current plan-enforcer has TWO separate no-op paths: (1) `billing.enabled === false` short-circuits entirely, and (2) no `apiKeyRecord` short-circuits. The refactored version must preserve both paths.
**How to avoid:** Run ALL existing gateway tests after refactoring. The test suite (`apps/gateway/src/__tests__/`) exercises the full middleware chain. If any test regresses, the middleware changed behavior.
**Warning signs:** Tests that previously passed now failing with unexpected 402 responses or missing response headers.

### Pitfall 3: Circular Dependency Between Provider and Types
**What goes wrong:** `provider.ts` imports from `types.ts`, and `types.ts` is modified to import from `provider.ts`, creating a circular dependency.
**Why it happens:** Someone tries to add `BillingProvider` to the `FeelrConfig` interface (in runtime/interfaces.ts) or to the types file.
**How to avoid:** Keep the dependency graph linear: `provider.ts` -> `types.ts` -> `auth/types.ts`. The `BillingProvider` type goes on `AppEnv.Bindings` in `lib/types.ts`, imported from `billing/provider.ts`. Never put provider types in `billing/types.ts`.
**Warning signs:** TypeScript errors about type circularities, or `import type` statements forming a cycle.

### Pitfall 4: Factory.ts Coupling to Stripe
**What goes wrong:** The `createCloudBindings()` function in `runtime/factory.ts` directly imports and instantiates `StripeBillingProvider`, making the factory dependent on the stripe package.
**Why it happens:** The natural place to create the provider is in the factory, but the factory is gateway core code that ships in the public repo.
**How to avoid:** The factory should NOT create a StripeBillingProvider. Instead: (1) For the public repo, factory creates no billing provider (undefined = Noop), (2) For cloud deployment, the cloud entry point (Phase 27's `gateway-entry.ts`) creates and injects the StripeBillingProvider into the env before passing to the app. This matches Phase 27's architecture where the cloud entry point wraps the OSS app.
**Warning signs:** An `import` of anything from `billing/stripe/` in `runtime/factory.ts`.

### Pitfall 5: Forgetting STRIPE_WEBHOOK_SECRET Cleanup
**What goes wrong:** STRIPE_SECRET_KEY is removed from AppEnv but STRIPE_WEBHOOK_SECRET remains as a vestigial binding.
**Why it happens:** Focus on the billing flow (plan-enforcer, meter) causes the webhook secret to be overlooked since it's not used by any current code but is declared in the AppEnv type.
**How to avoid:** Remove both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from AppEnv.Bindings. Neither should exist in the public gateway's type definition. The cloud overlay will add them back in its own extended type.
**Warning signs:** `STRIPE_WEBHOOK_SECRET` appearing in `lib/types.ts` after the refactor.

### Pitfall 6: Boundary Check Script Missing Connector-Stripe Exclusion
**What goes wrong:** The boundary check script flags `connectors/stripe/` as a violation because it contains the word "stripe" and references like `sk_test_*`.
**Why it happens:** The script naively searches the entire repo for "stripe" without understanding the distinction between connector-stripe (user-facing, stays public) and billing-stripe (internal, extracted).
**How to avoid:** The boundary check must explicitly exclude: `apps/gateway/src/billing/stripe/` (the extracted module), `connectors/stripe/` (the Stripe connector package), test files, documentation, and `.planning/`. It should only flag violations in: `apps/gateway/src/` (minus `billing/stripe/`), `apps/gateway/package.json`, `apps/dashboard/src/`.
**Warning signs:** False positives from the connector-stripe package causing the check to always fail.

## Code Examples

### Boundary Check Script

```bash
#!/usr/bin/env bash
# scripts/check-billing-boundary.sh
# Verifies no Stripe/billing leaks exist outside designated modules.
# Exit 0 = clean, Exit 1 = violations found.

set -euo pipefail

VIOLATIONS=0

echo "=== Billing Boundary Check ==="

# 1. Check gateway package.json for stripe dependency
if grep -q '"stripe"' apps/gateway/package.json 2>/dev/null; then
  echo "FAIL: apps/gateway/package.json contains 'stripe' dependency"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# 2. Check gateway source (excluding billing/stripe/ directory) for stripe imports
STRIPE_IMPORTS=$(grep -rn "from 'stripe'\|from \"stripe\"\|require('stripe')\|require(\"stripe\")" \
  apps/gateway/src/ \
  --include='*.ts' \
  --exclude-dir='billing/stripe' \
  --exclude-dir='__tests__' \
  2>/dev/null || true)

if [ -n "$STRIPE_IMPORTS" ]; then
  echo "FAIL: Stripe imports found outside billing/stripe/:"
  echo "$STRIPE_IMPORTS"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# 3. Check for STRIPE_SECRET_KEY references in gateway core types
STRIPE_KEY_REFS=$(grep -rn "STRIPE_SECRET_KEY\|STRIPE_WEBHOOK_SECRET" \
  apps/gateway/src/lib/ \
  apps/gateway/src/runtime/ \
  apps/gateway/src/middleware/ \
  apps/gateway/src/routes/ \
  --include='*.ts' \
  2>/dev/null || true)

if [ -n "$STRIPE_KEY_REFS" ]; then
  echo "FAIL: STRIPE key references in gateway core:"
  echo "$STRIPE_KEY_REFS"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# 4. Check dashboard for any stripe/billing imports
DASHBOARD_STRIPE=$(grep -rn "stripe\|billing\|subscription\|pricing" \
  apps/dashboard/src/ \
  --include='*.ts' --include='*.tsx' \
  -i \
  2>/dev/null | \
  grep -v 'node_modules' | \
  grep -v 'Stripe SDK complexity' | \
  grep -v '// ' | \
  grep -v 'connector.*stripe' || true)

# Note: "Stripe SDK complexity" is a marketing string on the landing page
# connector-related stripe references are the user-facing Stripe connector

if [ -n "$DASHBOARD_STRIPE" ]; then
  echo "WARN: Possible billing references in dashboard (review manually):"
  echo "$DASHBOARD_STRIPE"
fi

echo ""
if [ "$VIOLATIONS" -eq 0 ]; then
  echo "PASS: No billing boundary violations found"
  exit 0
else
  echo "FAIL: $VIOLATIONS violation(s) found"
  exit 1
fi
```

### Refactored app.ts Import

```typescript
// Before (current):
import { planEnforcer } from './billing/plan-enforcer'
app.use('/v1/*', planEnforcer())

// After (refactored):
import { billingMiddleware } from './billing/middleware'
app.use('/v1/*', billingMiddleware())
```

### Removing stripe from gateway package.json

```bash
# Remove the stripe dependency
cd apps/gateway
pnpm remove stripe

# Verify typecheck still passes (critical!)
pnpm typecheck --filter @feelr/gateway

# Verify all tests still pass
pnpm test --filter @feelr/gateway
```

### Verifying StripeBillingProvider Isolation

```bash
# The billing/stripe/ directory should be deletable without breaking the build
# Test by temporarily renaming it and running typecheck
mv apps/gateway/src/billing/stripe apps/gateway/src/billing/stripe.bak
pnpm typecheck --filter @feelr/gateway
# Should pass -- if it fails, there's a leak
mv apps/gateway/src/billing/stripe.bak apps/gateway/src/billing/stripe
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Conditional code paths (`if billing.enabled`) | Provider interface + strategy pattern | Industry standard | Cleaner separation, testable, no dead code paths in production |
| Stripe SDK in main package | Stripe SDK in isolated optional module | Open-source billing extraction pattern | Enables MIT-licensed core with commercial overlay |
| Gateway types include all provider bindings | Gateway types use optional provider interface | Phase 26 change | AppEnv stays clean; providers inject themselves |

**Relevant patterns in existing codebase:**
- `KeyValueStore` interface in `runtime/interfaces.ts` with `CloudflareKvAdapter` and `SelfHostedKvAdapter` -- exact same pattern for BillingProvider
- `RateLimiter` interface with `CloudflareRateLimiterAdapter` and `InMemoryRateLimiter` -- same dependency inversion
- `TokenCoordinatorClient` interface -- same abstraction approach
- Connector registry (`connectors/registry.ts`) -- similar pluggable registration pattern

## Key Codebase Findings

### Billing Surface Area (Complete Inventory)

| File | Stripe Dependency | What It Does | Extraction Action |
|------|-------------------|--------------|-------------------|
| `billing/plan-enforcer.ts` | YES (imports from meter.ts) | Middleware: quota check + meter recording | REFACTOR into billing/middleware.ts using provider interface |
| `billing/meter.ts` | YES (imports Stripe SDK) | recordMeterEvent(), createStripeClientFromEnv() | MOVE into billing/stripe/meter.ts |
| `billing/stripe-client.ts` | YES (imports Stripe SDK) | createStripeClient(), webCrypto | MOVE into billing/stripe/stripe-client.ts |
| `billing/types.ts` | NO (pure types) | BillingPlan, PlanLimits, PLAN_LIMITS, CustomerBilling | STAYS in gateway core (shared between providers) |
| `app.ts` | NO (imports planEnforcer) | Mounts billing middleware on /v1/* | CHANGE import to billing/middleware.ts |
| `lib/types.ts` | NO (type definitions) | AppEnv with STRIPE_SECRET_KEY?, STRIPE_WEBHOOK_SECRET? | REMOVE Stripe bindings, ADD BillingProvider? |
| `auth/types.ts` | NO (type definitions) | ApiKeyRecord with stripeCustomerId? | KEEP stripeCustomerId (used by billing provider via interface) |
| `runtime/factory.ts` | NO | createCloudBindings() -- currently no billing | ADD BILLING_PROVIDER: undefined (cloud overlay adds Stripe) |
| `self-hosted-entry.ts` | NO | buildAdaptedEnv() -- currently no billing | NO CHANGE (Noop is the default when undefined) |

### Dashboard Billing Surface Area

| Component | Billing-Specific? | Action |
|-----------|-------------------|--------|
| `usage/page.tsx` | NO -- shows API request analytics | KEEP (this is operational usage, not billing) |
| `usage-chart.tsx` | NO -- generic area chart | KEEP |
| `usage-breakdown.tsx` | NO -- total requests, error rate, latency | KEEP |
| `overview/page.tsx` | NO -- keys, connectors, 24h usage | KEEP |
| `sidebar.tsx` | NO -- no billing/pricing nav items | KEEP |
| Pricing page | DOES NOT EXIST | Nothing to extract |
| Subscription management | DOES NOT EXIST | Nothing to extract |
| Billing-specific usage meters | DO NOT EXIST | Nothing to extract |

**Conclusion for BILL-05:** The dashboard has no billing UI components to extract. The requirement is satisfied by the current state. The planner should create a validation task that confirms this (grep for billing imports, verify no pricing/subscription pages exist) rather than an extraction task.

### Stripe References Outside Billing (Must Be Evaluated)

| Location | Reference | Type | Keep/Remove |
|----------|-----------|------|-------------|
| `routes/admin.ts` line 180 | `case 'stripe':` | Connector OAuth config | KEEP -- this is about the Stripe connector, not billing |
| `routes/v1.ts` line 10 | `import { stripeConnector }` | Connector registration | KEEP -- this is the @feelr/connector-stripe connector |
| `auth/types.ts` line 28 | `stripeCustomerId?: string` | API key record field | KEEP -- billing provider reads this via the interface; it's a string field, not a Stripe type |
| `__tests__/credentials.test.ts` | `sk_test_stripe` | Test fixture | KEEP -- testing the Stripe connector credential storage |

## Open Questions

1. **Should `billing/types.ts` stay in gateway core or move to a shared package?**
   - What we know: It contains `BillingPlan`, `PlanLimits`, `PLAN_LIMITS`, `CustomerBilling`. The StripeBillingProvider needs these types. The NoopBillingProvider does not use them (returns `{ allowed: true }` for everything).
   - What's unclear: When Phase 27 creates the cloud repo, will StripeBillingProvider import these types via the git subtree path?
   - Recommendation: KEEP in gateway core. The cloud repo embeds the public repo at `oss/` via git subtree, so `StripeBillingProvider` can import from `oss/apps/gateway/src/billing/types`. No shared package needed.

2. **Should `stripeCustomerId` be renamed in `ApiKeyRecord`?**
   - What we know: The field name contains "stripe" which could trigger the boundary check. However, it's just a string field that happens to store a Stripe customer ID. Renaming to `billingCustomerId` would be cleaner but changes the KV storage schema (breaking change for existing data).
   - What's unclear: Whether the boundary check should ignore this field or whether it should be renamed.
   - Recommendation: KEEP as `stripeCustomerId` and exclude `auth/types.ts` from the boundary check's string-matching. The field is consumed by the billing provider through the interface, not by gateway core. Renaming would require a KV data migration for existing users, which is unnecessary complexity for Phase 26.

3. **Temporary coexistence: Should StripeBillingProvider live in the public repo during Phase 26?**
   - What we know: Phase 27 (repo split) hasn't happened yet. The code is still in a single monorepo. We need somewhere to put StripeBillingProvider.
   - What's unclear: Whether to put it in `billing/stripe/` in the gateway (later deleted from public snapshot) or in a separate workspace package.
   - Recommendation: Put it in `apps/gateway/src/billing/stripe/` as a self-contained directory. Phase 27 will exclude this directory from the public repo snapshot. This is simpler than creating a separate package that would need its own package.json, tsconfig, etc. The boundary check script will know about this directory as an allowed exception.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `apps/gateway/src/billing/` -- all 4 files read and analyzed
- Direct codebase analysis of `apps/gateway/package.json` -- stripe ^20.3.1 confirmed as dependency
- Direct codebase analysis of `apps/gateway/src/runtime/interfaces.ts` -- existing provider patterns documented
- Direct codebase analysis of `apps/dashboard/src/` -- confirmed NO billing UI components exist
- Direct codebase analysis of `apps/gateway/src/lib/types.ts` -- AppEnv bindings with STRIPE_SECRET_KEY documented
- Phase 25 verification report (`25-VERIFICATION.md`) -- confirms pre-split audit passed
- Phase 27 success criteria in ROADMAP.md -- confirms cloud repo architecture (git subtree at `oss/`)

### Secondary (MEDIUM confidence)
- [pnpm Workspaces documentation](https://pnpm.io/workspaces) -- workspace package structure patterns
- [Turborepo repository structuring](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) -- internal package best practices
- [TypeScript DI patterns](https://khalilstemmler.com/articles/tutorials/dependency-injection-inversion-explained/) -- provider/strategy pattern guidance
- [Nhost pnpm + Turborepo configuration](https://nhost.io/blog/how-we-configured-pnpm-and-turborepo-for-our-monorepo) -- monorepo package management patterns

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries needed; pattern matches existing codebase conventions exactly
- Architecture: HIGH -- Billing surface area is small (4 files, ~150 lines), all files read and mapped, extraction path is clear
- Pitfalls: HIGH -- All pitfalls derived from actual code analysis (e.g., confirmed type imports, confirmed AppEnv shape, confirmed dashboard has no billing UI)
- Dashboard BILL-05: HIGH -- Exhaustive search of dashboard components confirms zero billing-specific UI exists

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable domain -- interface extraction is architectural, not library-dependent)
