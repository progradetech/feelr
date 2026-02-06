---
phase: 03-github-connector
plan: 01
subsystem: connector-sdk, github-connector
tags: [cursor, pagination, github-api, error-mapping, response-flattening]
dependency-graph:
  requires: [01-01, 01-02, 02-04]
  provides: [ActionContext-cursor, github-connector-scaffold, githubFetch-helper, flatten-functions]
  affects: [03-02, 03-03, 03-04]
tech-stack:
  added: []
  patterns: [shared-fetch-helper, response-flattening, centralized-error-mapping]
key-files:
  created:
    - connectors/github/package.json
    - connectors/github/tsconfig.json
    - connectors/github/src/github-fetch.ts
    - connectors/github/src/flatten.ts
    - connectors/github/src/actions/.gitkeep
  modified:
    - packages/connector-sdk/src/types.ts
    - apps/gateway/src/routes/v1.ts
decisions:
  - id: 03-01-cursor
    description: "cursor passed via dedicated ActionContext field (not left in actionParams)"
    rationale: "Clean separation of system params from action params; all connectors get cursor the same way"
metrics:
  duration: 3 min
  completed: 2026-02-06
---

# Phase 3 Plan 1: SDK Cursor Support + GitHub Connector Scaffold + Shared Helpers Summary

**One-liner:** ActionContext cursor field, GitHub connector package scaffold, githubFetch with error mapping/pagination, and 3 resource flatten functions

## What Was Done

### Task 1: Add cursor to ActionContext and pass in dispatch
- Added `cursor?: string` to `ActionContext` interface in `@feelr/connector-sdk`
- Gateway dispatch extracts cursor from `rawParams` before system param filtering
- Cursor passed to action handler via dedicated `ActionContext.cursor` field
- Non-breaking change (optional field), all existing tests pass

### Task 2: Create GitHub connector package scaffold
- Created `@feelr/connector-github` workspace package at `connectors/github/`
- Package.json with connector-sdk and tsconfig workspace dependencies
- tsconfig.json extending shared base config
- Empty `src/actions/` directory ready for action handlers in Plan 02
- Registered in pnpm workspace (6 packages total)

### Task 3: Implement githubFetch helper and flatten functions
- **githubFetch**: Centralized GitHub API fetch with:
  - Auth headers (`Authorization: Bearer`, `Accept`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: Feelr/1.0`)
  - Content-Type for requests with body
  - Query param building (skips undefined/empty)
  - Rate limit extraction from `x-ratelimit-*` headers
  - Link header pagination parsing via `parseLinkHeader`
  - 204 No Content handling (returns empty object)
  - Error mapping via `mapGitHubError` for all non-OK responses
- **Error mapping** (401/403/404/422/429/5xx):
  - 401 -> AUTH_INVALID / auth / 401
  - 403 + rate limit -> RATE_LIMITED / retry / 429 (checks remaining=0 or message content)
  - 403 other -> FORBIDDEN / auth / 403 (scope guidance in detail)
  - 404 -> NOT_FOUND / abort / 404 (disambiguation note about GitHub 404 ambiguity)
  - 422 -> VALIDATION_ERROR / abort / 400 (forwards GitHub's errors array as JSON string -- locked decision)
  - 429 -> RATE_LIMITED / retry / 429 (Retry-After or reset time)
  - 500+ -> UPSTREAM_ERROR / retry / 502
- **Flatten functions**:
  - `flattenIssue`: 13 fields (id, number, state, state_reason, title, body, user_login, assignee_login, labels, comments, created_at, updated_at, closed_at)
  - `flattenPullRequest`: 15 fields (id, number, state, title, body, user_login, head_ref, head_sha, base_ref, merged, mergeable, labels, created_at, updated_at, merged_at)
  - `flattenRepository`: 12 fields (id, name, full_name, private, description, language, default_branch, stargazers_count, forks_count, open_issues_count, created_at, updated_at)
  - Safe access patterns for nested objects (null coalescing)
  - All dates in ISO 8601 (GitHub native format)

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add cursor to ActionContext and pass in dispatch | b176510 | types.ts, v1.ts |
| 2 | Create GitHub connector package scaffold | eebaf70 | package.json, tsconfig.json |
| 3 | Implement githubFetch helper and flatten functions | e78ddca | github-fetch.ts, flatten.ts |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 03-01-cursor | cursor passed via dedicated ActionContext field | Clean separation; system params filtered, cursor available to all connectors via ctx.cursor |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm turbo typecheck`: All 4 packages pass (connector-sdk, gateway, connector-template, connector-github)
- `pnpm --filter @feelr/gateway test`: 76/76 tests pass (zero regressions)
- `@feelr/connector-github` registered in workspace (confirmed via `pnpm ls -r`)
- `ActionContext.cursor` field present in types.ts
- `v1.ts` extracts cursor and passes to handler
- All expected exports verified via grep

## Next Phase Readiness

Plan 03-02 can proceed immediately. It will:
1. Create all 10 action handlers in `connectors/github/src/actions/`
2. Create the `ConnectorDefinition` in `connectors/github/src/index.ts`
3. Register the GitHub connector in the gateway

All shared infrastructure is in place: githubFetch helper, flatten functions, and ActionContext cursor support.

## Self-Check: PASSED
