# Phase 22: Staging Custom Domains - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

<domain>
## Phase Boundary

All three staging services (gateway, dashboard, docs) accessible via custom subdomains under feelr.dev (staging-api.feelr.dev, staging-app.feelr.dev, staging-docs.feelr.dev) with CI/CD automation. Staging and production remain fully isolated.

</domain>

<decisions>
## Implementation Decisions

### Deployment triggers
- Every push to main triggers staging deployment (continuous deployment)
- Manual workflow_dispatch also available for re-deploying without code push
- Path-filtered independently — only the service whose code changed gets deployed
- If staging deploy fails, the workflow fails (pipeline shows red)

### Staging environment config
- Production-equivalent behavior with verbose error responses (same rate limits, but detailed error messages instead of generic ones)
- Separate test credentials for connector API keys/tokens — staging must not touch production external services
- Prominent banner on staging dashboard showing "You're on staging" — informational only, no link to production

### Access controls
- Cloudflare Access with email-based OTP protecting all three staging services (gateway, dashboard, docs)
- Only specific email addresses allowed through (configured per-user, not open to any email)
- CI/CD bypass for CF Access — Claude's discretion on whether service token is needed based on deploy flow

### Verification & smoke tests
- Automated health checks in CI after each staging deploy — hits health endpoints, fails workflow if unhealthy
- Health check depth: just HTTP 200 (basic liveness check)
- Unauthenticated /health endpoint exempt from CF Access — allows CI and monitoring tools to check freely
- On failure: just fail the workflow, no external notifications

### Claude's Discretion
- Whether CI/CD needs a CF Access service token (depends on whether deploy flow hits staging URLs)
- Exact banner styling and placement on staging dashboard
- Health endpoint implementation details per service
- DNS record configuration approach
- Azure SWA custom domain binding specifics

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-staging-custom-domains*
*Context gathered: 2026-02-11*
