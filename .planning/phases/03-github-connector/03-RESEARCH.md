# Phase 3: GitHub Connector - Research

**Researched:** 2026-02-06
**Domain:** GitHub REST API integration, Connector SDK implementation, response flattening, error mapping, status endpoint
**Confidence:** HIGH

## Summary

Phase 3 implements the first real connector -- GitHub -- validating the full pipeline from authenticated request through the auth vault to flattened response. This research covers the GitHub REST API (v2022-11-28), its endpoints for issues/PRs/repos, rate limiting and pagination patterns, error response formats, and how all of this maps onto the existing Connector SDK interfaces established in Phase 1.

The standard approach is: create a `connectors/github/` workspace package that implements `ConnectorDefinition` with 10 actions (the required 8 plus 2 get-single variants that exercise different code paths). Each action handler calls `api.github.com` via `ctx.fetch` with the user's PAT from `ctx.credential`, flattens the response to ~10-15 essential fields, and returns pagination metadata extracted from GitHub's Link header. The `/status` endpoint is a new gateway-level route (not connector-specific) that calls GitHub's `/rate_limit` endpoint for a zero-cost health check.

**Primary recommendation:** Build the GitHub connector as a standalone workspace package under `connectors/github/`, following the established template pattern. Implement a shared `githubFetch` helper that handles auth headers, API versioning, User-Agent, error mapping, and Link header pagination parsing. Each action is a thin layer over this helper, focused on flattening response fields.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `/status` defaults to shallow check via GitHub's `/rate_limit` endpoint (fast, doesn't consume quota)
- Optional deep check flag to verify stored PAT validity via `/user`
- Include rate limit remaining info (remaining/limit, reset time) -- agents use this to plan batch operations
- `/status` is authenticated (requires API key) -- rate limit info is per-token context
- Forward GitHub's field-level validation errors in Feelr error response -- agents need these to fix and retry
- Default to essential fields (~10-15 per resource); support `?raw=true` to get GitHub's full response passthrough

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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

---

## Discretionary Recommendations

These are researched recommendations for areas marked as Claude's Discretion.

### 1. Response Flattening Depth and Field Selection

**Recommendation:** Flatten to IDs + names for nested objects (user, labels, assignees, milestone). Keep one level of useful nesting eliminated.

**Rationale:** GitHub issue responses contain deeply nested objects (user has 18+ fields, label objects have 7+ fields each). An agent needs to know `user_login` and `assignee_login`, not `user.gravatar_id` or `user.events_url`. Flattening `user` to `user_login` and `user_avatar_url` cuts ~80% of the token cost.

**Specific field selections per resource:**

**Issue (13 fields):**
`id`, `number`, `state`, `state_reason`, `title`, `body`, `user_login`, `assignee_login`, `labels` (array of name strings), `comments`, `created_at`, `updated_at`, `closed_at`

**Pull Request (15 fields):**
`id`, `number`, `state`, `title`, `body`, `user_login`, `head_ref`, `head_sha`, `base_ref`, `merged`, `mergeable`, `labels` (array of name strings), `created_at`, `updated_at`, `merged_at`

**Repository (12 fields):**
`id`, `name`, `full_name`, `private`, `description`, `language`, `default_branch`, `stargazers_count`, `forks_count`, `open_issues_count`, `created_at`, `updated_at`

**Confidence:** HIGH -- based on direct review of GitHub API response schemas and agent token optimization principles.

### 2. Pagination Design

**Recommendation:** Use page-based pagination mapped to Feelr's cursor system. The cursor value is the page number (as a string). Return `cursor` and `has_more` in the response meta. Default `per_page` to 30 (matching GitHub's default).

**How it works:**
1. Agent calls `issues.list` with no cursor -- page 1 is fetched
2. Response includes `meta.cursor: "2"` and `meta.has_more: true`
3. Agent passes `?cursor=2` on next request -- page 2 is fetched
4. When Link header has no `rel="next"`, `has_more: false` and no cursor

**Why not use GitHub's Link header URLs directly as cursors?** The Link header URLs contain the full GitHub API URL with query params, which would leak implementation details and be fragile. Encoding just the page number is simpler and forward-compatible.

**Confidence:** HIGH -- GitHub uses page-based pagination for issues, PRs, and repos. The Link header `rel="next"` URL contains `?page=N` which is trivially extractable.

### 3. Date Format Normalization

