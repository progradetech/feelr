# Phase 10: Launch Prep - Research

**Researched:** 2026-02-09
**Domain:** Stripe billing, documentation sites, GoReleaser distribution, Homebrew taps, open-source packaging
**Confidence:** HIGH

## Summary

Phase 10 is the final phase that transforms Feelr from a working codebase into a publicly launchable product. It covers five distinct domains: (1) Stripe billing integration with metered subscriptions and plan enforcement on the cloud gateway, toggleable for self-hosted; (2) a documentation site at feelr.dev/docs; (3) CLI distribution via GoReleaser for multi-platform binaries; (4) a Homebrew tap for macOS/Linux installation; and (5) open-source packaging with LICENSE, CONTRIBUTING.md, README, and a connector template.

The codebase already has strong foundations for this phase. The gateway has tiered rate limiting (free/pro/enterprise), a `billing.enabled` config toggle, runtime abstraction interfaces, and a well-structured connector template at `connectors/_template/`. The CLI already uses `-ldflags` for version injection. The key work is integrating Stripe's meter-based billing into the gateway, building a documentation site, creating the GoReleaser pipeline, and polishing the open-source artifacts.

**Primary recommendation:** Use Stripe Billing Meters (new API, replaces deprecated usage records) for metered subscriptions, Nextra v4 for the docs site (leverages existing Next.js expertise), GoReleaser v2 with `homebrew_casks` for CLI distribution, and Apache 2.0 license for open-source packaging.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe (npm) | latest | Stripe billing SDK for Workers | Official SDK with native Cloudflare Workers support via `createFetchHttpClient()` |
| GoReleaser | v2 | Multi-platform Go binary builds + GitHub Releases | De facto standard for Go CLI distribution; 13k+ GitHub stars |
| Nextra | v4 | Documentation site framework | Built on Next.js (team already uses Next.js 15), supports MDX, static export, built-in search |
| nextra-theme-docs | v4 | Docs theme for Nextra | Official documentation theme with sidebar, search, dark mode |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| goreleaser-action | v6 | GitHub Actions integration for GoReleaser | CI/CD release pipeline |
| pagefind | latest | Static search indexing for docs | Nextra static export search functionality |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nextra v4 | Starlight (Astro) | Starlight is excellent (used by Cloudflare, OpenAI) but requires learning Astro; Nextra leverages existing Next.js knowledge |
| Nextra v4 | Mintlify | Hosted SaaS, not self-owned; adds vendor dependency |
| GoReleaser | Manual `go build` + `ghr` | Much more scripting; GoReleaser handles checksums, changelogs, Homebrew formula automatically |
| Apache 2.0 | MIT | MIT is simpler but lacks patent grant; Apache 2.0 provides better protection for a project with commercial cloud offering |

**Installation (gateway billing):**
```bash
cd apps/gateway && pnpm add stripe
```

**Installation (docs site -- new workspace package):**
```bash
mkdir -p apps/docs
cd apps/docs && pnpm add next nextra nextra-theme-docs
```

## Architecture Patterns

### Recommended Project Structure
```
.goreleaser.yaml            # GoReleaser config (repo root, references cli/ directory)
.github/
  workflows/
    release.yml             # GoReleaser GitHub Actions workflow
apps/
  docs/                     # Nextra documentation site
    app/
      layout.tsx            # Root layout with Nextra theme
      page.mdx              # Landing page
      docs/
        getting-started.mdx
        auth/
          setup.mdx
        connectors/
          github.mdx
          slack.mdx
          stripe.mdx
          discord.mdx
        self-hosting.mdx
        cli-reference.mdx
    next.config.mjs         # Nextra + static export config
    package.json
  gateway/
    src/
      billing/              # NEW: Stripe billing module
        stripe-client.ts    # Stripe SDK init for Workers
        meter.ts            # Meter event recording
        plan-enforcer.ts    # Middleware: check plan limits
        types.ts            # Billing types (plan, customer, subscription)
LICENSE                     # Apache 2.0
CONTRIBUTING.md             # Contributor guidelines
README.md                   # Comprehensive project README
connectors/
  _template/                # Already exists, needs CONTRIBUTING docs reference
```

