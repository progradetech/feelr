---
phase: 02-auth-vault
plan: 04
subsystem: credential-management
tags: [aes-256-gcm, admin-auth, credentials, kv-encryption, dispatch-pipeline, timing-safe]
requires:
  - 02-01 (crypto module for encrypt/decrypt)
  - 02-02 (admin route pattern, app.ts mount structure)
  - 02-03 (DO Token Coordinator RPC methods for refresh registration)
provides:
  - admin-auth-middleware (timing-safe Bearer token validation)
  - encrypted-credential-crud (store, get, remove, list with AES-256-GCM)
  - admin-credential-routes (/admin/credentials POST, GET, DELETE)
  - dispatch-credential-wiring (decrypted credential in ActionContext)
affects:
  - 02-05 (integration tests exercise credential lifecycle and dispatch pipeline)
  - 03-xx (GitHub connector will receive credential in ActionContext.credential)
  - 05-xx (OAuth connectors will use refreshable credential storage with DO coordination)
tech-stack:
  added: []
  patterns:
    - Reusable admin auth middleware with timing-safe Bearer token comparison
    - Encrypted credential CRUD with AES-256-GCM via Web Crypto API
    - KV-primary reads with optional DO coordination for refreshable tokens
    - Non-fatal credential retrieval in dispatch (graceful degradation)
key-files:
  created:
    - apps/gateway/src/middleware/admin-auth.ts
    - apps/gateway/src/auth/credentials.ts
    - apps/gateway/src/routes/admin.ts
  modified:
    - apps/gateway/src/app.ts
    - apps/gateway/src/routes/v1.ts
key-decisions:
  - Reusable adminAuthMiddleware replaces local validateAdmin pattern from Plan 02
  - Credential retrieval is non-fatal in dispatch (try/catch, proceed without on error)
  - KV-direct reads for dispatch latency (no DO round-trip in request path)
  - DO integration only on store/delete (write path), not on read path
  - Separate Hono instances for key routes and credential routes, both mounted at /admin
duration: 2 min
completed: 2026-02-06
---

# Phase 2 Plan 4: Admin Auth Middleware, Encrypted Credential CRUD, and Dispatch Pipeline Wiring Summary

Admin auth middleware with timing-safe Bearer token validation, AES-256-GCM encrypted credential CRUD in KV with DO coordinator registration for refreshable tokens, and credential retrieval wired into the v1 dispatch pipeline via ActionContext.credential.

## Performance

- Duration: ~2 minutes
- Typecheck passes across all 3 workspace packages
- Zero external dependencies added
- No deviations from plan

## Accomplishments

- Created reusable `adminAuthMiddleware` with timing-safe Bearer token comparison (replaces Plan 02 inline function)
- Built credential storage module: `storeCredential`, `getCredential`, `removeCredential`, `listCredentials`
- All credential values encrypted with AES-256-GCM before writing to KV
- Refreshable tokens (with refreshToken + expiresAt) automatically registered with DO Token Coordinator
- Created admin credential routes: POST /admin/credentials/:connector (store), GET /admin/credentials (list), DELETE /admin/credentials/:connector (remove)
- Wired credential retrieval into v1 dispatch pipeline -- decrypted credential passed to action handlers via `ActionContext.credential`
- Non-fatal credential retrieval: if decryption or KV read fails, dispatch proceeds without credential (backward-compatible with mock connector)

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Admin auth middleware and encrypted credential storage | f8551b0 | apps/gateway/src/middleware/admin-auth.ts, apps/gateway/src/auth/credentials.ts |
| 2 | Admin credential routes, app mount, and dispatch pipeline wiring | d77c3ac | apps/gateway/src/routes/admin.ts, apps/gateway/src/app.ts, apps/gateway/src/routes/v1.ts |

## Files Created

- `apps/gateway/src/middleware/admin-auth.ts` -- Reusable admin auth middleware with timing-safe Bearer token validation
- `apps/gateway/src/auth/credentials.ts` -- Credential CRUD module with AES-256-GCM encryption, KV storage, optional DO coordination
- `apps/gateway/src/routes/admin.ts` -- Admin credential management routes (store, list, remove) with adminAuthMiddleware

## Files Modified

- `apps/gateway/src/app.ts` -- Mounted adminRoutes at /admin alongside existing keyRoutes, updated route structure docs
- `apps/gateway/src/routes/v1.ts` -- Added credential retrieval before action handler dispatch, passes decrypted credential via ActionContext

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Reusable adminAuthMiddleware | Plan 02 used a local validateAdmin function. Now that credential routes also need admin auth, a shared middleware avoids duplication and ensures consistent error handling. |
| Non-fatal credential retrieval in dispatch | Mock connector and future connectors without stored credentials should still work. Graceful degradation is better than hard failure on missing credentials. |
| KV-direct reads for dispatch (no DO in request path) | DO adds latency. KV reads are fast and globally distributed. DO handles refresh via background alarms -- no need to involve DO on every request. |
| Separate Hono instances for keys and credentials | Both mount at /admin but with different sub-paths (/admin/keys vs /admin/credentials). Key routes keep their inline admin auth from Plan 02; credential routes use the new middleware. |
| Local TokenCoordinatorRpc interface | Avoids importing the DO class (which depends on cloudflare:workers) into the credential module. Uses structural typing for type safety. |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

No additional setup beyond Phase 2 Plan 1 requirements:
- KV namespace creation and wrangler.toml ID update
- ENCRYPTION_KEY and ADMIN_TOKEN Worker Secrets

The credential routes use the same AUTH_KV, ENCRYPTION_KEY, ADMIN_TOKEN, and TOKEN_COORDINATOR bindings already configured.

## Next Phase Readiness

- **02-05** (Integration Tests): Full credential lifecycle testable: store encrypted credential via admin route, dispatch request to verify credential flows to action handler, remove credential, verify dispatch proceeds without credential
- **Phase 3** (GitHub Connector): Action handlers will receive `credential` in ActionContext -- GitHub PAT stored via admin routes, decrypted and passed automatically on dispatch
- **Phase 5** (OAuth Connectors): Refreshable tokens stored with DO registration -- Slack/Discord OAuth tokens will get proactive alarm-based refresh

## Self-Check: PASSED
