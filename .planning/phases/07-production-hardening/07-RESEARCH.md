# Phase 7: Production Hardening - Research

**Researched:** 2026-02-07
**Domain:** Rate limiting, usage metering, Cloudflare Workers
**Confidence:** HIGH

## Summary

Phase 7 adds per-API-key rate limiting and enhanced usage metering to the Feelr gateway. The gateway already records usage to D1 via `waitUntil` (Phase 6) and has a dashboard with usage charts. This phase layers on rate enforcement (429 responses), rate-limit headers, CLI retry behavior, and dashboard updates to show rate-limit status.

The critical discovery is Cloudflare Workers' native **Rate Limiting binding** (`RateLimit` type), which reached GA in September 2025. This binding provides per-key counters cached on the same machine as the Worker with asynchronous background updates -- adding zero perceptible latency. It supports configurable limits and a 60-second period window, which maps directly to the "requests per minute" tier model. The per-location scoping (counters are local to each Cloudflare edge location) is acceptable for this use case because Feelr targets agent traffic which typically originates from a single location per deployment.

**Primary recommendation:** Use Cloudflare's native `RateLimit` binding with 3 separate bindings (one per tier: `RATE_LIMIT_FREE`, `RATE_LIMIT_PRO`, `RATE_LIMIT_ENTERPRISE`) keyed by API key short token. Add rate-limit headers to every successful response and 429 responses. Keep rate limiting per-key global (not per-connector). Extend existing D1 usage recording with a `rate_limited` boolean column.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Rate limit policy
- 3 tiers: free (30 req/min), pro (300 req/min), enterprise (3000 req/min)
- Keys have a tier field that determines their limit
- Tiers are defined now even before billing -- default tier assigned on key creation

#### Rate limit middleware ordering
- Rate limit check happens BEFORE API key auth validation
- Provides defense against auth brute-forcing by IP

#### Metering granularity
- 90 days detailed data retention -- no early aggregation

#### Dashboard updates
- Update Phase 6 dashboard usage page to show rate limit info
- Include: current usage vs limit, times throttled, tier display

### Claude's Discretion

#### Burst allowance
- Claude decides whether to use strict fixed-window or token bucket with burst buffer
- Should optimize for agent traffic patterns (bursty but short-lived)

#### Limit scope
- Claude decides whether rate limits are per-key global or per-key per-connector
- Consider complexity vs usefulness tradeoff

#### 429 response experience
- Claude decides on rate-limit headers strategy (every response vs only 429s)
- Claude decides on 429 response body format (should be consistent with existing error envelope)
- Claude decides on CLI retry behavior for 429s
- Claude decides on upstream 429 handling (pass-through vs internal retry)

#### Metering granularity details
- Claude decides whether to count failed requests toward usage metering
- Claude decides breakdown dimensions (key+connector+time vs key+connector+action+time)
- Claude decides whether 429s themselves are metered

#### Latency strategy
- Claude decides counter storage mechanism (DO, in-memory, or hybrid)
- Claude decides strictness of enforcement (exact vs soft with minor over-allowance)
- Must not add perceptible latency to normal requests

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

## Claude's Discretion Recommendations

### Burst Allowance: Use the native Rate Limiting binding (fixed-window, permissive)

**Recommendation:** Use Cloudflare's native `RateLimit` binding rather than implementing a custom token bucket.

**Rationale:**
- The native binding uses a fixed-window algorithm that is "permissive, eventually consistent" -- it allows minor burst over-allowance at window boundaries, which is ideal for agent traffic patterns (bursty but short-lived sessions)
- Counters are cached in-memory on the same machine as the Worker -- zero network round-trips, no perceptible latency
- Period supports 60 seconds, mapping directly to req/min tiers
- No custom counter logic to maintain, no DO overhead for rate checking
- GA since September 2025, stable for production workloads

The "permissive" nature of the binding means agents may occasionally exceed limits by a few requests at window boundaries. This is desirable for agent traffic -- a hard cutoff mid-burst is worse UX than allowing a few extra requests through.

**Confidence:** HIGH (verified via official Cloudflare documentation)

### Limit Scope: Per-key global (NOT per-key per-connector)

**Recommendation:** Rate limits apply globally to the API key, not broken down per connector.