### Pattern 1: Stripe Billing as Gateway Middleware
**What:** A middleware that checks the API key's associated Stripe subscription status and enforces plan limits before request dispatch.
**When to use:** On every `/v1/*` request in cloud mode (billing.enabled = true).
**How it works:**
1. API key record includes a `stripeCustomerId` field (added to `ApiKeyRecord`)
2. On request, middleware checks cached subscription status (KV-backed with TTL)
3. If over plan quota, return 402 Payment Required with upgrade hint
4. After successful request, fire Stripe meter event asynchronously via `waitUntil`

```typescript
// Pattern: Stripe client initialization in Cloudflare Workers
// Source: https://blog.cloudflare.com/announcing-stripe-support-in-workers/
import Stripe from 'stripe/lib/stripe.js'

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: '2025-12-18.acacia', // Pin API version
  })
}
```

### Pattern 2: Billing Toggle via FeelrConfig
**What:** The existing `FeelrConfig.billing.enabled` flag gates all billing logic. When false (self-hosted default), billing middleware is a no-op passthrough.
**When to use:** Already exists in the config system -- billing code checks this flag.

```typescript
// Pattern: Conditional billing middleware
export function billingEnforcer(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const config = c.env.FEELR_CONFIG
    if (!config.billing.enabled) {
      return next() // Skip billing in self-hosted mode
    }
    // ... enforce plan limits ...
    await next()
    // ... record meter event via waitUntil ...
  }
}
```

### Pattern 3: GoReleaser with Monorepo CLI Subdirectory
**What:** GoReleaser configured to build from `cli/` subdirectory in a monorepo.
**When to use:** When the Go CLI is not at the repo root.

```yaml
# .goreleaser.yaml at repo root
version: 2
project_name: feelr

builds:
  - id: feelr-cli
    dir: cli
    main: .
    binary: feelr
    ldflags:
      - -s -w -X main.version={{.Version}} -X main.commit={{.ShortCommit}}
    env:
      - CGO_ENABLED=0
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64
```

### Pattern 4: Stripe Meter Events via waitUntil
**What:** Record API usage to Stripe asynchronously after the response is sent, using the existing `waitUntil` pattern already used for usage recording.
**When to use:** After every successful API request in cloud billing mode.

```typescript
// Pattern: Async meter event recording (non-blocking)
c.executionCtx.waitUntil(
  recordStripeMeterEvent(stripeClient, {
    event_name: 'feelr_api_calls',
    payload: {
      stripe_customer_id: customerRecord.stripeCustomerId,
      value: 1,
    },
  }).catch(() => {
    // Best-effort: never fail the request due to billing
  })
)
```

### Anti-Patterns to Avoid
- **Synchronous Stripe calls in the request path:** Stripe API calls add 100-300ms latency. Always use `waitUntil` for meter events and cache subscription status in KV.
- **Billing enforcement without caching:** Don't call Stripe on every request to check subscription status. Cache plan limits in KV with a 5-minute TTL.
- **Separate billing microservice:** The gateway already has the rate limiting infrastructure. Add billing as a middleware in the existing chain, not as a separate service.
- **Using deprecated Stripe usage records API:** The legacy usage records API was removed in Stripe API version 2025-03-31.basil. Use the Billing Meters API instead.
- **GoReleaser config inside cli/ directory:** Put `.goreleaser.yaml` at the repo root with `dir: cli` -- this is the standard monorepo pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-platform Go binaries | Custom build scripts per OS/arch | GoReleaser | Handles cross-compilation, checksums, changelogs, archives, and Homebrew formula in one config |
| Homebrew formula generation | Manual Ruby formula file | GoReleaser `homebrew_casks` | Auto-generates and pushes formula to tap repo on each release |
| Usage-based billing | Custom metering + invoice system | Stripe Billing Meters | Handles aggregation, invoicing, proration, dunning, tax -- thousands of edge cases |
| Documentation search | Custom search indexing | Nextra built-in (Pagefind) | Static search index generated at build time, zero runtime cost |
| Changelog generation | Manual CHANGELOG.md | GoReleaser `changelog` section | Auto-generates from git commits between tags |
| License compliance | Copy-paste license text | Standard Apache 2.0 template from choosealicense.com | Exact legal text matters; don't paraphrase |

