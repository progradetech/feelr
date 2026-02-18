# Architecture Patterns: Open-Core Repository Split via Git Subtree Overlay

**Domain:** Open-core monorepo restructuring (public OSS + private cloud overlay)
**Researched:** 2026-02-13
**Confidence:** HIGH (based on codebase analysis + established patterns from Cal.com, GitLab, etc.)

## Recommended Architecture

### Approach: Private Cloud Repo Pulls Public OSS Repo as Git Subtree

The architecture inverts the typical assumption. The **private** `feelr-cloud` repository is the deployment source. It pulls the **public** `feelr` repository in as a git subtree at its root, then layers cloud-only code on top. This means:

- `progradetech/feelr` (public) -- the open-source monorepo, unchanged
- `progradetech/feelr-cloud` (private) -- the cloud deployment repo, which contains the public repo as a subtree plus cloud-only overlays

**Why this direction (private pulls public, not the reverse):**
1. The public repo never references or acknowledges the private repo -- clean OSS boundary
2. Cloud-only secrets, configs, and billing code never risk leaking into the public repo
3. The public repo continues to work standalone for self-hosting
4. Contributors to the public repo never see or deal with cloud concerns

```
feelr-cloud/ (private repo)
|
|-- oss/                          <-- git subtree of progradetech/feelr
|   |-- apps/gateway/
|   |-- apps/dashboard/
|   |-- apps/docs/
|   |-- cli/
|   |-- connectors/
|   |-- packages/
|   |-- self-host/
|   |-- ...everything from public repo
|
|-- cloud/                        <-- cloud-only code (never in public repo)
|   |-- billing/
|   |   |-- middleware/
|   |   |   |-- plan-enforcer.ts  <-- replaces oss/apps/gateway/src/billing/plan-enforcer.ts
|   |   |   |-- stripe-webhook.ts <-- new: Stripe webhook handler route
|   |   |-- meter.ts              <-- replaces oss/apps/gateway/src/billing/meter.ts
|   |   |-- stripe-client.ts      <-- replaces oss/apps/gateway/src/billing/stripe-client.ts
|   |   |-- types.ts              <-- replaces oss/apps/gateway/src/billing/types.ts
|   |
|   |-- dashboard/
|   |   |-- components/
|   |   |   |-- billing-panel.tsx <-- new: billing/plan management UI
|   |   |   |-- upgrade-cta.tsx   <-- new: plan upgrade call-to-action
|   |   |-- pages/
|   |       |-- billing/          <-- new: /billing route
|   |
|   |-- gateway-entry.ts          <-- cloud-specific index.ts (replaces oss entry)
|   |-- wrangler.cloud.toml       <-- cloud wrangler config (staging + production)
|
|-- .github/
|   |-- workflows/
|       |-- sync-oss.yml          <-- pulls latest from public repo subtree
|       |-- deploy-gateway.yml    <-- builds combined gateway, deploys to CF
|       |-- deploy-dashboard.yml  <-- builds combined dashboard, deploys to Azure SWA
|
|-- scripts/
|   |-- build-gateway.sh          <-- combines oss + cloud code, runs wrangler deploy
|   |-- build-dashboard.sh        <-- combines oss + cloud dashboard code, runs next build
|
|-- package.json                  <-- workspace root for cloud repo
|-- pnpm-workspace.yaml           <-- includes oss/* and cloud/*
|-- turbo.json                    <-- extends oss turbo config
```

### Why NOT the Cal.com `/ee` Pattern

Cal.com puts enterprise code in `/ee` directories within the same public repo under a commercial license. This works for their model (AGPLv3 + commercial dual license), but is wrong for Feelr because:

1. **Feelr's billing code contains Stripe API keys, webhook secrets, and customer data schemas** -- these should never be in a public repo, even under a commercial license header
2. **Cal.com's /ee is visible to all contributors** -- Feelr wants the cloud billing to be completely invisible to OSS contributors
3. **The existing `billing.enabled` toggle already provides the seam** -- the open-source code already has clean no-op paths when billing is disabled. The cloud overlay just needs to replace the billing stubs with real implementations

---

## Component Boundaries

