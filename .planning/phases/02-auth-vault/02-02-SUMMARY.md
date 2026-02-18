---
phase: 02-auth-vault
plan: 02
subsystem: api-key-management
tags: [api-keys, sha-256, timing-safe, kv-validation, admin-auth, crud]
requires:
  - 02-01 (crypto module for hashToken, auth types for ApiKeyRecord/ParsedApiKey)
provides:
  - api-key-module (generateApiKey, parseApiKey, validateApiKey)
  - key-crud-routes (/admin/keys POST, GET, DELETE)
  - kv-backed-api-key-middleware (replaces Phase 1 extraction-only)
affects:
  - 02-05 (integration tests exercise key lifecycle and middleware validation)
  - 03 (GitHub connector requests pass through upgraded middleware)
  - 04 (CLI auth commands call /admin/keys endpoints)
tech-stack:
  added: []
  patterns:
    - Prefixed API key format (fk_<env>_<short>_<long>) with SHA-256 hashed storage
    - Timing-safe comparison via crypto.subtle.timingSafeEqual for both API key and admin token
    - Background lastUsedAt updates via waitUntil (non-blocking)
    - Admin routes at /admin with own auth, separate from /v1 API key scope
key-files:
  created:
    - apps/gateway/src/auth/keys.ts
    - apps/gateway/src/routes/keys.ts
  modified:
    - apps/gateway/src/middleware/api-key.ts
    - apps/gateway/src/app.ts
key-decisions:
  - Admin routes mounted at /admin, not /v1 (separate auth scope)
  - Local validateAdmin function in routes/keys.ts (admin-auth middleware created in Plan 04)
  - Soft limit of 25 keys enforced via KV list prefix count
  - lastUsedAt updated via waitUntil for non-blocking background write
  - Key existence checked before DELETE (returns 404 NOT_FOUND if missing)
duration: 2 min
completed: 2026-02-06
---

# Phase 2 Plan 2: API Key CRUD and KV-Backed Middleware Summary

API key lifecycle with fk_<env>_<short>_<long> format, timing-safe SHA-256 validation against KV, admin-protected CRUD at /admin/keys, and Phase 1 middleware upgraded to real auth.

## Performance

- Duration: ~2 minutes
- Typecheck passes with zero errors across all tasks
- Zero external dependencies added

## Accomplishments

- Created key management module with `generateApiKey`, `parseApiKey`, `validateApiKey` functions
- Built admin-protected CRUD routes: POST /admin/keys (create), GET /admin/keys (list), DELETE /admin/keys/:id (revoke)
- Full key returned exactly once at creation -- only SHA-256 hash stored in KV
- Upgraded Phase 1 extraction-only middleware to full KV-backed validation
- Missing key returns 401 AUTH_REQUIRED, invalid key returns 401 AUTH_INVALID
- Admin token validated with timing-safe comparison (local function, not middleware)
- `lastUsedAt` updated in background via `waitUntil` (non-blocking)
- Soft limit of 25 keys enforced on creation

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create API key management module and key CRUD routes | 206e963 | apps/gateway/src/auth/keys.ts, apps/gateway/src/routes/keys.ts |
| 2 | Upgrade API key middleware to real KV validation and mount key routes | 5bdc88e | apps/gateway/src/middleware/api-key.ts, apps/gateway/src/app.ts |

## Files Created

- `apps/gateway/src/auth/keys.ts` -- API key generation (fk_ format), parsing, and timing-safe validation
- `apps/gateway/src/routes/keys.ts` -- Admin key management routes (create, list, revoke) with admin token auth

## Files Modified

- `apps/gateway/src/middleware/api-key.ts` -- Upgraded from Phase 1 extraction-only to full KV-backed validation with timing-safe hash comparison
- `apps/gateway/src/app.ts` -- Mounted key routes at /admin, updated middleware chain documentation

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Admin routes at /admin, not /v1 | /v1 has API key middleware; admin routes use own admin token auth. No path overlap. |
| Local validateAdmin function | Plan 04 creates the reusable admin-auth middleware. For now, a local function avoids premature abstraction. |
| Soft limit of 25 keys via KV list | Simple prefix-based count check. KV list is cheap and this is an admin-only operation. |
| lastUsedAt via waitUntil | Non-blocking -- does not add latency to the request path. Uses optional chaining for test environments. |
| 404 on DELETE of non-existent key | Better UX than silent success -- caller knows the key was already gone. |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

No additional setup beyond Phase 2 Plan 1 requirements. The API key routes use the same `AUTH_KV` and `ADMIN_TOKEN` bindings already configured in wrangler.toml.

## Next Phase Readiness

- **02-03** (DO Token Coordinator): Fully unblocked -- independent of key management
- **02-04** (Admin Auth + Credential Storage): Can import admin auth pattern from this plan's local function
- **02-05** (Integration Tests): Can test full key lifecycle: create key, use key to call /v1, revoke key, verify 401

## Self-Check: PASSED