**Key insight:** Phase 10 is primarily an integration/packaging phase. Every component has a mature, standard solution. The value is in correct wiring, not custom logic.

## Common Pitfalls

### Pitfall 1: Stripe SDK Import Path in Workers
**What goes wrong:** Using `import Stripe from 'stripe'` instead of `import Stripe from 'stripe/lib/stripe.js'` in Cloudflare Workers causes runtime errors.
**Why it happens:** The default entry point pulls in Node.js-specific modules. The `/lib/stripe.js` path bypasses the Node.js-specific wrapper.
**How to avoid:** Always use the explicit import path: `import Stripe from 'stripe/lib/stripe.js'` and initialize with `Stripe.createFetchHttpClient()`.
**Warning signs:** Build succeeds but runtime throws "Cannot find module 'http'" or similar Node.js module errors.

### Pitfall 2: GoReleaser homebrew_casks vs Deprecated brews
**What goes wrong:** Using the deprecated `brews` section in `.goreleaser.yaml` instead of the newer `homebrew_casks`.
**Why it happens:** Most tutorials and examples online still show the old `brews` configuration. GoReleaser v2.10 deprecated `brews` in favor of `homebrew_casks`.
**How to avoid:** Use `homebrew_casks` section. The migration is mostly just renaming `brews` to `homebrew_casks`.
**Warning signs:** GoReleaser deprecation warnings during build.

### Pitfall 3: Stripe Meter Event Timestamps
**What goes wrong:** Meter events with timestamps older than 35 calendar days or more than 5 minutes in the future are rejected by Stripe.
**Why it happens:** Delayed or batch processing of events without checking timestamp bounds.
**How to avoid:** Always use the current time for meter events. If batch processing, validate timestamps before sending.
**Warning signs:** `timestamp_too_far_in_past` errors from Stripe API.

### Pitfall 4: GoReleaser fetch-depth: 0 in GitHub Actions
**What goes wrong:** GoReleaser fails with "git log" errors or generates incorrect changelogs.
**Why it happens:** Default `actions/checkout` uses `fetch-depth: 1` (shallow clone). GoReleaser needs full git history for changelog generation and tag comparison.
**How to avoid:** Always set `fetch-depth: 0` in the checkout step.
**Warning signs:** "could not determine first tag" errors, empty changelogs.

### Pitfall 5: Nextra v4 App Router Requirement
**What goes wrong:** Attempting to use Nextra v4 with the Pages Router causes errors.
**Why it happens:** Nextra v4 exclusively supports the App Router (introduced in Next.js 13+). The project's dashboard uses Next.js 15 which supports App Router.
**How to avoid:** Set up the docs site with App Router from the start. Do not copy the dashboard's configuration if it uses Pages Router.
**Warning signs:** Build errors mentioning pages directory or missing layout.tsx.

### Pitfall 6: Billing State Synchronization
**What goes wrong:** Customer upgrades/downgrades their plan on Stripe but the gateway still enforces the old plan limits.
**Why it happens:** Cached plan data in KV is stale.
**How to avoid:** Use Stripe webhooks to invalidate KV cache on subscription changes. Also use short TTLs (5 min) for the plan cache as a fallback. The gateway already has a scheduled cron -- could add cache refresh there too.
**Warning signs:** Users complain about limits not updating after plan changes.

### Pitfall 7: Self-Hosted Billing Toggle Not Actually Disabling Everything
**What goes wrong:** Self-hosted users see billing-related errors or Stripe SDK initialization failures.
**Why it happens:** The billing middleware runs unconditionally and tries to initialize Stripe even when billing is disabled.
**How to avoid:** Check `billing.enabled` before any Stripe SDK initialization. The Stripe import itself should be dynamic or the client creation should be conditional. Never require `STRIPE_SECRET_KEY` when billing is disabled.
**Warning signs:** Self-hosted Docker builds fail or log Stripe errors.

## Code Examples