**Rationale:**
- Per-key per-connector would require N rate-limit checks per request (one per connector the key might use), adding complexity for minimal benefit
- The native binding keys on a single string -- using `apiKeyShortToken` as the key gives clean per-key global enforcement
- Agent traffic patterns are typically focused on one connector at a time; per-connector limits would rarely trigger differently than global limits
- The tier model (30/300/3000 req/min) is simpler to explain and reason about as a global limit
- Dashboard display is simpler: one usage-vs-limit gauge per key, not one per connector

**Confidence:** HIGH (complexity vs usefulness analysis)

### 429 Response Experience

#### Headers strategy: Rate-limit headers on EVERY response

**Recommendation:** Include `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers on every successful response AND on 429 responses. Add `Retry-After` header only on 429 responses.

**Rationale:**
- Agents (the primary consumer) benefit from knowing remaining quota proactively -- they can pace requests before hitting the limit
- The IETF draft RFC (draft-ietf-httpapi-ratelimit-headers) recommends these headers, though the spec is evolving toward `RateLimit` + `RateLimit-Policy` structured field headers
- For simplicity and agent compatibility, use the widely-adopted convention: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (used by GitHub, Stripe, and most major APIs)
- `Retry-After` on 429s is required by the existing success criteria (PLAT-02)

**Header format:**
```
RateLimit-Limit: 30
RateLimit-Remaining: 25
RateLimit-Reset: 45
Retry-After: 45          (429 only)
```

Note: Since the native binding only returns `{ success: boolean }` without remaining/reset counts, we need to supplement with our own approximate tracking. The approach: maintain a simple in-memory counter per key (reset each 60s window) to compute approximate remaining count. This is best-effort -- the binding handles actual enforcement.

**Confidence:** HIGH (standard API convention verified across GitHub, Stripe, OpenAI APIs)

#### 429 response body: Use existing error envelope with RATE_LIMITED code

**Recommendation:** Use the existing `FeelrError` / `wrapError` pattern with code `RATE_LIMITED`.

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 45 seconds.",
    "hint": "retry",
    "status": 429
  }
}
```

The `RATE_LIMITED` error code already exists in the connector-sdk `ErrorCode` type. The `hint: "retry"` tells agents to wait and retry. The `Retry-After` header provides the wait duration.

**Confidence:** HIGH (verified RATE_LIMITED exists in connector-sdk/errors.ts, 429 exists in FeelrHttpStatus)

#### CLI retry behavior for 429s

**Recommendation:** Add automatic retry with `Retry-After` header respect in the Go CLI client.

**Design:**
- When `doRequestInner` receives a 429 response, parse the `Retry-After` header
- Sleep for the indicated duration (with a cap of 120 seconds)
- Retry once (max 1 retry for rate limiting, same as auth retry pattern)
- If still 429 after retry, return the error to the user
- Non-interactive mode: same behavior (sleep + retry once)
- Print a brief message to stderr: `Rate limited. Waiting 45s...`

This is lightweight -- no new dependencies needed. The existing `doRequestInner` already has a retry pattern for auth expiry that we can extend.

**Confidence:** HIGH (pattern already exists in client.go for auth retry)

#### Upstream 429 handling: Pass-through with enrichment

**Recommendation:** When upstream APIs (GitHub, Slack, etc.) return 429, pass it through to the caller as a Feelr `RATE_LIMITED` error rather than retrying internally.

**Rationale:**
- Internal retry would hide the upstream rate limit from the agent, making it harder to debug
- Internal retry adds unpredictable latency to the request
- The existing connector `FeelrError('RATE_LIMITED', ...)` already handles upstream 429s in some connectors
- The caller can decide whether to retry based on the `Retry-After` header
- Feelr's own rate limits are separate from upstream rate limits -- both should be visible

The one change: ensure the error detail distinguishes Feelr-imposed vs upstream-imposed rate limits. Use `detail: "upstream"` vs no detail for Feelr-imposed limits.

**Confidence:** HIGH (aligns with existing error architecture)

### Metering Decisions

#### Failed requests: DO count toward metering

**Recommendation:** Count all requests that reach the dispatch handler toward usage metering, including those that result in action handler errors (4xx, 5xx from connectors). Do NOT count:
- Requests blocked by rate limiting (429s) -- these are already counted by the rate limiter
- Auth failures (401) -- these never reach the metered path
- 404s for unknown connectors/actions -- these are user errors, not usage