### What Stays in the Public Repo (progradetech/feelr)

| Component | Path | Role | Changes Needed |
|-----------|------|------|----------------|
| Gateway core | `apps/gateway/` | Hono app, middleware chain, routes | Extract billing to a pluggable interface |
| Billing stubs | `apps/gateway/src/billing/` | No-op when `billing.enabled=false` | Convert to interface + stub implementation |
| Dashboard | `apps/dashboard/` | Next.js dashboard (no billing UI) | Remove billing references from landing page text |
| CLI | `cli/` | Go CLI, unchanged | None |
| Connectors | `connectors/` | GitHub, Slack, Discord, Stripe connectors | None |
| Connector SDK | `packages/connector-sdk/` | Connector development kit | None |
| Self-host | `self-host/` | Docker + workerd config | None |
| Docs | `apps/docs/` | Nextra documentation site | None |
| CI/CD | `.github/workflows/` | CI only (lint, typecheck, test) | Remove cloud deploy workflows |

### What Moves to the Private Repo (progradetech/feelr-cloud)

| Component | Cloud Path | Role | New vs Modified |
|-----------|-----------|------|-----------------|
| Billing middleware | `cloud/billing/middleware/` | Stripe plan enforcement, metering | **Modified** -- real impl replacing stubs |
| Stripe client | `cloud/billing/stripe-client.ts` | Stripe SDK initialization | **Modified** -- moved from gateway |
| Billing types | `cloud/billing/types.ts` | Plan definitions, customer billing | **Modified** -- moved from gateway |
| Webhook handler | `cloud/billing/webhook/` | Stripe webhook processing | **New** |
| Cloud gateway entry | `cloud/gateway-entry.ts` | Cloud-specific Worker entry point | **New** -- replaces `oss/apps/gateway/src/index.ts` |
| Cloud wrangler | `cloud/wrangler.cloud.toml` | CF config with real KV/D1/DO bindings | **New** -- replaces `oss/apps/gateway/wrangler.toml` |
| Dashboard billing UI | `cloud/dashboard/` | Billing panel, upgrade CTAs | **New** |
| Cloud CI/CD | `.github/workflows/` | Deploy gateway, dashboard, sync OSS | **New** |
| OSS sync workflow | `.github/workflows/sync-oss.yml` | Automated subtree pull | **New** |

---

## The Billing Interface Seam

The critical architectural change is converting `apps/gateway/src/billing/` from concrete Stripe code to a pluggable interface. The public repo ships with a no-op stub; the cloud repo ships with the real Stripe implementation.

### Current State (Tightly Coupled)

```
apps/gateway/src/billing/
  plan-enforcer.ts    -- imports Stripe SDK, checks billing.enabled flag
  meter.ts            -- imports Stripe SDK, records meter events
  stripe-client.ts    -- creates Stripe client
  types.ts            -- plan limits, CustomerBilling type
```

The plan-enforcer middleware already has a `billing.enabled` short-circuit, but it still imports Stripe SDK at the module level. In the public repo, this means the Stripe dependency exists even for self-hosted deployments.

### Target State (Interface + Plug)

**Public repo (`apps/gateway/src/billing/`):**

```typescript
// billing-provider.ts -- interface definition
export interface BillingProvider {
  enforceQuota(apiKeyRecord: ApiKeyRecord, kv: KeyValueStore): Promise<BillingDecision>
  recordUsage(apiKeyRecord: ApiKeyRecord, ctx: ExecutionContext): void
}

export interface BillingDecision {
  allowed: boolean
  plan: string
  currentUsage: number
  limit: number
}

// noop-provider.ts -- default implementation (always allows)
export class NoopBillingProvider implements BillingProvider {
  async enforceQuota(): Promise<BillingDecision> {
    return { allowed: true, plan: 'unlimited', currentUsage: 0, limit: Infinity }
  }
  recordUsage(): void { /* no-op */ }
}
```

**Cloud repo (`cloud/billing/`):**

