# Phase 3: GitHub Connector - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

First end-to-end connector validating the full gateway-to-response pipeline. Implements GitHub actions (issues, PRs, repos) using PAT authentication, with flattened responses in the standard envelope. This phase proves the Connector SDK, auth vault, and dispatch system work together. OAuth-based connectors are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Response flattening
- Claude's discretion on flattening depth (IDs+names vs one-level nesting) — optimize for agent token efficiency
- Default to essential fields (~10-15 per resource); support `?raw=true` to get GitHub's full response passthrough
- Claude's discretion on pagination approach (cursor in meta, auto-paginate option, etc.)
- Claude's discretion on date format (ISO 8601 vs unix timestamps)

### Action naming & params
- Claude's discretion on exact action count — at least 8 per roadmap, may include get-single variants if they validate different code paths
- Claude's discretion on repo param format (single "owner/repo" string vs separate params)
- Claude's discretion on filter exposure (curated subset vs pass-through)
- Claude's discretion on PR merge method param

### Error mapping
- Claude's discretion on GitHub rate limit handling strategy (surface with retry hint vs auto-retry)
- Claude's discretion on auth error specificity (scope hints vs generic auth hint)
- Forward GitHub's field-level validation errors in Feelr error response — agents need these to fix and retry
- Claude's discretion on 404 ambiguity (GitHub intentionally conflates not-found and no-permission)

### Health & status
- `/status` defaults to shallow check via GitHub's `/rate_limit` endpoint (fast, doesn't consume quota)
- Optional deep check flag to verify stored PAT validity via `/user`
- Include rate limit remaining info (remaining/limit, reset time) — agents use this to plan batch operations
- `/status` is authenticated (requires API key) — rate limit info is per-token context
- Claude's discretion on whether to report all configured connectors or just GitHub

### Claude's Discretion
- Response flattening depth and field selection
- Pagination design
- Date format normalization
- Exact action set beyond the required 8
- Repo param format
- Filter/query param exposure
- Rate limit error handling strategy
- Auth error specificity
- 404 disambiguation approach
- Status endpoint connector scope

</decisions>

<specifics>
## Specific Ideas

- User wants `/status` to use `/rate_limit` by default for speed, with an opt-in flag for deeper auth verification
- Rate limit remaining should be visible in status response so agents can plan batch operations before hitting limits
- GitHub's field-level validation errors must be forwarded (not swallowed) — agents need actionable error detail

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-github-connector*
*Context gathered: 2026-02-06*