**Recommendation:** Use ISO 8601 format (keep GitHub's native format). GitHub already returns ISO 8601 timestamps like `2025-01-15T09:30:00Z`. No conversion needed.

**Rationale:** ISO 8601 is human-readable, universally parseable, and what GitHub already uses. Unix timestamps save a few tokens but sacrifice readability for agents that reason about dates in natural language. The existing codebase (mock connector, API key records) already uses ISO 8601.

**Confidence:** HIGH -- consistent with existing codebase patterns.

### 4. Exact Action Set (10 actions)

**Recommendation:** Implement 10 actions -- the required 8 plus `issues.get` and `pulls.get` as single-item variants that exercise the `returns: 'single'` code path.

| Action | Method | GitHub Endpoint | Returns |
|--------|--------|-----------------|---------|
| `issues.list` | GET | `/repos/{owner}/{repo}/issues` | list |
| `issues.get` | GET | `/repos/{owner}/{repo}/issues/{issue_number}` | single |
| `issues.create` | POST | `/repos/{owner}/{repo}/issues` | single |
| `issues.update` | PATCH | `/repos/{owner}/{repo}/issues/{issue_number}` | single |
| `issues.close` | PATCH | `/repos/{owner}/{repo}/issues/{issue_number}` | single |
| `pulls.list` | GET | `/repos/{owner}/{repo}/pulls` | list |
| `pulls.get` | GET | `/repos/{owner}/{repo}/pulls/{pull_number}` | single |
| `pulls.create` | POST | `/repos/{owner}/{repo}/pulls` | single |
| `pulls.merge` | PUT | `/repos/{owner}/{repo}/pulls/{pull_number}/merge` | single |
| `repos.list` | GET | `/user/repos` | list |

**Why `issues.close` as separate from `issues.update`:** Close is the most common issue mutation for agents. A dedicated action means agents don't need to know the `state: "closed"` parameter -- they just call `issues.close` with the issue number. Under the hood, it calls the same PATCH endpoint with `{ state: "closed" }`.

**Why `issues.get` and `pulls.get`:** These validate the `returns: 'single'` path which is distinct from `returns: 'list'` in the response shape. They also serve a real use case -- agents often need to check the current state of a specific issue or PR before acting.

**Confidence:** HIGH -- covers the required 8 and adds 2 that are both useful and validate distinct code paths.

### 5. Repo Param Format

**Recommendation:** Single `repo` string in `"owner/repo"` format, split internally.

**Rationale:** Agents naturally think in `owner/repo` format (this is how GitHub URLs work, how `gh` CLI works, how people talk about repos). Two separate params (`owner` + `repo`) doubles the parameter count and increases the chance of errors. The action handler splits on `/` internally.

**Implementation:** Parse `repo` param in each handler:
```typescript
const [owner, repoName] = (ctx.params.repo as string).split('/')
if (!owner || !repoName) {
  throw new FeelrError('VALIDATION_ERROR', {
    message: 'repo must be in "owner/repo" format',
    hint: 'abort',
    status: 400,
  })
}
```

**Note:** `repos.list` does NOT take a `repo` param -- it lists the authenticated user's repos.

**Confidence:** HIGH -- matches CLI conventions and reduces agent cognitive load.

### 6. Filter/Query Param Exposure

**Recommendation:** Curated subset per action. Expose the most useful filters with Feelr-standard names. Do not pass through arbitrary GitHub query params.

**Exposed filters:**

| Action | Params | Notes |
|--------|--------|-------|
| `issues.list` | `repo` (required), `state` (open/closed/all, default: open), `labels` (comma-separated), `sort` (created/updated/comments, default: created), `per_page` (default: 30) | |
| `issues.get` | `repo` (required), `issue_number` (required) | |
| `issues.create` | `repo` (required), `title` (required), `body`, `labels` (comma-separated), `assignees` (comma-separated) | |
| `issues.update` | `repo` (required), `issue_number` (required), `title`, `body`, `state` (open/closed), `labels`, `assignees` | |
| `issues.close` | `repo` (required), `issue_number` (required), `state_reason` (completed/not_planned, default: completed) | |
| `pulls.list` | `repo` (required), `state` (open/closed/all, default: open), `sort` (created/updated/popularity/long-running, default: created), `per_page` (default: 30) | |
| `pulls.get` | `repo` (required), `pull_number` (required) | |
| `pulls.create` | `repo` (required), `title` (required), `head` (required), `base` (required), `body`, `draft` (boolean) | |
| `pulls.merge` | `repo` (required), `pull_number` (required), `merge_method` (merge/squash/rebase, default: merge), `commit_title`, `commit_message` | |
| `repos.list` | `type` (all/owner/public/private/member, default: all), `sort` (created/updated/pushed/full_name, default: created), `per_page` (default: 30) | |

**Confidence:** HIGH -- covers the filters agents most commonly need without overwhelming them.

### 7. Rate Limit Error Handling Strategy

**Recommendation:** Surface rate limit errors with retry hint and include `retry_after_seconds` in the error detail. Do NOT auto-retry.

**Rationale:** Auto-retry would block the Worker CPU time (10ms limit on free, 30s on paid). The agent is better equipped to decide whether to wait or try a different approach. Providing `retry_after_seconds` gives the agent actionable data.

**Implementation:**
```typescript
// When GitHub returns 429 or x-ratelimit-remaining: 0
throw new FeelrError('RATE_LIMITED', {
  message: 'GitHub API rate limit exceeded',
  hint: 'retry',
  status: 429,
  detail: `Rate limit resets in ${retryAfterSeconds}s (at ${resetTimestamp}). Limit: ${limit}, Used: ${used}.`,
})
```

Also check `x-ratelimit-remaining` on every response. If `remaining` is 0 but response was 200 (just used the last request), include a warning in the meta.

**Confidence:** HIGH -- aligns with Cloudflare Workers execution model and Feelr's agent-first design.

### 8. Auth Error Specificity

**Recommendation:** Differentiate between "no credential stored" (AUTH_REQUIRED + auth hint) and "credential rejected by GitHub" (AUTH_INVALID + auth hint). Include GitHub's scope-related error messages in the detail field when available.

**Mapping:**
- No `ctx.credential` available: `AUTH_REQUIRED` / 401 / hint: auth / "No GitHub credential stored. Run admin credential store first."
- GitHub returns 401: `AUTH_INVALID` / 401 / hint: auth / detail includes GitHub's message
- GitHub returns 403 (scope issue): `FORBIDDEN` / 403 / hint: auth / detail: "GitHub PAT may lack required scope. Ensure 'repo' scope is enabled."

**Confidence:** HIGH -- matches existing FeelrError codes and provides actionable guidance.

### 9. 404 Disambiguation Approach

**Recommendation:** Return `NOT_FOUND` with a detail message noting that GitHub intentionally conflates "not found" and "no permission" for 404s. Use hint `abort` (not `auth`), since most 404s are genuinely not-found.

**Implementation:**
```typescript
// GitHub 404
throw new FeelrError('NOT_FOUND', {
  message: `Resource not found: ${resourceDescription}`,
  hint: 'abort',
  status: 404,
  detail: 'GitHub returns 404 for both non-existent and permission-denied resources. Verify the resource exists and your PAT has access.',
})
```

**Confidence:** HIGH -- honest disambiguation without false confidence about the actual cause.

### 10. Status Endpoint Connector Scope

**Recommendation:** Report only the connectors that have stored credentials (not all registered connectors). In Phase 3 this means only GitHub. The status response should list each configured connector with its health status.

**Rationale:** Reporting connectors with no credentials would just say "unconfigured" for everything, which adds noise. Agents care about "can I use this connector right now?"

**Confidence:** MEDIUM -- reasonable for Phase 3 but Phase 5 may revisit when multiple connectors exist.

---

## Standard Stack

No new library dependencies needed for Phase 3. The connector uses only Web Standard APIs (`fetch`, `URL`, `Headers`) per the established Connector SDK contract.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @feelr/connector-sdk | workspace:* | Connector interfaces | Internal monorepo package |
| hono | ^4.11.7 | Gateway framework | Already established Phase 1 |

### New Package
| Package | Location | Purpose |
|---------|----------|---------|
| @feelr/connector-github | connectors/github/ | GitHub connector implementation |

**No npm install needed.** The connector depends only on `@feelr/connector-sdk` (workspace link). All GitHub API interaction uses the native `fetch` API via `ctx.fetch`.

---

## Architecture Patterns

### Recommended Project Structure

```
connectors/github/
  package.json              # @feelr/connector-github
  tsconfig.json
  src/
    index.ts                # ConnectorDefinition export
    github-fetch.ts         # Shared fetch helper (auth, headers, error mapping, pagination)
    flatten.ts              # Response flattening functions per resource type
    actions/
      issues-list.ts
      issues-get.ts
      issues-create.ts
      issues-update.ts
      issues-close.ts
      pulls-list.ts
      pulls-get.ts
      pulls-create.ts
      pulls-merge.ts
      repos-list.ts

apps/gateway/src/
  connectors/
    github.ts               # Re-export (imports from @feelr/connector-github)
  routes/
    status.ts               # NEW: /status endpoint
    v1.ts                   # MODIFIED: register github connector
  app.ts                    # MODIFIED: mount status route
```

### Pattern 1: Shared GitHub Fetch Helper

**What:** A single function that handles GitHub API headers, auth, error mapping, rate limit extraction, and pagination parsing.

**When to use:** Every action handler calls this instead of raw `ctx.fetch`.

```typescript
// connectors/github/src/github-fetch.ts
interface GitHubFetchOptions {
  path: string              // e.g., "/repos/owner/repo/issues"
  method?: string           // default: "GET"
  body?: Record<string, unknown>
  params?: Record<string, string>  // query params
  credential: string
  fetch: typeof globalThis.fetch
}

interface GitHubFetchResult<T> {
  data: T
  rateLimit: {
    remaining: number
    limit: number
    reset: number           // epoch seconds
  }
  pagination: {
    nextPage?: number
    hasMore: boolean
  }
}
```

**Key responsibilities:**
1. Set required headers: `Authorization: Bearer ${credential}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: Feelr/1.0`
2. Parse `Link` header for pagination (`rel="next"`)
3. Extract `x-ratelimit-*` headers
4. Map GitHub HTTP errors to FeelrError (401, 403, 404, 422, 429, 500+)
5. Forward 422 validation errors in detail field

### Pattern 2: Flattening Functions

**What:** Per-resource-type functions that extract essential fields from GitHub's verbose JSON.

```typescript
// connectors/github/src/flatten.ts

export function flattenIssue(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: raw.id,
    number: raw.number,
    state: raw.state,
    state_reason: raw.state_reason ?? null,
    title: raw.title,
    body: raw.body ?? '',
    user_login: (raw.user as any)?.login ?? null,
    assignee_login: (raw.assignee as any)?.login ?? null,
    labels: ((raw.labels as any[]) ?? []).map((l: any) => l.name),
    comments: raw.comments,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    closed_at: raw.closed_at ?? null,
  }
}
```

### Pattern 3: Action Handler (Thin Layer)

**What:** Each action is a thin function that validates params, calls `githubFetch`, and returns flattened data.

```typescript
// connectors/github/src/actions/issues-list.ts
import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '@feelr/connector-sdk'
import { githubFetch } from '../github-fetch'
import { flattenIssue } from '../flatten'

export const issuesList: ActionDefinition = {
  name: 'issues.list',
  description:
    'Lists issues for a repository. Accepts "repo" (required, "owner/repo"), ' +
    'optional "state" (open/closed/all, default: open), "labels" (comma-separated), ' +
    '"sort" (created/updated/comments), "per_page" (max 100). ' +
    'Returns array of {id, number, state, title, user_login, labels, created_at}.',
  params: [
    { name: 'repo', type: 'string', required: true, description: 'Repository in "owner/repo" format' },
    { name: 'state', type: 'string', required: false, description: 'Filter by state', default: 'open' },
    { name: 'labels', type: 'string', required: false, description: 'Comma-separated label names' },
    { name: 'sort', type: 'string', required: false, description: 'Sort by created/updated/comments', default: 'created' },
    { name: 'per_page', type: 'number', required: false, description: 'Results per page (max 100)', default: 30 },
  ],
  returns: 'list',
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    if (!ctx.credential) {
      throw new FeelrError('AUTH_REQUIRED', {
        message: 'No GitHub credential stored. Store a PAT via admin API first.',
        hint: 'auth',
        status: 401,
      })
    }

    const [owner, repo] = (ctx.params.repo as string).split('/')
    if (!owner || !repo) {
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'repo must be in "owner/repo" format',
        hint: 'abort',
        status: 400,
      })
    }

    const result = await githubFetch({
      path: `/repos/${owner}/${repo}/issues`,
      params: {
        state: ctx.params.state as string,
        ...(ctx.params.labels && { labels: ctx.params.labels as string }),
        sort: ctx.params.sort as string,
        per_page: String(ctx.params.per_page ?? 30),
        ...(ctx.params.cursor && { page: ctx.params.cursor as string }),
      },
      credential: ctx.credential,
      fetch: ctx.fetch,
    })

    return {
      data: (result.data as any[]).map(flattenIssue),
      meta: {
        has_more: result.pagination.hasMore,
        ...(result.pagination.nextPage && { cursor: String(result.pagination.nextPage) }),
      },
      raw: result.data,
    }
  },
}
```

### Pattern 4: Status Endpoint

**What:** A new `/status` route that checks connector health by calling GitHub's `/rate_limit` endpoint (free, doesn't count against quota).