```typescript
// stripe-provider.ts -- real implementation
export class StripeBillingProvider implements BillingProvider {
  constructor(private stripe: Stripe, private kv: KeyValueStore) {}

  async enforceQuota(apiKeyRecord: ApiKeyRecord, kv: KeyValueStore): Promise<BillingDecision> {
    // Current plan-enforcer.ts logic, but without the billing.enabled check
    // (that check happens at registration time, not per-request)
  }

  recordUsage(apiKeyRecord: ApiKeyRecord, ctx: ExecutionContext): void {
    // Current meter.ts logic
  }
}
```

**Registration point (gateway entry):**

```typescript
// oss/apps/gateway/src/index.ts (public)
import { NoopBillingProvider } from './billing/noop-provider'
// app.use('/v1/*', planEnforcer(new NoopBillingProvider()))

// cloud/gateway-entry.ts (private)
import { StripeBillingProvider } from '../cloud/billing/stripe-provider'
// app.use('/v1/*', planEnforcer(new StripeBillingProvider(stripe, kv)))
```

### Why an Interface Instead of Just Build-Time File Replacement

1. **Type safety** -- both implementations satisfy the same TypeScript interface, caught at compile time
2. **Testability** -- the public repo can test the billing middleware with a mock provider
3. **Contributor clarity** -- OSS contributors see the interface and understand the extension point
4. **No fragile path aliasing** -- build-time file swaps via webpack/esbuild aliases are brittle and confuse IDEs

---

## Data Flow

### Current Flow (Single Repo)

```
Request --> Gateway (index.ts)
         --> CORS --> Logger --> IP Rate Limit
         --> API Key Auth --> Key Rate Limit
         --> Plan Enforcer (billing/plan-enforcer.ts -- checks billing.enabled flag)
         --> Rate Limit Headers
         --> Route Handler
         --> [waitUntil] Meter Event (billing/meter.ts) + Usage DB Write
```

### Target Flow (Public Repo -- Self-Hosted / OSS)

```
Request --> Gateway (index.ts)
         --> CORS --> Logger --> IP Rate Limit
         --> API Key Auth --> Key Rate Limit
         --> Plan Enforcer (NoopBillingProvider -- always allows)
         --> Rate Limit Headers
         --> Route Handler
         --> [waitUntil] Usage DB Write (no meter event)
```

### Target Flow (Cloud Repo -- Deployed to CF Workers)

```
Request --> Gateway (cloud/gateway-entry.ts)
         --> CORS --> Logger --> IP Rate Limit
         --> API Key Auth --> Key Rate Limit
         --> Plan Enforcer (StripeBillingProvider -- real quota check)
         --> Rate Limit Headers
         --> Route Handler
         --> [waitUntil] Meter Event (Stripe) + Usage DB Write + KV Usage Increment
```

---

## Git Subtree Mechanics

### Initial Setup (One-Time)

```bash
# In the feelr-cloud repo (private)
git remote add oss git@github.com:progradetech/feelr.git
git subtree add --prefix oss oss main --squash
```

This creates a single squashed commit in `feelr-cloud` that contains the entire public repo at `oss/`.

### Pulling Updates from Public Repo

```bash
# Pull latest changes from public repo into the subtree
git fetch oss main
git subtree pull --prefix oss oss main --squash
```

The `--squash` flag is critical: it collapses the public repo's commit history into a single merge commit. Without it, the private repo would accumulate the full commit history of the public repo, making the history noisy and `git log` unusable.

### Automated Sync (GitHub Actions)

```yaml
# .github/workflows/sync-oss.yml (in feelr-cloud)
name: Sync OSS
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  repository_dispatch:
    types: [oss-updated]     # Triggered by public repo webhook
  workflow_dispatch:          # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.CLOUD_REPO_PAT }}

      - name: Pull OSS subtree
        run: |
          git remote add oss https://github.com/progradetech/feelr.git || true
          git fetch oss main
          git subtree pull --prefix oss oss main --squash -m "chore: sync OSS $(date +%Y-%m-%d)"

      - name: Push if changed
        run: git push origin main
```

### Cross-Repo Trigger (Public Repo Notifies Private)

