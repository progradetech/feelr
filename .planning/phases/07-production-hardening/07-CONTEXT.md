# Phase 7: Production Hardening - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Enforce per-key rate limits and track usage consumption for every API key. The gateway returns 429 responses when limits are exceeded, stores usage data in D1, and exposes rate limit info through headers. Dashboard is updated to show rate limit status. No new connectors, no billing logic (Phase 10), no new API capabilities.

</domain>

<decisions>
## Implementation Decisions

### Rate limit policy
- 3 tiers: free (30 req/min), pro (300 req/min), enterprise (3000 req/min)
- Keys have a tier field that determines their limit
- Tiers are defined now even before billing — default tier assigned on key creation

### Claude's Discretion: Burst allowance
- Claude decides whether to use strict fixed-window or token bucket with burst buffer
- Should optimize for agent traffic patterns (bursty but short-lived)

### Claude's Discretion: Limit scope
- Claude decides whether rate limits are per-key global or per-key per-connector
- Consider complexity vs usefulness tradeoff

### 429 response experience
- Claude decides on rate-limit headers strategy (every response vs only 429s)
- Claude decides on 429 response body format (should be consistent with existing error envelope)
- Claude decides on CLI retry behavior for 429s
- Claude decides on upstream 429 handling (pass-through vs internal retry)

### Rate limit middleware ordering
- Rate limit check happens BEFORE API key auth validation
- Provides defense against auth brute-forcing by IP

### Metering granularity
- Claude decides whether to count failed requests toward usage metering
- Claude decides breakdown dimensions (key+connector+time vs key+connector+action+time)
- Claude decides whether 429s themselves are metered
- 90 days detailed data retention — no early aggregation

### Latency strategy
- Claude decides counter storage mechanism (DO, in-memory, or hybrid)
- Claude decides strictness of enforcement (exact vs soft with minor over-allowance)
- Must not add perceptible latency to normal requests

### Dashboard updates
- Update Phase 6 dashboard usage page to show rate limit info
- Include: current usage vs limit, times throttled, tier display

</decisions>

<specifics>
## Specific Ideas

- Phase 6 already records usage to D1 via waitUntil — build on that existing infrastructure
- Phase 6 dashboard usage page already has charts and filters — extend, don't rebuild
- Error responses from Phase 6 are NOT metered (noted in STATE.md) — Phase 7 should extend this decision consistently

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-production-hardening*
*Context gathered: 2026-02-07*
