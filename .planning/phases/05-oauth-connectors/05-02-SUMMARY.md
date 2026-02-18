---
phase: 05-oauth-connectors
plan: 02
subsystem: connectors
tags: [stripe, api-key, form-encoded, payments, customers, invoices]
dependency-graph:
  requires: [03-github-connector]
  provides: [stripe-connector, stripe-8-actions, form-encoded-fetch-pattern]
  affects: [05-05-gateway-registration, 05-06-integration-tests]
tech-stack:
  added: []
  patterns: [form-encoded-post-body, starting-after-cursor-pagination, api-key-auth]
key-files:
  created:
    - connectors/stripe/package.json
    - connectors/stripe/tsconfig.json
    - connectors/stripe/src/index.ts
    - connectors/stripe/src/stripe-fetch.ts
    - connectors/stripe/src/flatten.ts
    - connectors/stripe/src/utils.ts
    - connectors/stripe/src/actions/payments-list.ts
    - connectors/stripe/src/actions/payments-get.ts
    - connectors/stripe/src/actions/customers-list.ts
    - connectors/stripe/src/actions/customers-get.ts
    - connectors/stripe/src/actions/customers-create.ts
    - connectors/stripe/src/actions/invoices-list.ts
    - connectors/stripe/src/actions/invoices-get.ts
    - connectors/stripe/src/actions/invoices-create.ts
  modified: []
decisions:
  - id: "05-02-01"
    summary: "Stripe uses Bearer token auth with API key (sk_*), not OAuth -- auth_type is api_key"
  - id: "05-02-02"
    summary: "POST bodies form-encoded via URLSearchParams, not JSON (Stripe API requirement)"
  - id: "05-02-03"
    summary: "Cursor pagination via starting_after param with last item ID (Stripe's native pattern)"
metrics:
  duration: "3 min"
  completed: "2026-02-06"
---

# Phase 5 Plan 2: Stripe Connector Summary

**Stripe connector with 8 actions using API key auth and form-encoded POST bodies, covering payments, customers, and invoices resources**

## What Was Done

Created the complete `@feelr/connector-stripe` package following the established GitHub connector pattern, adapted for Stripe's API conventions.

### Task 1: Package scaffold + stripeFetch + flatten + utils
- **package.json/tsconfig.json**: Standard workspace package setup matching GitHub/Slack connectors
- **stripe-fetch.ts**: Shared fetch helper with form-encoded POST body encoding via `URLSearchParams`, Bearer token auth (`Authorization: Bearer sk_*`), standard HTTP error mapping (401/402/404/429/400/5xx), and Stripe list pagination extraction (`has_more` + `lastId`)
- **flatten.ts**: Three flattening functions -- `flattenPaymentIntent` (9 fields), `flattenCustomer` (9 fields), `flattenInvoice` (10 fields)
- **utils.ts**: `requireCredential` and `requireParam` helpers with FeelrError throwing

### Task 2: 8 action handlers + ConnectorDefinition
- **6 read actions**: payments.list, payments.get, customers.list, customers.get, invoices.list, invoices.get
- **2 write actions**: customers.create, invoices.create (POST with form-encoded bodies)
- **ConnectorDefinition**: `auth_type: 'api_key'`, 8 actions registered
- All list actions use `starting_after` cursor pagination
- All GET-with-ID actions build path with ID segment (not query param)
- All descriptions 50-100 tokens in 3-part format (what/accepts/returns)

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Stripe package scaffold + stripeFetch + flatten + utils | f9e9d64 | stripe-fetch.ts, flatten.ts, utils.ts, package.json |
| 2 | All 8 Stripe action handlers + ConnectorDefinition | 40d9286 | 8 action files, index.ts |

## Decisions Made

1. **API key auth (not OAuth)**: Stripe uses secret API keys (`sk_live_*`/`sk_test_*`), so `auth_type` is `api_key` rather than `oauth2`. This is simpler than Slack/Discord.

2. **Form-encoded POST bodies**: Stripe's API requires `application/x-www-form-urlencoded` for POST requests, not JSON. `stripeFetch` handles this via `URLSearchParams` with undefined value filtering.

3. **Cursor pagination via starting_after**: Stripe list endpoints return `has_more` boolean and items have `id` fields. Pagination uses `starting_after=<last_item_id>` rather than page numbers (GitHub) or response_metadata cursors (Slack).

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm typecheck` passes for @feelr/connector-stripe
- stripeConnector.actions has exactly 8 entries
- auth_type is 'api_key' (confirmed)
- POST actions send form-encoded bodies via URLSearchParams
- GET-with-ID actions construct path with ID segment
- All descriptions are 50-100 tokens

## Next Phase Readiness

- Stripe connector is ready for gateway registration in Plan 05-05
- No blockers or concerns
- Pattern established: API key connectors are simpler than OAuth connectors (no token refresh needed)

## Self-Check: PASSED