```yaml
# .github/workflows/notify-cloud.yml (in public repo progradetech/feelr)
name: Notify Cloud
on:
  push:
    branches: [main]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.CLOUD_DISPATCH_TOKEN }}
          repository: progradetech/feelr-cloud
          event-type: oss-updated
```

This requires a PAT with `repo` scope stored as `CLOUD_DISPATCH_TOKEN` in the public repo's secrets. The PAT must belong to an account with write access to the private repo.

---

## Build Process

### Gateway Build (Cloud)

The cloud gateway build combines the OSS gateway with cloud-specific code by using a custom entry point and wrangler config.

```bash
#!/bin/bash
# scripts/build-gateway.sh (in feelr-cloud)

# 1. Install dependencies for the full workspace
pnpm install --frozen-lockfile

# 2. Build connectors and packages (same as OSS)
pnpm turbo run build --filter=@feelr/connector-sdk
pnpm turbo run build --filter='./oss/connectors/*'

# 3. Deploy gateway with cloud entry point and cloud wrangler config
cd oss/apps/gateway
npx wrangler deploy \
  --config ../../../cloud/wrangler.cloud.toml \
  --env production
```

**Key detail:** The cloud `wrangler.cloud.toml` specifies `main = "../../../cloud/gateway-entry.ts"` which imports and re-exports the Hono app from `oss/apps/gateway/src/app.ts` but replaces the entry point to inject the StripeBillingProvider.

### Cloud Gateway Entry Point

```typescript
// cloud/gateway-entry.ts
import app from '../oss/apps/gateway/src/app'
import { createCloudBindings } from '../oss/apps/gateway/src/runtime/factory'
import { StripeBillingProvider } from './billing/stripe-provider'
import { registerBillingProvider } from '../oss/apps/gateway/src/billing/registry'

export { TokenCoordinator } from '../oss/apps/gateway/src/durable-objects/token-coordinator'

export default {
  async fetch(request: Request, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    const adaptedEnv = createCloudBindings(rawEnv as never)

    // Register the Stripe billing provider (replaces NoopBillingProvider)
    if (adaptedEnv.STRIPE_SECRET_KEY) {
      registerBillingProvider(new StripeBillingProvider(adaptedEnv))
    }

    return app.fetch(request, adaptedEnv, ctx)
  },

  async scheduled(event: ScheduledEvent, rawEnv: Record<string, unknown>, ctx: ExecutionContext): Promise<void> {
    const adaptedEnv = createCloudBindings(rawEnv as never)
    // ... scheduled handler
  },
}
```

### Dashboard Build (Cloud)

The dashboard build is simpler because billing UI components are additive (new pages/components), not replacements.

**Strategy: Conditional imports via environment variable at build time.**

```typescript
// In the cloud repo, create a Next.js plugin or layout wrapper that adds billing routes:
// cloud/dashboard/billing-layout.tsx

// The cloud build script sets NEXT_PUBLIC_BILLING_ENABLED=true
// Dashboard components conditionally render billing UI based on this flag
```

However, a cleaner approach: the cloud repo's build script copies cloud dashboard components into the OSS dashboard source tree before building:

```bash
#!/bin/bash
# scripts/build-dashboard.sh (in feelr-cloud)

# 1. Copy cloud-only dashboard components into the OSS dashboard tree
cp -r cloud/dashboard/components/* oss/apps/dashboard/src/components/
cp -r cloud/dashboard/pages/* oss/apps/dashboard/src/app/\(dashboard\)/

# 2. Build the dashboard with cloud env vars
cd oss
pnpm turbo run build --filter=@feelr/dashboard
```

This is safe because the copy happens in CI only (never committed to the OSS subtree) and the `--squash` on subtree pull means these files are never pushed back to the public repo.

---

## CI/CD Architecture

### Public Repo (progradetech/feelr) -- Remains Mostly Unchanged

| Workflow | Trigger | What It Does | Changes |
|----------|---------|--------------|---------|
| `ci.yml` | PR open/sync | Lint, typecheck, test (affected) | None |
| `gateway.yml` | Push to main | **Remove cloud deploy** -- keep only self-host build validation | Remove staging/production deploy jobs |
| `dashboard.yml` | Push to main | **Remove cloud deploy** -- keep only build validation | Remove SWA deploy jobs |
| `docs.yml` | Push to main | **Remove cloud deploy** -- keep only build validation | Remove SWA deploy jobs |
| `release.yml` | Tag push | GoReleaser for CLI + Homebrew | None |
| `notify-cloud.yml` | Push to main | **New** -- triggers cloud repo sync | New workflow |