```typescript
// apps/gateway/src/routes/status.ts
// GET /status -- authenticated, returns connector health
// GET /status?deep=true -- also validates PAT via /user
```

### Anti-Patterns to Avoid

- **Duplicating fetch logic across actions:** Every action should use the shared `githubFetch` helper. Never call `ctx.fetch` directly in action handlers.
- **Passing through GitHub's full response:** Always flatten. The `raw` field handles debugging; the `data` field is always flattened.
- **Hardcoding page numbers in Link header parsing:** Parse the `rel="next"` URL and extract the `page` parameter. Do not assume page numbers increment by 1.
- **Auto-retrying rate limits inside the Worker:** Workers have strict CPU time limits. Return the error to the agent with retry information.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Link header parsing | Custom regex | Simple split on `, ` then parse `rel="next"` URL | Well-defined format, but only needs ~10 lines of code. A library would be overkill. |
| GitHub error mapping | Per-action error handling | Centralized in `githubFetch` helper | GitHub errors are consistent across endpoints. Map once, use everywhere. |
| Response flattening | Inline in each handler | `flatten.ts` with per-resource functions | Each resource type has a fixed shape. Centralize to ensure consistency and easy updates. |
| Pagination cursor encoding | Complex cursor scheme | Plain page number as string | GitHub uses page-based pagination. Don't over-engineer. |