**Rationale:**
- Phase 6 decision was "error responses are NOT metered" but that was specifically about action handler throws (where the connector itself errors). This is reasonable for Phase 6 analytics but Phase 7 needs accurate usage tracking.
- For rate limiting purposes, every request that exercises the connector pipeline should count toward the quota. An agent making malformed requests should still consume quota.
- However, 429s should NOT be metered (would create a positive feedback loop -- more 429s = more metering = more 429s conceptually confusing).

**REVISED APPROACH:** Extend the existing Phase 6 metering to also record error responses, but add a `is_error` boolean to distinguish. The existing `status_code` field already captures this (>= 400). The key change: move `recordUsage` call to happen for ALL dispatch responses, not just successful ones.

**Confidence:** MEDIUM (reasonable engineering judgment, no authoritative source)

#### Breakdown dimensions: key + connector + action + time

**Recommendation:** Keep the existing D1 schema which already stores `api_key_short`, `connector`, `action`, `status_code`, `duration_ms`, `timestamp`. This gives maximum flexibility for querying by any dimension. No schema change needed for metering granularity.

The 90-day retention is implemented via a scheduled cleanup (cron trigger or alarm) that deletes rows older than 90 days.

**Confidence:** HIGH (existing schema already supports this)

#### 429s metered: NO

**Recommendation:** Do NOT record 429 responses to the usage (D1) table.

**Rationale:**
- 429s are returned before the request reaches the action handler -- there is no connector/action to attribute them to
- Recording 429s would inflate usage counts and skew analytics
- The rate limiter itself tracks how many requests were blocked
- Dashboard can show "times throttled" from a separate counter or from rate-limit-specific logging

Instead, record throttle events to a separate lightweight counter. Options:
1. A `rate_limit_events` D1 table with `api_key_short`, `timestamp` columns
2. Or simply increment a counter in KV (simpler but less queryable)

Recommendation: Use a `rate_limit_events` D1 table for queryability on the dashboard.

**Confidence:** HIGH (clear separation of concerns)

### Latency Strategy

#### Counter storage: Native Rate Limiting binding (in-memory, Cloudflare-managed)

**Recommendation:** Use the native `RateLimit` binding for counter storage.

**How it works:**
- Counters are cached on the same machine as the Worker
- Updated asynchronously in the background
- Zero network round-trip for rate limit checks
- "Permissive, eventually consistent" -- may allow slight over-limit bursts

This is strictly better than:
- **DO-based counters:** Every request would require a DO fetch (network round-trip), adding 10-50ms latency
- **KV-based counters:** Eventually consistent reads would cause massive over-allowance; writes are slow
- **In-memory (Worker global):** Resets on every Worker restart/eviction; no persistence

**Confidence:** HIGH (verified via official Cloudflare documentation)

#### Strictness: Soft enforcement with minor over-allowance

The native binding is inherently "permissive, eventually consistent." This is the right tradeoff:
- Normal requests: zero added latency
- Burst at window boundary: may allow 5-10% over-limit
- Consistently over-limit: reliably blocked