**Critical change:** The public repo stops deploying to Cloudflare Workers and Azure SWA. Those deploy jobs move to the cloud repo. The public repo only validates that code builds and tests pass.

### Private Repo (progradetech/feelr-cloud)

| Workflow | Trigger | What It Does |
|----------|---------|--------------|
| `sync-oss.yml` | Schedule (6h) + repository_dispatch + manual | Pulls latest OSS subtree |
| `ci.yml` | PR open/sync | Full lint, typecheck, test on combined codebase |
| `deploy-gateway.yml` | Push to main (staging) + tag (production) | Builds combined gateway, deploys to CF Workers |
| `deploy-dashboard.yml` | Push to main (staging) + tag (production) | Builds combined dashboard, deploys to Azure SWA |
| `deploy-docs.yml` | Push to main (staging) + tag (production) | Builds docs, deploys to Azure SWA |

### Deploy Workflow Example (Cloud Gateway)

```yaml
# .github/workflows/deploy-gateway.yml (in feelr-cloud)
name: Gateway (Cloud)
on:
  push:
    branches: [main]
    paths:
      - "oss/apps/gateway/**"
      - "oss/packages/**"
      - "oss/connectors/**"
      - "cloud/billing/**"
      - "cloud/gateway-entry.ts"
      - "cloud/wrangler.cloud.toml"
    tags:
      - "v*"
  workflow_dispatch:

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - name: Deploy combined gateway to staging
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: oss/apps/gateway
          command: deploy --config ../../../cloud/wrangler.cloud.toml --env staging
          packageManager: pnpm
```

---

## GoReleaser / Homebrew Distribution

**No changes needed.** The CLI is pure Go code in `cli/`, has no billing dependencies, and GoReleaser builds it from the public repo. The release workflow stays in the public repo:

| Aspect | Before | After | Change? |
|--------|--------|-------|---------|
| CLI source | `cli/` | `cli/` (unchanged in public repo) | No |
| GoReleaser config | `.goreleaser.yaml` at repo root | Same location | No |
| Release workflow | `release.yml` triggers on `v*` tags | Same trigger | No |
| Homebrew tap | `progradetech/homebrew-feelr` | Same | No |
| Binary distribution | GitHub Releases on `progradetech/homebrew-feelr` | Same | No |

The CLI distribution is entirely decoupled from the cloud overlay. Tags and releases happen on the public repo as before.

---

## Patterns to Follow

### Pattern 1: Provider Registry for Cross-Repo Extension Points

**What:** A global registry where the entry point registers implementations of interfaces before the Hono app starts processing requests.

**When:** Any time cloud-only behavior needs to replace OSS defaults (billing, analytics, auth providers).

```typescript
// oss/apps/gateway/src/billing/registry.ts
import type { BillingProvider } from './billing-provider'
import { NoopBillingProvider } from './noop-provider'

let provider: BillingProvider = new NoopBillingProvider()

export function registerBillingProvider(p: BillingProvider): void {
  provider = p
}

export function getBillingProvider(): BillingProvider {
  return provider
}
```

**Why this over dependency injection:** Hono middleware is registered at module load time. The registry pattern lets the entry point swap implementations before the first request, without changing how middleware is declared in `app.ts`.

### Pattern 2: Cloud Wrangler Config Override

**What:** The cloud repo ships its own `wrangler.cloud.toml` that points to a different entry point (`main = ...`) and has cloud-specific bindings (Stripe secrets, production KV/D1 IDs).

**When:** Deploying the gateway to Cloudflare Workers from the cloud repo.

```toml
# cloud/wrangler.cloud.toml
name = "feelr-gateway"
main = "../cloud/gateway-entry.ts"  # Different entry point!
compatibility_date = "2026-02-05"
# ... same DO migrations, but cloud-specific KV/D1 bindings
```