### Stripe Client Initialization for Cloudflare Workers
```typescript
// Source: https://blog.cloudflare.com/announcing-stripe-support-in-workers/
import Stripe from 'stripe/lib/stripe.js'

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: '2025-12-18.acacia',
  })
}

// Initialize with Web Crypto for webhook signature verification
export const webCrypto = Stripe.createSubtleCryptoProvider()
```

### Stripe Meter Event Recording
```typescript
// Source: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api
export async function recordMeterEvent(
  stripe: Stripe,
  customerId: string,
  value: number = 1
): Promise<void> {
  await stripe.billing.meterEvents.create({
    event_name: 'feelr_api_calls',
    payload: {
      stripe_customer_id: customerId,
      value: String(value),
    },
  })
}
```

### GoReleaser Configuration for Monorepo CLI
```yaml
# .goreleaser.yaml -- repo root
version: 2
project_name: feelr

builds:
  - id: feelr-cli
    dir: cli
    main: .
    binary: feelr
    ldflags:
      - -s -w -X main.version={{.Version}} -X main.commit={{.ShortCommit}}
    env:
      - CGO_ENABLED=0
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64

archives:
  - id: feelr-archive
    builds:
      - feelr-cli
    format: tar.gz
    format_overrides:
      - goos: windows
        format: zip
    name_template: "{{ .ProjectName }}_{{ .Version }}_{{ .Os }}_{{ .Arch }}"

homebrew_casks:
  - name: feelr
    binaries:
      - feelr
    repository:
      owner: andrewprograde
      name: homebrew-feelr
    homepage: "https://feelr.dev"
    description: "Agent-friendly API simplification layer CLI"
    commit_author:
      name: goreleaserbot
      email: bot@feelr.dev

changelog:
  sort: asc
  filters:
    exclude:
      - '^docs:'
      - '^test:'
      - '^ci:'
```

### GitHub Actions Release Workflow
```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version-file: cli/go.mod

      - name: Run GoReleaser
        uses: goreleaser/goreleaser-action@v6
        with:
          version: "~> v2"
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Nextra v4 Documentation Site Configuration
```javascript
// apps/docs/next.config.mjs
import nextra from 'nextra'

const withNextra = nextra({
  // options
})

export default withNextra({
  output: 'export',
  images: {
    unoptimized: true,
  },
})
```

### Plan Enforcement Middleware Pattern
```typescript
// Billing plan enforcement middleware (cloud only)
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../lib/types'

interface PlanLimits {
  api_calls_per_month: number
  connectors: number | 'unlimited'
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  hatchling: { api_calls_per_month: 1000, connectors: 5 },
  lobster:   { api_calls_per_month: 50000, connectors: 'unlimited' },
  leviathan: { api_calls_per_month: 500000, connectors: 'unlimited' },
}

export function planEnforcer(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.env.FEELR_CONFIG.billing.enabled) {
      return next()
    }
    // Check cached plan limits from KV
    // If over quota, return 402 with upgrade hint
    // Else continue
    await next()
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stripe Usage Records API | Stripe Billing Meters API | Removed in API v2025-03-31 | Must use meters; usage records are deprecated |
| GoReleaser `brews` section | GoReleaser `homebrew_casks` section | v2.10 (late 2025) | `brews` deprecated; `homebrew_casks` is the correct approach for pre-compiled binaries |
| Nextra v3 (Pages Router) | Nextra v4 (App Router only) | 2025 | Must use App Router; Pages Router not supported |
| Stripe `node-fetch` polyfill in Workers | Native `createFetchHttpClient()` | Oct 2025 | No polyfills needed; import from `stripe/lib/stripe.js` |

**Deprecated/outdated:**
- `stripe.subscriptionItems.createUsageRecord()` -- removed in API v2025-03-31; use `stripe.billing.meterEvents.create()` instead
- GoReleaser `brews` -- deprecated in v2.10; use `homebrew_casks`
- Nextra v3 -- only v4 supports Next.js 15 App Router

## Open Questions

