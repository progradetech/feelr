---
phase: 02-auth-vault
plan: 01
subsystem: crypto-foundation
tags: [aes-256-gcm, hkdf, web-crypto, kv-namespace, durable-objects, auth-types]
requires:
  - 01-edge-gateway-foundation
provides:
  - crypto-module (encrypt/decrypt/hashToken)
  - auth-types (ApiKeyRecord, CredentialRecord, TokenState, ParsedApiKey)
  - appenv-bindings (AUTH_KV, TOKEN_COORDINATOR, ENCRYPTION_KEY, ADMIN_TOKEN)
  - wrangler-kv-do-config
  - auth-error-codes (CREDENTIAL_EXPIRED, ADMIN_AUTH_REQUIRED, ADMIN_AUTH_INVALID)
affects:
  - 02-02 (API key management imports crypto and types)
  - 02-03 (DO Token Coordinator uses types and wrangler config)
  - 02-04 (Admin auth and credential storage uses crypto, types, error codes)
  - 02-05 (Integration tests exercise all foundation artifacts)
tech-stack:
  added: []
  patterns:
    - HKDF key derivation from high-entropy Worker Secret
    - AES-256-GCM authenticated encryption with packed IV+ciphertext
    - SHA-256 token hashing for API key storage
    - KV + DO binding pattern in wrangler.toml
    - SQLite-backed Durable Object migration configuration
key-files:
  created:
    - apps/gateway/src/auth/crypto.ts
    - apps/gateway/src/auth/types.ts
  modified:
    - apps/gateway/src/lib/types.ts
    - apps/gateway/wrangler.toml
    - packages/connector-sdk/src/errors.ts
key-decisions:
  - HKDF over PBKDF2 for key derivation (master secret is already high-entropy Worker Secret)
  - Static HKDF salt hardcoded in code (not secret, provides domain separation)
  - Purpose-based domain separation via HKDF info parameter
  - Packed IV+ciphertext in single base64 string (no separate IV storage)
  - SQLite-backed DO migration (new_sqlite_classes, not new_classes)
  - Placeholder KV namespace ID (user creates real one with wrangler CLI)
duration: 2 min
completed: 2026-02-06
---

# Phase 2 Plan 1: Crypto Foundation, Auth Types, Wrangler KV/DO Config Summary

AES-256-GCM crypto module with HKDF key derivation, auth type definitions, wrangler KV/DO bindings, and auth error codes -- unlocking parallel execution of Plans 02-04.

## Performance

- Duration: ~2 minutes
- All typecheck passes across 3 workspace packages
- Zero external dependencies added

## Accomplishments

- Created crypto module (`encrypt`, `decrypt`, `hashToken`) using Workers-native Web Crypto API exclusively
- Defined auth storage types: `ApiKeyRecord`, `CredentialRecord`, `TokenState`, `ParsedApiKey`
- Extended `AppEnv` with `AUTH_KV` (KVNamespace), `TOKEN_COORDINATOR` (DurableObjectNamespace), `ENCRYPTION_KEY`, `ADMIN_TOKEN` bindings
- Configured wrangler.toml with KV namespace, DO bindings, and SQLite migration tag
- Added `CREDENTIAL_EXPIRED`, `ADMIN_AUTH_REQUIRED`, `ADMIN_AUTH_INVALID` to `ErrorCode` union

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create crypto module with HKDF key derivation and AES-256-GCM encrypt/decrypt | 3e02edb | apps/gateway/src/auth/crypto.ts |
| 2 | Create auth types, update AppEnv, configure wrangler, and add error codes | d2384a0 | apps/gateway/src/auth/types.ts, apps/gateway/src/lib/types.ts, apps/gateway/wrangler.toml, packages/connector-sdk/src/errors.ts |

## Files Created

- `apps/gateway/src/auth/crypto.ts` -- AES-256-GCM encrypt/decrypt with HKDF derivation, SHA-256 hashToken
- `apps/gateway/src/auth/types.ts` -- ApiKeyRecord, CredentialRecord, TokenState, ParsedApiKey interfaces

## Files Modified

- `apps/gateway/src/lib/types.ts` -- AppEnv extended with AUTH_KV, TOKEN_COORDINATOR, ENCRYPTION_KEY, ADMIN_TOKEN bindings and apiKeyRecord variable
- `apps/gateway/wrangler.toml` -- Added KV namespace binding, DO bindings with TokenCoordinator class, SQLite migration
- `packages/connector-sdk/src/errors.ts` -- ErrorCode union extended with 3 auth-specific codes

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| HKDF over PBKDF2 | Worker Secret is already high-entropy; PBKDF2's 100K+ iterations would be wasted CPU. HKDF is single-pass. |
| Static HKDF salt | Salt provides domain separation, not secrecy. Hardcoded `feelr-credential-encryption-v1` string. |
| Purpose-based domain separation | HKDF `info` parameter allows deriving independent keys for different purposes from one master secret. |
| Packed IV+ciphertext format | Single base64 string contains IV (12 bytes) + ciphertext (with 16-byte GCM auth tag). No separate IV storage needed. |
| new_sqlite_classes migration | Modern DO pattern -- SQLite-backed is recommended over KV-only for all new DOs. |
| Placeholder KV namespace ID | User creates real namespace with `npx wrangler kv namespace create AUTH_KV` and updates the ID. |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Before deploying to Cloudflare:

1. Create KV namespace: `npx wrangler kv namespace create AUTH_KV` -- then update the `id` field in `wrangler.toml`
2. Set encryption key secret: `openssl rand -hex 32 | npx wrangler secret put ENCRYPTION_KEY`
3. Set admin token secret: `openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN`

## Next Phase Readiness

Plans 02-02, 02-03, and 02-04 are fully unblocked:
- **02-02** (API Key Management): Can import `crypto.ts` for hashToken, `auth/types.ts` for ApiKeyRecord, and use AUTH_KV binding
- **02-03** (DO Token Coordinator): Can import `auth/types.ts` for TokenState, wrangler config already declares DO bindings
- **02-04** (Admin Auth + Credential Storage): Can import `crypto.ts` for encrypt/decrypt, use ADMIN_TOKEN binding, and use new error codes

## Self-Check: PASSED