The existing `oss/apps/gateway/wrangler.toml` becomes the self-hosted/development config. The cloud config is authoritative for production deployments.

### Pattern 3: Additive Dashboard Components via Build-Time Copy

**What:** Cloud-only dashboard pages and components are copied into the OSS dashboard source tree during CI, before `next build` runs.

**When:** Adding billing UI, upgrade CTAs, plan management pages to the dashboard.

**Why not a separate Next.js app:** The dashboard is a single SPA deployed to Azure SWA. Splitting it into two apps would mean two deployments, two URLs, and a confusing user experience. The build-time copy keeps a single app while cleanly separating cloud-only source code.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Bidirectional Subtree Sync

**What:** Pushing changes from the cloud repo back to the public repo via `git subtree push`.

**Why bad:** Any accidental inclusion of cloud-only code (billing secrets, proprietary logic) in a subtree push would expose it in the public repo. The sync must be strictly one-way: public to private.

**Instead:** All OSS changes are made in the public repo. The cloud repo only pulls. If a cloud developer needs to fix an OSS bug, they make a PR to the public repo, wait for it to merge, then sync.

### Anti-Pattern 2: Webpack/ESBuild Aliases for File Replacement

**What:** Using build tool path aliases to swap `billing/plan-enforcer.ts` with a cloud version at build time.

**Why bad:** IDE confusion (type hints point to wrong file), debugging confusion (stack traces show aliased paths), and fragility (path changes in one repo silently break the other).

**Instead:** Use the provider registry pattern. The interface lives in the OSS repo, implementations are registered by the entry point.

### Anti-Pattern 3: Feature Flags in Build Artifacts

**What:** Shipping both billing and no-billing code paths in the same build, gated by runtime flags.

**Why bad:** This is the current state and it works for now, but it means the public repo ships with Stripe SDK code (even though it is dead code for self-hosted). For a true open-core split, the public repo should not bundle Stripe SDK at all -- it should have no billing dependency.

**Instead:** After the split, `stripe` is removed from the public repo's `package.json`. The cloud repo adds it to its own dependency tree.

### Anti-Pattern 4: Shared pnpm-workspace.yaml Between Repos

**What:** Trying to make the cloud repo use the OSS repo's `pnpm-workspace.yaml` directly.

**Why bad:** The cloud repo has additional workspaces (`cloud/*`) that do not exist in the OSS workspace config.

**Instead:** The cloud repo has its own `pnpm-workspace.yaml` that references both `oss/*` packages and `cloud/*` packages:

```yaml
# feelr-cloud/pnpm-workspace.yaml
packages:
  - 'oss/apps/*'
  - 'oss/packages/*'
  - 'oss/connectors/*'
  - 'cloud/*'
```

---

## Integration Points Summary

| Integration Point | OSS Side | Cloud Side | Mechanism |
|-------------------|----------|------------|-----------|
| Billing middleware | `BillingProvider` interface + `NoopBillingProvider` | `StripeBillingProvider` | Provider registry |
| Gateway entry point | `src/index.ts` (exports Hono app) | `cloud/gateway-entry.ts` (imports app, registers provider) | Wrangler `main` config |
| Wrangler config | `wrangler.toml` (self-hosted/dev) | `wrangler.cloud.toml` (staging/production) | Separate TOML files |
| Dashboard UI | Base dashboard (no billing pages) | Billing panel, upgrade CTA, plan page | Build-time file copy |
| CI triggers | `notify-cloud.yml` fires `repository_dispatch` | `sync-oss.yml` receives event, pulls subtree | GitHub Actions cross-repo dispatch |
| Stripe dependency | **Removed** from `package.json` | Added to cloud `package.json` | Separate dependency trees |
| Plan types | Shared types exported from billing interface | Imported from `oss/` subtree | TypeScript imports |

---

## Scalability Considerations