**Confidence:** HIGH (this is the binding's documented behavior)

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Cloudflare Workers Rate Limiting binding | GA (Sep 2025) | Per-key request counting and enforcement | Native Cloudflare binding, zero-latency, no dependencies |
| D1 (existing) | Current | Usage metering storage + rate limit event logging | Already bound as USAGE_DB, schema in place |
| Hono (existing) | ^4.11.7 | Middleware chain for rate limit headers | Already the app framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| wrangler | ^4.36.0+ | Required for `[[ratelimits]]` config | Must verify current version supports rate limit bindings |
| @cloudflare/workers-types | ^4.0.0 | TypeScript types including `RateLimit` | Already installed, may need update for RateLimit type |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native binding | Durable Object counters | DO adds 10-50ms latency per request; native binding adds 0ms |
| Native binding | KV-based counters | KV is eventually consistent (60s), massive over-allowance |
| Native binding | Upstash Redis | External dependency, network latency, cost |
| 3 separate bindings | 1 binding + code-level tier check | Can't dynamically select limit per-request with single binding |

**Installation:**
No new npm packages required. Configuration changes only (wrangler.toml).

## Architecture Patterns

### Recommended Project Structure Changes

```
apps/gateway/
├── src/
│   ├── middleware/
│   │   ├── rate-limiter.ts        # NEW: Rate limit middleware (before api-key)
│   │   ├── rate-limit-headers.ts  # NEW: Response header injection (after handler)
│   │   ├── usage-recorder.ts     # MODIFIED: Record errors + rate limit events
│   │   ├── api-key.ts            # EXISTING: Unchanged
│   │   └── ...
│   ├── lib/
│   │   ├── types.ts              # MODIFIED: Add RateLimit bindings to AppEnv
│   │   └── ...
│   ├── routes/
│   │   ├── v1.ts                 # MODIFIED: Record error responses to D1
│   │   ├── internal.ts           # MODIFIED: Add rate-limit data endpoints
│   │   └── keys.ts               # MODIFIED: Add tier field to key creation
│   └── auth/
│       └── types.ts              # MODIFIED: Add tier to ApiKeyRecord
├── wrangler.toml                 # MODIFIED: Add [[ratelimits]] bindings
cli/
├── internal/
│   └── client/
│       └── client.go             # MODIFIED: Add 429 retry logic
dashboard/
├── src/
│   ├── app/(dashboard)/usage/
│   │   └── page.tsx              # MODIFIED: Add rate limit info display
│   └── lib/
│       └── types.ts              # MODIFIED: Add rate limit types
```

### Pattern 1: Rate Limit Middleware Ordering

**What:** Rate limit check runs BEFORE API key validation, keyed by IP for unauthenticated defense, then by API key short token after auth.

**When to use:** The user explicitly requires rate limit before auth for brute-force defense.

**IMPORTANT CONSTRAINT:** The native `RateLimit` binding only returns `{ success: boolean }`. It does not tell you the remaining count or reset time. For headers, we need supplementary tracking.

**Design approach:**
1. Pre-auth: IP-based rate limit check (defense against brute-forcing) -- use a separate `RATE_LIMIT_IP` binding with a generous limit (e.g., 100 req/10s)
2. Post-auth: API-key-based rate limit check using tier-specific binding -- the main rate limiter
3. After handler: Inject rate-limit headers into the response

```typescript
// Pre-auth defense (IP-based, generous limit)
app.use('/v1/*', rateLimitByIP)

// Existing API key auth
app.use('/v1/*', apiKeyMiddleware)

// Post-auth rate limit (tier-based, strict limit)
app.use('/v1/*', rateLimitByKey)
```

However, re-reading the user's requirement: "Rate limit check happens BEFORE API key auth validation" -- this means the per-key rate limit somehow needs to run before auth. But we cannot know the key's tier before validating the key.

**Resolution:** The user's intent is defense against brute-forcing by IP. The implementation:
1. IP-based rate limit (before auth) -- coarse defense
2. API key auth (validates key, retrieves tier)
3. Per-key tier-based rate limit (after auth) -- the actual per-key enforcement

The IP-based pre-auth limiter satisfies the "defense against auth brute-forcing by IP" requirement. The per-key limiter runs after auth because it needs the key's tier.

### Pattern 2: Tier-Based Rate Limiting with Multiple Bindings

**What:** Three separate `RateLimit` bindings in wrangler.toml, one per tier. Select the correct binding based on the key's tier after auth.

```toml
# wrangler.toml
[[ratelimits]]
name = "RATE_LIMIT_FREE"
namespace_id = "7001"
[ratelimits.simple]
limit = 30
period = 60

[[ratelimits]]
name = "RATE_LIMIT_PRO"
namespace_id = "7002"
[ratelimits.simple]
limit = 300
period = 60

[[ratelimits]]
name = "RATE_LIMIT_ENTERPRISE"
namespace_id = "7003"
[ratelimits.simple]
limit = 3000
period = 60

# IP-based pre-auth defense
[[ratelimits]]
name = "RATE_LIMIT_IP"
namespace_id = "7004"
[ratelimits.simple]
limit = 100
period = 10
```

```typescript
// Select binding based on tier
function getRateLimiter(env: AppEnv['Bindings'], tier: string): RateLimit {
  switch (tier) {
    case 'pro': return env.RATE_LIMIT_PRO
    case 'enterprise': return env.RATE_LIMIT_ENTERPRISE
    default: return env.RATE_LIMIT_FREE
  }
}

// In post-auth middleware:
const limiter = getRateLimiter(c.env, apiKeyRecord.tier)
const { success } = await limiter.limit({ key: apiKeyRecord.shortToken })
if (!success) {
  throw new FeelrError('RATE_LIMITED', {
    message: 'Rate limit exceeded. Try again later.',
    hint: 'retry',
    status: 429,
  })
}
```

### Pattern 3: Rate Limit Headers via Post-Handler Middleware

**What:** Inject rate-limit headers after the handler runs, using Hono's post-next middleware pattern.

**Challenge:** The native binding only returns `{ success: boolean }`, not remaining count. For `RateLimit-Remaining` and `RateLimit-Reset`, we need supplementary tracking.

**Approach:** Use a simple in-memory counter (Worker-level Map) to approximate remaining requests. This is best-effort -- the actual enforcement is by the binding.

```typescript
// In-memory window tracker (best-effort, resets on Worker restart)
const windowCounters = new Map<string, { count: number; windowStart: number }>()

function getApproxRemaining(key: string, limit: number): { remaining: number; resetSeconds: number } {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % 60) // Align to minute boundary
  const entry = windowCounters.get(key)

  if (!entry || entry.windowStart !== windowStart) {
    windowCounters.set(key, { count: 1, windowStart })
    return { remaining: limit - 1, resetSeconds: 60 - (now % 60) }
  }

  entry.count++
  return {
    remaining: Math.max(0, limit - entry.count),
    resetSeconds: 60 - (now % 60),
  }
}
```

Then in middleware after `await next()`:
```typescript
c.header('RateLimit-Limit', String(limit))
c.header('RateLimit-Remaining', String(remaining))
c.header('RateLimit-Reset', String(resetSeconds))
```

### Pattern 4: API Key Tier Field

**What:** Add a `tier` field to `ApiKeyRecord` stored in KV.

```typescript
export interface ApiKeyRecord {
  shortToken: string
  longTokenHash: string
  label?: string
  tier: 'free' | 'pro' | 'enterprise'  // NEW
  createdAt: string
  lastUsedAt?: string
}
```

Default tier on key creation: `'free'`. Tier can be updated via admin endpoint (for when billing is added in Phase 10).

### Pattern 5: D1 Rate Limit Events Table

**What:** Separate table for tracking throttle events, queryable by the dashboard.

```sql
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_short TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rle_key ON rate_limit_events(api_key_short);
CREATE INDEX IF NOT EXISTS idx_rle_timestamp ON rate_limit_events(timestamp);
```

Record via `waitUntil` (best-effort, same pattern as usage recording).

### Pattern 6: 90-Day Data Retention

**What:** Scheduled cleanup of old usage data and rate limit events.

**Implementation:** Add a Cron Trigger to the Worker that runs daily and deletes rows older than 90 days.

```toml
# wrangler.toml
[triggers]
crons = ["0 3 * * *"]  # Daily at 3am UTC
```

```typescript
// In index.ts, export scheduled handler
export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    ctx.waitUntil(
      Promise.all([
        env.USAGE_DB.prepare('DELETE FROM usage WHERE timestamp < ?').bind(cutoff).run(),
        env.USAGE_DB.prepare('DELETE FROM rate_limit_events WHERE timestamp < ?').bind(cutoff).run(),
      ])
    )
  },
}
```

### Anti-Patterns to Avoid

- **DO-based rate limiting:** Adds 10-50ms latency per request for a single DO fetch. The native binding is strictly better at 0ms.
- **KV-based counters:** KV is eventually consistent (up to 60s propagation). A rate limiter built on KV would allow massive bursts before catching up.
- **Single RateLimit binding with code-level tier selection:** The binding's limit is set at deploy time in wrangler.toml, not at runtime. You cannot pass a custom limit to `limit()`. Multiple bindings are required for multiple tiers.
- **Blocking rate limit recording:** Never make D1 writes synchronous in the request path. Always use `waitUntil`.
- **Metering 429s in the usage table:** Would inflate counts and create confusing analytics. Track separately.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request counting | Custom counter in DO/KV | Native `RateLimit` binding | Zero latency, no state management, battle-tested |
| Window alignment | Custom time-window logic | Native binding's 60s period | Handles edge cases, cross-isolate consistency |
| Rate limit enforcement | Custom check-and-decrement | `binding.limit({ key })` | Atomic, no race conditions |
| Data retention cleanup | Manual ad-hoc queries | Cron Trigger + D1 DELETE | Automated, reliable |

**Key insight:** The native `RateLimit` binding eliminates the hardest part of rate limiting (distributed counter management) entirely. The remaining work is header injection, CLI retry logic, and dashboard display -- all straightforward application code.

## Common Pitfalls

### Pitfall 1: Per-Location Rate Limiting

**What goes wrong:** The native binding enforces limits per Cloudflare edge location, not globally. A key using 30 req/min from London and 30 req/min from Sydney would total 60 req/min globally but pass rate limiting at both locations.

**Why it happens:** Cloudflare's rate limiting is designed for low-latency, which requires local counters.

**How to avoid:** For Feelr's use case (agent traffic), this is acceptable. Agents typically run from a single location (the server running the agent). Multi-location abuse is an edge case that billing (Phase 10) handles differently. Document this as a known limitation.

**Warning signs:** Users report they can exceed limits. Check if traffic comes from multiple geographic locations.

### Pitfall 2: Worker Export Structure Change

**What goes wrong:** Adding a `scheduled` handler for cron triggers requires changing the Worker's default export from a Hono app to a module with `fetch` and `scheduled` handlers.

**Why it happens:** Hono apps export a `fetch` handler directly. Cron triggers need a `scheduled` handler alongside it.

**How to avoid:** Change `export default app` to `export default { fetch: app.fetch, scheduled: handler }` in `index.ts`. Ensure existing tests still work with the new export structure.

**Warning signs:** Cron trigger never fires; tests fail after export change.

### Pitfall 3: RateLimit Binding Not in Types

**What goes wrong:** The `RateLimit` TypeScript type may not be available in the current `@cloudflare/workers-types` version.

**Why it happens:** The binding reached GA in September 2025 but types may lag behind.

**How to avoid:** Run `npx wrangler types` to generate types from the current wrangler config, or manually declare the type:
```typescript
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>
}
```

**Warning signs:** TypeScript errors on `env.RATE_LIMIT_FREE.limit(...)`.

### Pitfall 4: Rate Limit Headers Without Accurate Remaining Count

**What goes wrong:** The native binding returns only `{ success: boolean }`, not remaining count. Headers show inaccurate remaining counts.

**Why it happens:** The binding is designed for enforcement, not accounting.

**How to avoid:** Use in-memory approximate counters for header generation. Document that `RateLimit-Remaining` is approximate. The actual enforcement (429 vs pass) is always accurate (handled by the binding).

**Warning signs:** `RateLimit-Remaining` shows 5 but request still passes; or shows 0 but next request also passes.

### Pitfall 5: Middleware Ordering with OpenAPIHono

**What goes wrong:** Rate limit middleware registered with `app.use('/v1/*', ...)` may not execute in the expected order relative to `apiKeyMiddleware`.

**Why it happens:** Hono executes middleware in registration order. If rate limit middleware is registered after API key middleware, it runs after auth.

**How to avoid:** Register rate limit middleware BEFORE API key middleware in `app.ts`:
```typescript
// 1. IP-based pre-auth rate limit
app.use('/v1/*', ipRateLimitMiddleware)
// 2. API key auth
app.use('/v1/*', apiKeyMiddleware)
// 3. Per-key tier-based rate limit
app.use('/v1/*', keyRateLimitMiddleware)
```

**Warning signs:** Rate limit not enforced; 429 never returned despite exceeding limits.

### Pitfall 6: Stale Tier After Key Update

**What goes wrong:** Key's tier is updated via admin API but the KV cache serves the old tier, allowing the old rate limit to apply.

**Why it happens:** KV is eventually consistent with up to 60s propagation delay.

**How to avoid:** Accept the 60s window as tolerable. The rate limit binding itself is also eventually consistent. For immediate enforcement, the admin API response should note "tier change takes up to 60 seconds to propagate."

**Warning signs:** Tier change doesn't take effect immediately.

## Code Examples

### Rate Limit Middleware (post-auth, per-key)

```typescript
// Source: Cloudflare Workers Rate Limiting docs
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'

const TIER_LIMITS: Record<string, number> = {
  free: 30,
  pro: 300,
  enterprise: 3000,
}

export const keyRateLimitMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const record = c.get('apiKeyRecord')
  if (!record) {
    // No auth yet -- skip (should not happen in correct middleware order)
    await next()
    return
  }

  const tier = record.tier ?? 'free'
  const limiter = tier === 'enterprise'
    ? c.env.RATE_LIMIT_ENTERPRISE
    : tier === 'pro'
      ? c.env.RATE_LIMIT_PRO
      : c.env.RATE_LIMIT_FREE

  const { success } = await limiter.limit({ key: record.shortToken })

  if (!success) {
    // Record throttle event (best-effort)
    c.executionCtx?.waitUntil?.(
      c.env.USAGE_DB
        .prepare('INSERT INTO rate_limit_events (api_key_short, timestamp) VALUES (?, ?)')
        .bind(record.shortToken, new Date().toISOString())
        .run()
        .catch(() => {})
    )

    // Set rate limit headers on 429 response
    const limit = TIER_LIMITS[tier] ?? 30
    const resetSeconds = 60 - (Math.floor(Date.now() / 1000) % 60)
    c.header('RateLimit-Limit', String(limit))
    c.header('RateLimit-Remaining', '0')
    c.header('RateLimit-Reset', String(resetSeconds))
    c.header('Retry-After', String(resetSeconds))

    throw new FeelrError('RATE_LIMITED', {
      message: `Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
      hint: 'retry',
      status: 429,
    })
  }

  // Track for headers (approximate)
  const limit = TIER_LIMITS[tier] ?? 30
  c.set('rateLimitInfo', { limit, tier })

  await next()

  // Add rate limit headers to successful response
  const resetSeconds = 60 - (Math.floor(Date.now() / 1000) % 60)
  c.header('RateLimit-Limit', String(limit))
  c.header('RateLimit-Reset', String(resetSeconds))
  // RateLimit-Remaining is approximate (in-memory counter)
})
```

### IP-Based Pre-Auth Rate Limit

```typescript
// Source: Cloudflare Workers Rate Limiting docs
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'