**Key insight:** The GitHub connector has no external dependencies beyond `@feelr/connector-sdk`. The complexity is in mapping GitHub's verbose responses to Feelr's flat format, not in library wrangling. Keep it simple -- the `githubFetch` helper is the only shared abstraction needed.

---

## Common Pitfalls

### Pitfall 1: GitHub Issues Endpoint Returns PRs Too

**What goes wrong:** `GET /repos/{owner}/{repo}/issues` returns BOTH issues AND pull requests. Pull requests have a `pull_request` key in the response.
**Why it happens:** GitHub's API considers every PR an issue, but not every issue is a PR.
**How to avoid:** Filter out items that have a `pull_request` key when listing issues. This prevents agents from getting confused by PRs appearing in issue lists.
**Warning signs:** Agent sees more items than expected, or items with PR-specific fields mixed in.

### Pitfall 2: Missing User-Agent Header Causes 403

**What goes wrong:** GitHub rejects requests without a `User-Agent` header with a 403 Forbidden response.
**Why it happens:** GitHub requires all API requests to include a valid `User-Agent` header. This is enforced server-side.
**How to avoid:** Always include `User-Agent: Feelr/1.0` (or similar) in every request via the `githubFetch` helper.
**Warning signs:** All requests fail with 403 even though the PAT is valid.