| Concern | Current (Single Repo) | After Split (Two Repos) | At Scale |
|---------|----------------------|------------------------|----------|
| OSS contributor experience | Single repo, all code visible | Single repo, billing code invisible | Cleaner contributor onboarding |
| Cloud deploy speed | Direct push-to-deploy | Subtree sync + deploy (adds ~2 min) | Cache subtree state; sync is incremental |
| Secret management | All secrets in one repo | OSS secrets = none; cloud secrets = Stripe, CF, SWA | Clean separation |
| Merge conflicts | None (single repo) | Rare (cloud edits OSS paths only via subtree pull) | --squash prevents history conflicts |
| Repo size | ~50MB | OSS: ~50MB, Cloud: ~60MB (includes squashed subtree) | Squash keeps cloud repo lean |

---

## Build Order for the Repo Split

This is the recommended sequence of changes, designed to minimize disruption:

### Step 1: Create Billing Provider Interface (in public repo)

- Add `billing-provider.ts` interface
- Add `noop-provider.ts` default implementation
- Add `registry.ts` for provider registration
- Refactor `plan-enforcer.ts` to use registry instead of direct Stripe imports
- Refactor `meter.ts` to be called by the provider, not directly
- All existing tests continue to pass (NoopBillingProvider is the default)

### Step 2: Create the Cloud Repo (private)

- Initialize `progradetech/feelr-cloud`
- Add public repo as subtree: `git subtree add --prefix oss progradetech/feelr main --squash`
- Create `cloud/` directory structure
- Move Stripe billing implementation to `cloud/billing/`
- Create `cloud/gateway-entry.ts` that registers StripeBillingProvider
- Create `cloud/wrangler.cloud.toml` with production bindings
- Verify cloud gateway deploys successfully from the new structure

### Step 3: Migrate CI/CD (parallel)

- Add `sync-oss.yml` workflow to cloud repo
- Add `deploy-gateway.yml`, `deploy-dashboard.yml`, `deploy-docs.yml` to cloud repo
- Add `notify-cloud.yml` to public repo
- Test: push to public repo triggers sync in cloud repo triggers deploy
- Verify staging deploys work end-to-end

### Step 4: Remove Cloud Deploy from Public Repo

- Remove staging/production deploy jobs from `gateway.yml`, `dashboard.yml`, `docs.yml`
- Keep CI validation (lint, typecheck, test) in public repo
- Remove Cloudflare and Azure SWA secrets from public repo
- Remove `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` references from public wrangler.toml

### Step 5: Clean Up Public Repo

- Remove `stripe` from `apps/gateway/package.json` dependencies
- Remove concrete Stripe billing code (replaced by NoopBillingProvider)
- Keep billing interface and types (they define the extension point)
- Update self-host documentation to reflect that billing is cloud-only
- Tag a release (this is the first "open-core" release)

---

## Sources

- [Atlassian Git Subtree Tutorial](https://www.atlassian.com/git/tutorials/git-subtree) -- HIGH confidence, authoritative
- [GitHub Docs: About Git Subtree Merges](https://docs.github.com/en/enterprise-cloud@latest/get-started/using-git/about-git-subtree-merges) -- HIGH confidence
- [JetBrains Space Git Subtree](https://blog.jetbrains.com/space/2023/11/21/space-git-subtree/) -- MEDIUM confidence, bidirectional sync patterns
- [Cal.com /ee Enterprise Directory Pattern](https://github.com/calcom/cal.com/tree/main/packages/features/ee) -- HIGH confidence, observed in public repo
- [splitsh/lite: Subtree Splitting Tool](https://github.com/splitsh/lite) -- MEDIUM confidence, alternative approach
- [peter-evans/repository-dispatch](https://github.com/peter-evans/repository-dispatch) -- HIGH confidence, cross-repo GitHub Actions trigger
- [Hono Middleware Documentation](https://hono.dev/docs/guides/middleware) -- HIGH confidence, Context7-level
- [Cloudflare Workers Environments](https://developers.cloudflare.com/workers/wrangler/environments/) -- HIGH confidence, official docs
- [Turborepo Package Configurations](https://turborepo.dev/docs/reference/package-configurations) -- HIGH confidence, official docs
- Codebase analysis of `apps/gateway/src/billing/`, `apps/gateway/src/runtime/`, `apps/gateway/src/app.ts`, all CI workflows -- HIGH confidence, direct observation
