---
phase: 03-github-connector
plan: 04
subsystem: github-connector, gateway
tags: [testing, vitest, unit-tests, integration-tests, error-mapping, flattening, raw-passthrough]
dependency-graph:
  requires: [03-02, 03-03]
  provides: [github-connector-test-suite, gateway-github-integration-tests]
  affects: [04-01]
tech-stack:
  added: [vitest (connector-github devDep)]
  patterns: [standard-vitest-for-connectors, pool-workers-for-gateway, mock-fetch-injection]
key-files:
  created:
    - connectors/github/src/__tests__/github-fetch.test.ts
    - connectors/github/src/__tests__/flatten.test.ts
    - connectors/github/src/__tests__/actions.test.ts
    - apps/gateway/src/__tests__/github-integration.test.ts
    - connectors/github/vitest.config.ts
  modified:
    - connectors/github/package.json
    - pnpm-lock.yaml
decisions: []
metrics:
  duration: 5 min
  completed: 2026-02-06
---

# Phase 3 Plan 4: GitHub Connector Tests Summary

**One-liner:** 46 unit tests for githubFetch error mapping, flatten field extraction, and action handler behavior + 5 gateway integration tests for routing and status endpoint

## What Was Done

### Task 1: Unit tests for shared helpers (githubFetch + flatten)

**Test infrastructure setup:**
- Added vitest ~3.2.0 as devDependency to @feelr/connector-github
- Created `connectors/github/vitest.config.ts` (standard Vitest, NOT pool-workers)
- Added `"test": "vitest run"` script to package.json

**github-fetch.test.ts (13 tests):**
- Successful GET: URL construction, Authorization/Accept/Api-Version/User-Agent headers, data parsing, rate limit extraction from x-ratelimit-* headers
- Pagination parsing: Link header with rel="next" returns nextPage + hasMore=true; no Link header returns hasMore=false
- POST with body: correct method, Content-Type header, JSON-stringified body
- 204 No Content: returns empty object (for merge-type responses)
- Error 401: maps to AUTH_INVALID with hint=auth, status=401
- Error 403 (rate limited): ratelimit-remaining=0 maps to RATE_LIMITED with hint=retry, status=429
- Error 403 (permission denied): ratelimit-remaining>0 maps to FORBIDDEN with hint=auth, status=403
- Error 404: maps to NOT_FOUND with hint=abort, status=404
- Error 422: maps to VALIDATION_ERROR with hint=abort, status=400, forwards errors array in detail
- Error 429: maps to RATE_LIMITED with hint=retry, status=429, includes retry-after in detail
- Error 500: maps to UPSTREAM_ERROR with hint=retry, status=502
- Query params: skips undefined and empty string values, includes non-empty values

**flatten.test.ts (13 tests):**
- flattenIssue: verifies exactly 13 keys, all expected fields correct, nested user/assignee extraction
- flattenPullRequest: verifies exactly 15 keys, head/base ref extraction, merged boolean, merged_at
- flattenRepository: verifies exactly 12 keys, nullable description/language
- Edge cases: null user, null assignee, empty labels, all nullable fields absent, private repository

### Task 2: Action handler tests and gateway integration tests

**actions.test.ts (15 tests):**
- issues.list: filters out PRs (items with pull_request key), passes cursor as page param, raw contains full unfiltered array
- issues.get: returns single flattened issue (13 keys), throws VALIDATION_ERROR when issue_number missing, raw is full GitHub object
- issues.create: splits comma-separated labels in POST body, throws VALIDATION_ERROR when title missing, raw field populated
- pulls.merge: returns {merged, sha, message} (not flattened PR shape), raw is full merge response
- repos.list: calls /user/repos (no owner/repo param), flattened data has 12 keys, raw field populated
- Credential check: throws AUTH_REQUIRED (401, hint=auth) when ctx.credential is undefined
- Repo validation: throws VALIDATION_ERROR (400, hint=abort) for invalid repo format
- Raw field contract: raw is defined on all action results, raw differs from data (has extra keys like url/html_url), raw preserves original nested structure (user object vs user_login)

**github-integration.test.ts (5 tests, pool-workers):**
- Connector routing: GET /v1/github/issues.list routes to GitHub connector (returns AUTH_REQUIRED without stored credential)
- Connector routing: GET /v1/github/repos.list routes correctly (AUTH_REQUIRED)
- Unknown action: GET /v1/github/nonexistent.action returns ACTION_NOT_FOUND (404) with connector name in message
- Status endpoint: GET /status returns empty connectors when no credentials are stored, gateway.status=healthy
- Status auth: GET /status without API key returns 401

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Unit tests for githubFetch and flatten helpers | 36ff3f6 | github-fetch.test.ts, flatten.test.ts, vitest.config.ts, package.json |
| 2 | Action handler tests and gateway integration tests | d34fa1c | actions.test.ts, github-integration.test.ts |

## Decisions Made

None -- all implementation followed established patterns. Standard Vitest for connector tests, pool-workers for gateway tests.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm turbo test`: All packages pass (2 successful tasks)
- @feelr/connector-github: 3 test files, 41 tests passed
- @feelr/gateway: 8 test files, 81 tests passed (no regressions from Phase 1/2 tests)
- Error mapping fully tested: 401, 403 (rate limit), 403 (permission), 404, 422, 429, 500
- Flatten field counts verified: Issue=13, PR=15, Repository=12
- Raw field populated on all tested actions (issues.list, issues.get, issues.create, pulls.merge, repos.list)
- Gateway routing tested for GitHub connector dispatch and status endpoint
- Total: 122 tests across monorepo, 0 failures

## Next Phase Readiness

Phase 3 (GitHub Connector) is now complete. All 4 plans executed:
1. 03-01: Connector SDK cursor support + githubFetch + flatten functions
2. 03-02: 10 action handlers + ConnectorDefinition + gateway registration
3. 03-03: /status endpoint with shallow/deep health checks
4. 03-04: Comprehensive test suite (46 connector + 5 gateway integration)

Phase 4 (CLI Core) can begin. The GitHub connector provides a complete reference implementation for:
- Connector structure (index.ts + actions/ + shared helpers)
- Action handler patterns (credential check, param validation, githubFetch, flatten, raw field)
- Test patterns (standard Vitest for connectors, pool-workers for gateway)

## Self-Check: PASSED
