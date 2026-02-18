---
phase: 08-composable-actions
plan: 06
subsystem: api
tags: [yaml, chains, pre-built, github, slack, discord, stripe, templates]

# Dependency graph
requires:
  - phase: 08-01
    provides: Chain type definitions and YAML loader/validator
  - phase: 08-04
    provides: CLI chain commands (validate, run, list)
  - phase: 08-05
    provides: Gateway chain executor endpoint
provides:
  - 6 pre-built chain YAML definitions covering all 4 connectors
  - Template examples for user-created custom chains
  - Conditional logic examples using if field
  - Data passing examples using ${{ steps.X.field }} syntax
affects: [08-07, 09-self-hosting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-built chain YAML definitions in chains/ directory at project root"
    - "Connector pair coverage: GitHub+Slack, GitHub+Discord, Stripe+Slack, GitHub+Stripe, Slack+Discord"

key-files:
  created:
    - chains/github-slack-issue-notify.yaml
    - chains/github-discord-pr-notify.yaml
    - chains/github-slack-pr-review.yaml
    - chains/stripe-slack-payment-alert.yaml
    - chains/github-stripe-customer-issue.yaml
    - chains/slack-discord-cross-post.yaml
  modified: []

key-decisions:
  - "Each chain has exactly 2 steps (action + notification/creation) for simplicity"
  - "Conditional logic uses steps.X.status == 'success' and steps.X.number > 0 patterns"
  - "Null coalescing (${{ x ?? fallback }}) used for optional data fields"

patterns-established:
  - "Pre-built chains live in chains/ at project root (resolved by CLI builtin.go)"
  - "All chains use retry policy with max_attempts: 2 and delay_seconds: 3-5"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 8 Plan 6: Pre-built Chains Summary

**6 pre-built chain YAML definitions covering all connector pairs (GitHub, Slack, Discord, Stripe) with conditional logic, data passing, and typed params**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T20:35:13Z
- **Completed:** 2026-02-07T20:37:51Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created 6 pre-built chain YAML files in the chains/ directory
- Covered all connector pair combinations: GitHub+Slack (2), GitHub+Discord (1), Stripe+Slack (1), GitHub+Stripe (1), Slack+Discord (1)
- All chains pass CLI validation (`feelr chain validate`)
- 3 chains use conditional logic via the `if` field
- All chains pass data between steps using `${{ steps.X.field }}` template syntax
- All chains have typed params with descriptions and defaults where appropriate

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GitHub+Slack and GitHub+Discord pre-built chains** - `5d1d9d1` (feat)
2. **Task 2: Create Stripe+Slack, GitHub+Stripe, and Slack+Discord chains** - `a3b7532` (feat)

## Files Created/Modified
- `chains/github-slack-issue-notify.yaml` - Creates GitHub issue, notifies Slack with conditional on issue number
- `chains/github-discord-pr-notify.yaml` - Fetches PR details, posts formatted notification to Discord
- `chains/github-slack-pr-review.yaml` - Lists open PRs, posts summary to Slack channel
- `chains/stripe-slack-payment-alert.yaml` - Lists succeeded Stripe payments, alerts Slack
- `chains/github-stripe-customer-issue.yaml` - Gets Stripe customer, creates GitHub issue with details
- `chains/slack-discord-cross-post.yaml` - Searches Slack messages, cross-posts to Discord

## Decisions Made
- Each chain has exactly 2 steps for simplicity and clarity as templates
- Conditional logic uses `steps.X.status == 'success'` and `steps.X.number > 0` patterns
- Null coalescing (`${{ x ?? fallback }}`) used for optional data fields like customer name/email
- All chains use retry policy (max_attempts: 2, delay_seconds: 3-5) for reliability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 pre-built chains ready for use via `feelr chain run <chain-name>`
- Chains serve as templates for user-created custom chains
- Ready for 08-07-PLAN.md (final phase 8 plan)

## Self-Check: PASSED

---
*Phase: 08-composable-actions*
*Completed: 2026-02-07*
