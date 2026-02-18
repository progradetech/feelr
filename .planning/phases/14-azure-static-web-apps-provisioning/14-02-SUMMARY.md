---
phase: 14-azure-static-web-apps-provisioning
plan: 02
subsystem: infra
tags: [azure, swa, dns, ssl, cloudflare, custom-domains]

# Dependency graph
requires:
  - phase: 14-01-swa-provisioning
    provides: "Azure SWA resources (feelr-dashboard, feelr-docs) with default hostnames"
  - phase: 11-dns-cloudflare
    provides: "Cloudflare DNS zone authority for feelr.dev"
provides:
  - "Custom domain app.feelr.dev -> feelr-dashboard SWA"
  - "Custom domain feelr.dev -> feelr-docs SWA"
  - "Managed SSL certificates for both custom domains"
  - "TXT validation records for SSL certificate renewal"
affects: [15-frontend-cicd, 16-deployment-guides]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Azure SWA DNS-TXT domain validation", "Cloudflare CNAME flattening for apex domain", "DNS-only (gray cloud) required for Azure SSL"]

key-files:
  created: []
  modified: []

key-decisions:
  - "DNS-only mode (gray cloud) for all CNAME records — Azure SSL breaks with Cloudflare proxy"
  - "CNAME flattening at apex for feelr.dev -> SWA (Cloudflare auto-resolves to A records)"
  - "_dnsauth TXT records kept permanently for Azure managed SSL certificate renewal"
  - "Hostname bindings re-created after token mismatch from initial --no-wait attempts"

patterns-established:
  - "Azure SWA custom domains: hostname set --validation-method dns-txt-token, then add TXT + CNAME in Cloudflare"
  - "Apex domains via Cloudflare CNAME flattening (@ CNAME -> *.azurestaticapps.net)"

# Metrics
duration: 45min
completed: 2026-02-10
---

# Phase 14 Plan 02: Custom Domain Wiring Summary

**Custom domains app.feelr.dev and feelr.dev wired to Azure SWA with TXT-validated managed SSL certificates via Cloudflare DNS-only CNAME records**

## Performance

- **Duration:** ~45 min (includes DNS propagation and SSL provisioning wait times)
- **Started:** 2026-02-10T14:00:00Z
- **Completed:** 2026-02-10T14:44:00Z
- **Tasks:** 3
- **Files modified:** 0 (all DNS/Azure configuration)

## Accomplishments
- Custom domain app.feelr.dev validated and serving dashboard with HTTP 200 and valid SSL
- Custom domain feelr.dev validated and serving docs/marketing with HTTP 200 and valid SSL
- Both Azure SWA hostname bindings in "Ready" status with managed SSL certificates active
- Security headers (Strict-Transport-Security, Referrer-Policy) confirmed on custom domains
- _dnsauth TXT records in place for ongoing SSL certificate renewal

## Task Commits

1. **Task 1: Initiate domain verification and retrieve validation tokens** - N/A (Azure CLI operations only, no file changes)
2. **Task 2: Add DNS records in Cloudflare dashboard** - N/A (human checkpoint — user added 4 DNS records)
3. **Task 3: Verify custom domains, SSL certificates, and site access** - N/A (verification only, no file changes)

## Files Created/Modified
None — this plan was entirely DNS and Azure configuration, no code changes.

## DNS Records Created

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| TXT | _dnsauth.app | _uamtxzy6z54wvks3f9ifi8cx3qen441 | N/A |
| CNAME | app | nice-island-0a28e4710.1.azurestaticapps.net | DNS only |
| TXT | _dnsauth | _jvv97eigyr4s2zxaa9wvd6kg5j2qn9e | N/A |
| CNAME | @ | icy-coast-012670e10.4.azurestaticapps.net | DNS only (flattened) |

## Decisions Made
- **DNS-only mode mandatory:** Cloudflare proxy (orange cloud) breaks Azure managed SSL certificate provisioning and renewal. All CNAME records must remain gray cloud permanently.
- **Hostname re-creation:** Initial `--no-wait` attempts generated tokens that expired/changed on re-creation. Final successful approach: create binding, immediately retrieve token, update DNS, then validate synchronously.
- **Permanent TXT records:** _dnsauth TXT records must be kept permanently — Azure uses them for automated SSL certificate renewal via DigiCert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hostname bindings re-created after token mismatch**
- **Found during:** Task 3 (domain verification)
- **Issue:** Initial hostname bindings created with `--no-wait` generated tokens, but subsequent agent re-creation generated new tokens that didn't match the TXT records in Cloudflare
- **Fix:** Deleted stale bindings, re-created fresh, retrieved new tokens, had user update TXT records
- **Verification:** Both domains show "Ready" status in Azure
- **Committed in:** N/A (Azure configuration only)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Token mismatch required one extra round of TXT record updates. No scope change.

## Issues Encountered
- **Token cycling:** Azure generates new validation tokens each time a hostname binding is created. When the initial `--no-wait` binding was deleted and re-created by a continuation agent, new tokens were generated that didn't match Cloudflare. Required user to update TXT records twice. Resolution: created bindings cleanly in the orchestrator with immediate token retrieval.

## User Setup Required

None — all DNS and Azure configuration completed during execution.

## Next Phase Readiness
- Both apps live at production URLs with valid SSL
- Phase 15 (Frontend CI/CD) can now reference app.feelr.dev and feelr.dev as deployment targets
- GitHub Actions secrets still needed before Phase 15: SWA_DASHBOARD_DEPLOYMENT_TOKEN, SWA_DOCS_DEPLOYMENT_TOKEN
- Cloudflare proxy blocker resolved: CNAME records confirmed DNS-only

## Self-Check: PASSED

Verified:
- `curl -sI https://app.feelr.dev` returns HTTP 200
- `curl -sI https://feelr.dev` returns HTTP 200
- Both Azure hostname lists show "Ready" status

---
*Phase: 14-azure-static-web-apps-provisioning*
*Completed: 2026-02-10*