### Pitfall 3: Rate Limit vs Secondary Rate Limit

**What goes wrong:** Requests fail with 403 (not 429) due to secondary rate limits, even when primary rate limit has remaining quota.
**Why it happens:** GitHub enforces secondary rate limits for: concurrent requests, too many write requests (POST/PATCH/PUT/DELETE) per second, and overall request volume.
**How to avoid:** Surface the error with retry hint. Include the Retry-After header value when present. The agent should wait at least 1 second between write operations.
**Warning signs:** 403 responses with messages about "secondary rate limit" or "abuse detection" despite valid authentication.

### Pitfall 4: 404 Ambiguity (Not Found vs No Permission)

**What goes wrong:** Agent interprets 404 as "resource doesn't exist" when it actually means "PAT doesn't have access."
**Why it happens:** GitHub intentionally returns 404 for both non-existent resources and resources where the authenticated user lacks permission, to avoid leaking information about private resources.
**How to avoid:** Include disambiguation guidance in the error detail. The agent can check PAT scopes if needed.
**Warning signs:** Resources that clearly exist return 404.

### Pitfall 5: Credential Not Available at Request Time

**What goes wrong:** The `ctx.credential` is undefined because no PAT was stored for the GitHub connector.
**Why it happens:** The gateway's dispatch route attempts to read credentials from KV but proceeds without them (graceful degradation from Phase 2 design -- `credential` is optional in `ActionContext`).
**How to avoid:** Each action handler MUST check `ctx.credential` and throw `AUTH_REQUIRED` immediately if missing. Do not let the request reach GitHub without auth.
**Warning signs:** Cryptic "bad credentials" error from GitHub instead of clear Feelr auth error.

### Pitfall 6: GitHub API Version Drift

**What goes wrong:** Response format changes unexpectedly because no API version was pinned.
**Why it happens:** Without the `X-GitHub-Api-Version` header, GitHub defaults to the latest version, which can change.
**How to avoid:** Always include `X-GitHub-Api-Version: 2022-11-28` in every request. This pins to the stable API version.
**Warning signs:** Fields missing or renamed in responses that worked previously.