1. **Stripe Plan-to-Tier Mapping**
   - What we know: The gateway has free/pro/enterprise rate limit tiers. The strategy doc has Hatchling/Lobster/Leviathan pricing tiers.
   - What's unclear: Exact mapping between strategy doc plans and gateway tiers. Does "Hatchling" map to "free" tier? Does "Lobster" map to "pro"?
   - Recommendation: Map Hatchling=free (30 req/min, 1000/mo), Lobster=pro (300 req/min, 50K/mo), Leviathan=enterprise (3000 req/min, 500K/mo). This aligns rate limits with plan names naturally.

2. **Stripe Customer-to-API-Key Association**
   - What we know: API keys have a `tier` field. Need to link keys to Stripe customers for billing.
   - What's unclear: Whether to store `stripeCustomerId` in the API key record or in a separate KV namespace. Whether one customer can have multiple keys.
   - Recommendation: Add `stripeCustomerId` to `ApiKeyRecord`. One Stripe customer can have multiple API keys, all sharing the same plan. Usage is aggregated at the customer level.

3. **Documentation Site Hosting**
   - What we know: Strategy says `feelr.dev/docs`. The project uses Cloudflare for hosting.
   - What's unclear: Whether to deploy the docs as a separate Cloudflare Pages project at a `/docs` path, or build it into the existing self-hosted Docker image, or host it separately.
   - Recommendation: Deploy docs as a separate Cloudflare Pages project. Use a `_routes.json` or Cloudflare Page Rule to serve `feelr.dev/docs` from the Pages project. Keep it independent of the gateway.

4. **Homebrew Tap Repository**
   - What we know: GoReleaser pushes Homebrew formulas to a separate GitHub repository.
   - What's unclear: The exact repository name to create.
   - Recommendation: Create `andrewprograde/homebrew-feelr` repository. This follows the Homebrew naming convention (`homebrew-*`), allowing `brew tap andrewprograde/feelr && brew install feelr`.

5. **Open-Source License Choice**
   - What we know: Project is meant to be open-source + self-hostable with a commercial cloud offering.
   - What's unclear: No license file exists yet. The strategy doc doesn't specify a license.
   - Recommendation: Apache 2.0. It provides patent protection (important for a project with a commercial offering), is widely recognized, and is the standard for projects with this model (e.g., Kubernetes, Terraform before BSL switch). MIT is simpler but lacks patent grant.

## Sources

### Primary (HIGH confidence)
- GoReleaser official docs -- builds configuration: https://goreleaser.com/customization/builds/go/
- GoReleaser official docs -- GitHub Actions: https://goreleaser.com/ci/actions/
- GoReleaser official docs -- homebrew_casks: https://goreleaser.com/customization/homebrew_casks/
- Stripe billing meters API: https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide
- Stripe meter events API: https://docs.stripe.com/api/billing/meter-event
- Stripe meter event recording: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api
- Cloudflare blog -- Stripe SDK in Workers: https://blog.cloudflare.com/announcing-stripe-support-in-workers/
- Nextra v4 docs: https://nextra.site/docs
- Nextra static exports: https://nextra.site/docs/guide/static-exports

### Secondary (MEDIUM confidence)
- GoReleaser `homebrew_casks` introduction blog: https://goreleaser.com/blog/goreleaser-v2.10/
- Nextra 4 App Router migration guide: https://the-guild.dev/blog/nextra-4
- GoReleaser goreleaser-action v6: https://github.com/goreleaser/goreleaser-action

### Tertiary (LOW confidence)
- Stripe meter event rate limits (1000/s standard, 10000/s v2) -- from Stripe docs but untested with Cloudflare Workers `waitUntil` pattern
- Nextra v4 + Next.js 15 compatibility -- users reported peer dependency warnings (https://github.com/shuding/nextra/issues/4279) -- needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools are mature, well-documented, and widely adopted. Stripe SDK + Workers is officially supported. GoReleaser is the de facto Go distribution tool. Nextra is the standard Next.js docs framework.
- Architecture: HIGH - Billing middleware pattern follows existing gateway middleware chain. GoReleaser monorepo pattern is documented. Docs site is a standard static export.
- Pitfalls: HIGH - Verified via official docs (Stripe import path, GoReleaser fetch-depth, deprecated APIs). Multiple sources confirm.

**Research date:** 2026-02-09
**Valid until:** 2026-03-11 (30 days -- all tools are stable releases)
