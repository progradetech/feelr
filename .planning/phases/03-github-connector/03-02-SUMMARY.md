---
phase: 03-github-connector
plan: 02
subsystem: github-connector, gateway
tags: [github-api, action-handlers, connector-registration, response-flattening, raw-passthrough]
dependency-graph:
  requires: [03-01]
  provides: [github-connector-actions, github-connector-definition, gateway-github-registration]
  affects: [03-03, 03-04]
tech-stack:
  added: []
  patterns: [shared-utils-helpers, thin-action-handler-layer, connector-registration]
key-files:
  created:
    - connectors/github/src/utils.ts
    - connectors/github/src/actions/issues-list.ts
    - connectors/github/src/actions/issues-get.ts
    - connectors/github/src/actions/issues-create.ts
    - connectors/github/src/actions/issues-update.ts
    - connectors/github/src/actions/issues-close.ts
    - connectors/github/src/actions/pulls-list.ts
    - connectors/github/src/actions/pulls-get.ts
    - connectors/github/src/actions/pulls-create.ts
    - connectors/github/src/actions/pulls-merge.ts
    - connectors/github/src/actions/repos-list.ts
    - connectors/github/src/index.ts
  modified:
    - apps/gateway/src/routes/v1.ts
    - apps/gateway/package.json
    - pnpm-lock.yaml
decisions: []
metrics:
  duration: 3 min
  completed: 2026-02-06
---

# Phase 3 Plan 2: GitHub Action Handlers + ConnectorDefinition + Gateway Registration Summary

**One-liner:** 10 GitHub action handlers (issues CRUD+close, PRs list/get/create/merge, repos list) with shared utils, ConnectorDefinition, and gateway registration at /v1/github/:action

## What Was Done

### Task 1: Implement all 10 GitHub action handlers
- Created shared `utils.ts` with `requireCredential` (AUTH_REQUIRED 401) and `parseRepo` (VALIDATION_ERROR 400) helpers
- **Issue actions (5):**
  - `issues.list`: GET /repos/{owner}/{repo}/issues with state/labels/sort/per_page filters. Filters out pull requests (items with `pull_request` key). Paginates via ctx.cursor.
  - `issues.get`: GET /repos/{owner}/{repo}/issues/{issue_number}. Single issue retrieval.
  - `issues.create`: POST /repos/{owner}/{repo}/issues with title (required), body, labels (comma-split), assignees (comma-split).
  - `issues.update`: PATCH /repos/{owner}/{repo}/issues/{issue_number}. Only sends provided fields (title, body, state, labels, assignees).
  - `issues.close`: PATCH with { state: "closed", state_reason } convenience action.
- **Pull request actions (4):**
  - `pulls.list`: GET /repos/{owner}/{repo}/pulls with state/sort/per_page. Paginates via ctx.cursor.
  - `pulls.get`: GET /repos/{owner}/{repo}/pulls/{pull_number}. Single PR retrieval.
  - `pulls.create`: POST /repos/{owner}/{repo}/pulls with title, head, base (all required), body, draft.
  - `pulls.merge`: PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge with merge_method (default: merge), commit_title, commit_message. Returns {merged, sha, message} (no flatten).
- **Repository actions (1):**
  - `repos.list`: GET /user/repos with type/sort/per_page. No repo param. Paginates via ctx.cursor.
- Every action: checks credential first, validates required params, uses githubFetch, uses appropriate flatten function, populates `raw` field with unflattened GitHub response
- Agent-optimized descriptions (50-100 tokens each)

### Task 2: Create ConnectorDefinition and register in gateway
- Created `connectors/github/src/index.ts` exporting `githubConnector: ConnectorDefinition` with all 10 actions mapped by dot-notation name
- Connector metadata: name "github", display_name "GitHub", version "0.1.0", auth_type "bearer_token"
- Updated `apps/gateway/src/routes/v1.ts` to import and register `githubConnector` from `@feelr/connector-github`
- Added `@feelr/connector-github: workspace:*` dependency to gateway package.json
- Updated pnpm lockfile

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Implement all 10 GitHub action handlers | 7a4c867 | utils.ts, issues-list.ts, issues-get.ts, issues-create.ts, issues-update.ts, issues-close.ts, pulls-list.ts, pulls-get.ts, pulls-create.ts, pulls-merge.ts, repos-list.ts |
| 2 | Create ConnectorDefinition and register in gateway | da8c3c4 | index.ts, v1.ts, package.json |

## Decisions Made

No new decisions -- all implementation followed established patterns from Plan 03-01 (githubFetch, flatten functions, cursor via ActionContext).

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm turbo typecheck`: All 4 packages pass (connector-sdk, gateway, connector-template, connector-github)
- 10 action handler files exist in `connectors/github/src/actions/`
- utils.ts exists with requireCredential and parseRepo
- ConnectorDefinition in index.ts has exactly 10 actions
- Gateway registers githubConnector via `registerConnector(githubConnector)`
- All 10 action files contain `raw:` field for ?raw=true passthrough
- issues.list filters out pull requests (items with `pull_request` key)

## Next Phase Readiness

Plan 03-03 (status endpoint) and 03-04 (tests) can proceed. The GitHub connector is fully wired into the gateway and all 10 actions are routable at `/v1/github/:action`.

## Self-Check: PASSED