### Pitfall 7: Status Endpoint Leaks Rate Limit Info

**What goes wrong:** Unauthenticated users can probe rate limit info for stored PATs.
**Why it happens:** `/status` endpoint doesn't require auth.
**How to avoid:** `/status` MUST require API key authentication (use `apiKeyMiddleware`). Rate limit info is per-token context and should only be visible to authenticated users. This is a locked decision from CONTEXT.md.
**Warning signs:** Rate limit info visible without authentication.

---

## Code Examples

### GitHub Fetch Helper (Core Pattern)
```typescript
// Source: GitHub REST API docs + Connector SDK types
const GITHUB_API_BASE = 'https://api.github.com'

interface GitHubFetchOptions {
  path: string
  method?: string
  body?: Record<string, unknown>
  params?: Record<string, string>
  credential: string
  fetch: typeof globalThis.fetch
}

interface GitHubRateLimit {
  remaining: number
  limit: number
  used: number
  reset: number  // epoch seconds
}

interface GitHubPagination {
  nextPage?: number
  hasMore: boolean
}

interface GitHubFetchResult<T = unknown> {
  data: T
  rateLimit: GitHubRateLimit
  pagination: GitHubPagination
}

export async function githubFetch<T = unknown>(
  options: GitHubFetchOptions
): Promise<GitHubFetchResult<T>> {
  const url = new URL(`${GITHUB_API_BASE}${options.path}`)
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value)
      }
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.credential}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Feelr/1.0',
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  }

  if (options.body) {
    init.body = JSON.stringify(options.body)
    headers['Content-Type'] = 'application/json'
  }

  const response = await options.fetch(url.toString(), init)

  // Extract rate limit headers
  const rateLimit: GitHubRateLimit = {
    remaining: Number(response.headers.get('x-ratelimit-remaining') ?? 0),
    limit: Number(response.headers.get('x-ratelimit-limit') ?? 0),
    used: Number(response.headers.get('x-ratelimit-used') ?? 0),
    reset: Number(response.headers.get('x-ratelimit-reset') ?? 0),
  }

  // Parse Link header for pagination
  const pagination = parseLinkHeader(response.headers.get('link'))

  // Error mapping
  if (!response.ok) {
    await mapGitHubError(response, rateLimit)
  }

  const data = await response.json() as T
  return { data, rateLimit, pagination }
}
```

### Link Header Parsing
```typescript
// Source: GitHub pagination docs
function parseLinkHeader(linkHeader: string | null): GitHubPagination {
  if (!linkHeader) return { hasMore: false }

  const links = linkHeader.split(', ')
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    if (match) {
      const url = new URL(match[1])
      const page = url.searchParams.get('page')
      return {
        hasMore: true,
        nextPage: page ? Number(page) : undefined,
      }
    }
  }

  return { hasMore: false }
}
```

### GitHub Error Mapping
```typescript
// Source: GitHub error docs + Feelr error codes
async function mapGitHubError(
  response: Response,
  rateLimit: GitHubRateLimit
): never {
  let errorBody: any = {}
  try {
    errorBody = await response.json()
  } catch {
    // Non-JSON error response
  }

  const message = errorBody.message ?? `GitHub API returned ${response.status}`
  const validationErrors = errorBody.errors
    ? JSON.stringify(errorBody.errors)
    : undefined

  switch (response.status) {
    case 401:
      throw new FeelrError('AUTH_INVALID', {
        message: 'GitHub authentication failed',
        hint: 'auth',
        status: 401,
        detail: message,
      })
    case 403:
      // Check if rate limited (secondary rate limit uses 403, not 429)
      if (rateLimit.remaining === 0 || message.includes('rate limit')) {
        const resetDate = new Date(rateLimit.reset * 1000).toISOString()
        throw new FeelrError('RATE_LIMITED', {
          message: 'GitHub API rate limit exceeded',
          hint: 'retry',
          status: 429,
          detail: `Resets at ${resetDate}. Limit: ${rateLimit.limit}, Used: ${rateLimit.used}.`,
        })
      }
      throw new FeelrError('FORBIDDEN', {
        message: 'GitHub access denied',
        hint: 'auth',
        status: 403,
        detail: `${message}. PAT may lack required scope (ensure 'repo' scope is enabled).`,
      })
    case 404:
      throw new FeelrError('NOT_FOUND', {
        message: 'GitHub resource not found',
        hint: 'abort',
        status: 404,
        detail: `${message}. Note: GitHub returns 404 for both non-existent and permission-denied resources.`,
      })
    case 422:
      throw new FeelrError('VALIDATION_ERROR', {
        message: 'GitHub validation failed',
        hint: 'abort',
        status: 400,
        detail: validationErrors ?? message,
      })
    case 429:
      const retryAfter = response.headers.get('retry-after')
      throw new FeelrError('RATE_LIMITED', {
        message: 'GitHub API rate limit exceeded',
        hint: 'retry',
        status: 429,
        detail: retryAfter
          ? `Retry after ${retryAfter} seconds.`
          : `Resets at ${new Date(rateLimit.reset * 1000).toISOString()}.`,
      })
    default:
      throw new FeelrError('UPSTREAM_ERROR', {
        message: `GitHub API error: ${response.status}`,
        hint: response.status >= 500 ? 'retry' : 'abort',
        status: 502,
        detail: message,
      })
  }
}
```