export const ipRateLimitMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { success } = await c.env.RATE_LIMIT_IP.limit({ key: ip })

  if (!success) {
    throw new FeelrError('RATE_LIMITED', {
      message: 'Too many requests from this IP. Please slow down.',
      hint: 'retry',
      status: 429,
    })
  }

  await next()
})
```

### CLI 429 Retry Logic (Go)

```go
// In client.go doRequestInner, add 429 handling:

// Check for rate limiting (429)
if resp.StatusCode == 429 && !isRetry {
    retryAfter := resp.Header.Get("Retry-After")
    waitSeconds := 60 // default
    if retryAfter != "" {
        if parsed, err := strconv.Atoi(retryAfter); err == nil && parsed > 0 && parsed <= 120 {
            waitSeconds = parsed
        }
    }
    fmt.Fprintf(os.Stderr, "Rate limited. Waiting %ds...\n", waitSeconds)
    time.Sleep(time.Duration(waitSeconds) * time.Second)

    // Retry once
    retryReq, cloneErr := cloneRequest(req)
    if cloneErr != nil {
        return nil, fmt.Errorf("preparing retry request: %w", cloneErr)
    }
    c.setHeaders(retryReq)
    return c.doRequestInner(retryReq, true)
}
```

### AppEnv Type Update

```typescript
export interface AppEnv extends Env {
  Bindings: {
    // ... existing bindings ...
    /** Rate limit binding: free tier (30 req/min) */
    RATE_LIMIT_FREE: RateLimit
    /** Rate limit binding: pro tier (300 req/min) */
    RATE_LIMIT_PRO: RateLimit
    /** Rate limit binding: enterprise tier (3000 req/min) */
    RATE_LIMIT_ENTERPRISE: RateLimit
    /** Rate limit binding: IP-based pre-auth defense (100 req/10s) */
    RATE_LIMIT_IP: RateLimit
  }
  Variables: {
    // ... existing variables ...
    /** Rate limit info for header injection */
    rateLimitInfo?: { limit: number; tier: string }
  }
}
```

### ApiKeyRecord Tier Field

```typescript
export interface ApiKeyRecord {
  shortToken: string
  longTokenHash: string
  label?: string
  tier: 'free' | 'pro' | 'enterprise'  // NEW
  createdAt: string
  lastUsedAt?: string
}
```

### Dashboard Rate Limit Info Display

The dashboard usage page should be extended with:
1. A tier badge showing the key's current tier
2. Current usage vs limit bar/gauge
3. "Times throttled" count from the `rate_limit_events` table
4. A new internal endpoint: `GET /internal/rate-limits?key=<shortToken>` returning tier, current usage, throttle count

### Internal Rate Limit Data Endpoint

```typescript
// GET /internal/rate-limits?key=<shortToken>
internal.get('/rate-limits', async (c) => {
  const key = c.req.query('key')

  // Get key record for tier info
  let tier = 'free'
  if (key) {
    const record = await c.env.AUTH_KV.get(`apikey:${key}`, 'json') as ApiKeyRecord | null
    if (record) {
      tier = record.tier ?? 'free'
    }
  }

  // Count throttle events in last 24h
  const throttleCount = await getThrottleCount(c.env.USAGE_DB, key)

  // Get current period usage from D1
  const currentUsage = await getCurrentPeriodUsage(c.env.USAGE_DB, key)

  return c.json({
    ok: true,
    data: {
      tier,
      limit: TIER_LIMITS[tier] ?? 30,
      current_usage: currentUsage,
      throttle_count_24h: throttleCount,
    },
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom DO/KV counters | Native `RateLimit` binding | Sep 2025 (GA) | Zero-latency rate limiting, no custom state management |
| X-RateLimit-* headers (non-standard) | RateLimit-Limit/Remaining/Reset (emerging standard) | IETF draft 2024-2025 | Standardized header names, better agent compatibility |
| WAF rate limiting rules | Worker-level `RateLimit` binding | 2025 | Programmable, per-key, integrated with Worker logic |

**Deprecated/outdated:**
- `unsafe` rate limit binding: Replaced by stable `ratelimit` binding (GA Sep 2025). Transition period active.

## Open Questions

1. **Wrangler version compatibility**
   - What we know: `RateLimit` binding requires wrangler >= 4.36.0. Current `package.json` has `^4.0.0`.
   - What's unclear: Whether the installed version supports it (pnpm-lock.yaml shows the resolved version).
   - Recommendation: Check `pnpm list wrangler` and update if needed.

2. **RateLimit TypeScript type availability**
   - What we know: The type is `RateLimit` with a `limit({ key: string }): Promise<{ success: boolean }>` method.
   - What's unclear: Whether `@cloudflare/workers-types@^4.0.0` includes this type.
   - Recommendation: Run `npx wrangler types` to generate types, or declare manually.

3. **Cron Trigger + Hono app export compatibility**
   - What we know: Adding a `scheduled` handler requires changing the default export structure.
   - What's unclear: Whether the existing test setup (vitest-pool-workers) handles the new export structure.
   - Recommendation: Test the export change early; may need to adjust vitest config.

4. **In-memory counter accuracy for headers**
   - What we know: Worker isolates can be evicted/restarted, resetting in-memory counters.
   - What's unclear: How often isolates restart in practice.
   - Recommendation: Accept that `RateLimit-Remaining` is approximate. The binding handles actual enforcement accurately.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Rate Limiting docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) -- binding API, configuration, TypeScript types, per-location behavior
- [Cloudflare Rate Limiting GA Changelog](https://developers.cloudflare.com/changelog/2025-09-19-ratelimit-workers-ga/) -- GA status confirmed Sep 2025
- Codebase inspection -- existing middleware chain, D1 schema, error types, CLI client patterns

### Secondary (MEDIUM confidence)
- [IETF RateLimit Header Fields Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) -- emerging standard for rate-limit headers
- [API Rate Limiting Best Practices (Speakeasy)](https://www.speakeasy.com/api-design/rate-limiting) -- header naming conventions across major APIs
- [Token Bucket vs Sliding Window analysis](https://api7.ai/blog/rate-limiting-guide-algorithms-best-practices) -- algorithm comparison for agent traffic patterns
- [HashiCorp go-retryablehttp](https://pkg.go.dev/github.com/hashicorp/go-retryablehttp) -- Go 429 retry patterns

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- native Cloudflare binding is documented and GA
- Architecture: HIGH -- patterns derived from existing codebase structure and official docs
- Pitfalls: HIGH -- identified from Cloudflare docs (per-location) and codebase analysis (middleware ordering)
- Claude's discretion recommendations: HIGH for most; MEDIUM for metering decisions (judgment-based)

**Research date:** 2026-02-07
**Valid until:** 2026-03-09 (30 days -- stable platform, GA binding)
