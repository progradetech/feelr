# Phase 2: Auth Vault - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure credential storage and API key management for the Feelr gateway. Users can generate/list/revoke Feelr API keys, store encrypted third-party tokens (AES-256-GCM via Web Crypto), and a Durable Objects coordinator serializes token refresh to prevent race conditions across edge locations. Auto-refresh triggers for tokens within 5 minutes of expiry.

This phase does NOT include: OAuth browser flows (Phase 5), CLI auth commands (Phase 4), dashboard UI (Phase 6), or per-connector scoping of keys (future enhancement).

</domain>

<decisions>
## Implementation Decisions

### API Key Design
- Key format prefix and structure: Claude's discretion (environment-aware vs single prefix)
- Global keys — one key accesses all connectors the user has authenticated
- Per-connector scoping deferred to a future enhancement; design storage to support it later
- Soft limit of ~25 keys per user
- Key naming/labels: Claude's discretion (required vs optional)

### Credential Lifecycle
- Initial credential storage method: Claude's discretion (API-first makes sense since CLI is Phase 4, dashboard Phase 6)
- One credential set per connector per user for now; design storage schema to support multiple later
- Expiry/revocation failure handling: Claude's discretion
- Key revocation vs credential disconnection: Claude's discretion on separation of concerns

### Token Refresh Behavior
- 3 retries with exponential backoff on refresh failure
- Proactive (eager) refresh — background check refreshes tokens approaching expiry even without incoming requests
- Concurrent request handling during refresh: Claude's discretion based on DO coordination model
- Failure state after exhausted retries: Claude's discretion

### Security Boundaries
- Single-user model for Phase 2 — multi-user isolation comes later (Dashboard phase or beyond)
- Encryption key management: Claude's discretion based on single-user model and Workers capabilities
- Audit logging level: Claude's discretion
- Separate admin mechanism required for credential management (store/delete tokens) — regular API keys should NOT grant credential management access

### Claude's Discretion
- API key prefix format and naming UX
- Credential input flow design (API-first given phase order)
- Failure/disconnection behavior after refresh exhaustion
- Concurrent request handling during active refresh
- Encryption key derivation strategy
- Audit logging scope

</decisions>

<specifics>
## Specific Ideas

- Admin token separation is a firm requirement — if a regular API key leaks, it should not expose credential management endpoints
- Storage schema should accommodate future per-connector key scoping and multi-credential per connector, even though neither ships in Phase 2
- Proactive refresh is explicitly preferred over lazy/on-demand — zero latency hit on the next real request

</specifics>

<deferred>
## Deferred Ideas

- Per-connector key scoping — future enhancement after multi-user support
- Multiple credentials per connector (e.g., github/work, github/personal) — future enhancement
- Multi-user isolation — Phase 6 (Dashboard) or dedicated phase
- OAuth browser flows — Phase 5
- CLI `feelr auth` commands — Phase 4

</deferred>

---

*Phase: 02-auth-vault*
*Context gathered: 2026-02-05*