### Status Endpoint Response Shape
```typescript
// GET /status (with API key auth)
// Response:
{
  ok: true,
  data: {
    gateway: { status: 'healthy', version: '1.0.0' },
    connectors: {
      github: {
        status: 'healthy',  // or 'degraded' or 'unhealthy'
        rate_limit: {
          remaining: 4999,
          limit: 5000,
          used: 1,
          resets_at: '2026-02-06T12:00:00Z',
        },
        // Only if ?deep=true:
        authenticated_as: 'octocat',
      }
    }
  },
  meta: { request_id: '...', connector: 'gateway', action: 'status', duration_ms: 42 }
}
```

---

## GitHub REST API Reference

### Key Facts (verified)
| Fact | Value | Confidence |
|------|-------|------------|
| API base URL | `https://api.github.com` | HIGH |
| Auth header | `Authorization: Bearer <PAT>` | HIGH |
| API version header | `X-GitHub-Api-Version: 2022-11-28` | HIGH |
| User-Agent required | Yes, 403 without it | HIGH |
| Rate limit (PAT) | 5,000 requests/hour | HIGH |
| Default per_page | 30 | HIGH |
| Max per_page | 100 | HIGH |
| Pagination | Link header with page numbers | HIGH |
| Accept header | `application/vnd.github+json` | HIGH |
| Rate limit endpoint | `GET /rate_limit` (free, doesn't count) | HIGH |
| Issues endpoint returns PRs | Yes, filter by absence of `pull_request` key | HIGH |
| 404 = not found OR no permission | Yes, by design | HIGH |
| 422 validation errors | `errors` array with `resource`, `field`, `code`, `message` | HIGH |
| Merge methods | merge, squash, rebase (in `merge_method` body param) | HIGH |

### Rate Limit Response Format (`GET /rate_limit`)
```json
{
  "resources": {
    "core": { "limit": 5000, "used": 1, "remaining": 4999, "reset": 1691591363 },
    "search": { "limit": 30, "used": 0, "remaining": 30, "reset": 1691591363 }
  },
  "rate": { "limit": 5000, "used": 1, "remaining": 4999, "reset": 1691591363 }
}
```

### Rate Limit Response Headers (on every response)
| Header | Purpose |
|--------|---------|
| `x-ratelimit-limit` | Max requests per hour |
| `x-ratelimit-remaining` | Requests left in window |
| `x-ratelimit-used` | Requests consumed in window |
| `x-ratelimit-reset` | Unix epoch timestamp for reset |
| `x-ratelimit-resource` | Which bucket (core, search, etc.) |

### GitHub Error Response Format
```json
{
  "message": "Validation Failed",
  "documentation_url": "https://docs.github.com/...",
  "errors": [
    {
      "resource": "Issue",
      "field": "title",
      "code": "missing_field"
    }
  ]
}
```

Validation error codes: `missing`, `missing_field`, `invalid`, `already_exists`, `unprocessable`, `custom`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No API versioning | `X-GitHub-Api-Version: 2022-11-28` header | Nov 2022 | Must include header to pin behavior |
| `v3` media types | `application/vnd.github+json` | 2022 | Use new Accept header format |
| Basic auth | Bearer tokens / PATs | 2020 | Use `Authorization: Bearer` not basic auth |
| Fine-grained vs classic PATs | Both supported, fine-grained encouraged | 2022+ | Either works; fine-grained has tighter scoping |

**Deprecated/outdated:**
- Basic authentication (username:password) -- removed entirely
- OAuth authorizations API -- use web flow or device flow instead
- `application/vnd.github.v3+json` Accept header -- use `application/vnd.github+json`

---

## Integration Points with Existing Codebase

### What Already Works (No Changes Needed)
- **Connector SDK types:** `ConnectorDefinition`, `ActionDefinition`, `ActionContext`, `ActionResult` -- all fit the GitHub connector perfectly
- **Response envelope:** `wrapResponse`/`wrapError` in gateway handles wrapping
- **Error handler:** `errorHandler` middleware catches `FeelrError` from connector handlers
- **API key middleware:** Validates the Feelr API key before dispatch
- **Credential retrieval:** `getCredential` in dispatch reads GitHub PAT from KV
- **Raw pass-through:** `?raw=true` handling in v1 dispatch works with `result.raw`
- **System param filtering:** `cursor` is already in SYSTEM_PARAMS set -- gateway filters it before passing to handler, but action handlers that need cursor will need to read it from a different source

### What Needs Changes

1. **Cursor handling in dispatch:** The current dispatch route filters `cursor` out of `actionParams` (it's a system param). But the GitHub connector needs the cursor value to build the `?page=N` query param. Two options:
   - **Option A (preferred):** Pass cursor separately in `ActionContext` (add `cursor?: string` to the interface)
   - **Option B:** Remove `cursor` from system params and let each action handle it

   **Recommendation:** Option A -- add `cursor` to `ActionContext`. This keeps system params clean and gives all connectors a standard pagination input.

2. **Connector registration:** `v1.ts` needs to import and register the GitHub connector alongside the mock connector.

3. **Status route:** New `/status` route needs to be created and mounted in `app.ts`. It should use `apiKeyMiddleware` for auth.

4. **ActionContext.cursor:** New optional field to pass pagination cursor from system params to action handlers.

### SDK Type Change Required

```typescript
// packages/connector-sdk/src/types.ts -- add to ActionContext
export interface ActionContext {
  params: Record<string, unknown>
  fetch: typeof globalThis.fetch
  credential?: string
  cursor?: string  // NEW: pagination cursor from ?cursor= system param
}
```

This is a non-breaking addition (optional field).

---

## Open Questions

1. **Connector location: `connectors/github/` vs `apps/gateway/src/connectors/github.ts`?**
   - What we know: The template lives at `connectors/_template/`, the pnpm workspace includes `connectors/*`, and the mock connector lives at `apps/gateway/src/connectors/mock.ts`
   - What's unclear: Should GitHub be a separate workspace package (more isolation, better for future self-hosting) or inline in the gateway (simpler)?
   - Recommendation: Separate workspace at `connectors/github/` -- this validates the connector template pattern and is consistent with the monorepo architecture. The gateway imports it as `@feelr/connector-github`. The mock connector stays in the gateway since it's a test fixture, not a real connector.

2. **Should the cursor be available inside ActionContext or should we rely on the handler checking its own system params?**
   - Recommendation: Add `cursor` to `ActionContext` (discussed above). This is a small SDK change with high value for all future connectors.

---

## Sources

### Primary (HIGH confidence)
- [GitHub REST API - Issues endpoints](https://docs.github.com/en/rest/issues/issues) -- verified endpoint patterns, response fields
- [GitHub REST API - Pull Requests endpoints](https://docs.github.com/en/rest/pulls/pulls) -- verified PR endpoints, merge methods
- [GitHub REST API - Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) -- rate limit values, headers, `/rate_limit` endpoint
- [GitHub REST API - Rate Limit endpoint](https://docs.github.com/en/rest/rate-limit/rate-limit) -- response format for `GET /rate_limit`
- [GitHub REST API - Pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api) -- Link header format, per_page defaults
- [GitHub REST API - Best Practices](https://docs.github.com/rest/guides/best-practices-for-using-the-rest-api) -- error handling, conditional requests
- [GitHub REST API - Troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api) -- error codes (422 validation codes)
- [GitHub REST API - API Versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions) -- `X-GitHub-Api-Version` header
- Existing codebase: `packages/connector-sdk/src/types.ts`, `connectors/_template/src/index.ts`, `apps/gateway/src/routes/v1.ts` -- verified all integration points

### Secondary (MEDIUM confidence)
- [GitHub REST API - Repos endpoints](https://docs.github.com/en/rest/repos/repos) -- `GET /user/repos` verified via WebFetch (503 on first attempt, verified on retry)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, uses existing SDK
- Architecture: HIGH -- follows established connector template, verified with codebase
- GitHub API details: HIGH -- verified against official docs via WebFetch
- Pitfalls: HIGH -- documented from official GitHub docs and known patterns
- Flattening fields: HIGH -- derived from verified GitHub response schemas
- Status endpoint: MEDIUM -- design is sound but integration details may need adjustment at implementation time

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (GitHub API is stable, API version pinned to 2022-11-28)
