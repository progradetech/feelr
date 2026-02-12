---
phase: 22-staging-custom-domains
plan: 04
subsystem: infra
tags: [azure-swa, cloudflare-access, dns, ci-cd, staging-infrastructure]

# Dependency graph
requires:
  - phase: 22-staging-custom-domains
    provides: Gateway staging environment config, dashboard staging banner, docs staging health endpoint, CI/CD workflow updates
provides:
  - Azure SWA staging instances (feelr-dashboard-staging, feelr-docs-staging)
  - Custom domain DNS records (staging-api, staging-app, staging-docs under feelr.dev)
  - CF Access email OTP protection with /health bypasses
  - GitHub Actions secrets (SWA_DASHBOARD_STAGING_TOKEN, SWA_DOCS_STAGING_TOKEN)
  - End-to-end staging deployment pipeline
affects: [deployment, security, testing, ci-cd]

# Tech tracking
tech-stack:
  added: [azure-swa-standard-plan, cloudflare-access-otp]
  patterns: [staging-infrastructure-separation, health-endpoint-bypasses]

key-files:
  created: []
  modified: []

key-decisions:
  - "Separate Azure SWA instances for staging (Azure does not support custom domains on staging environments)"
  - "CF Access email OTP with /health bypasses for all three staging services"
  - "Proxied CNAME records after Azure domain validation (orange cloud)"

patterns-established:
  - "Pattern 1: Infrastructure provisioning via human-action checkpoint (credentials not available to Claude)"
  - "Pattern 2: /health endpoints bypass CF Access for monitoring and CI/CD smoke tests"
  - "Pattern 3: TXT records kept permanently for Azure 6-month certificate renewals"

# Metrics
duration: ~30min (human-action + verification)
completed: 2026-02-12
---

# Phase 22 Plan 04: Infrastructure Provisioning Summary

**Complete staging infrastructure with three custom domains, CF Access protection, health bypasses, and CI/CD automation verified end-to-end**

## Performance

- **Duration:** ~30 min (includes manual provisioning and verification)
- **Started:** 2026-02-12
- **Completed:** 2026-02-12
- **Tasks:** 2 (both checkpoint tasks - human-action + human-verify)
- **Files modified:** 0 (infrastructure-only plan)

## Accomplishments
- Provisioned two Azure SWA Standard instances (feelr-dashboard-staging, feelr-docs-staging) with custom domain support
- Configured DNS records for three staging subdomains (staging-api, staging-app, staging-docs)
- Set up CF Access email OTP authentication with /health bypasses for monitoring
- Stored SWA deployment tokens as GitHub Actions secrets
- Verified complete staging pipeline: CI/CD → deployment → CF Access → health checks → production isolation

## Task Completion

This was an infrastructure provisioning plan with two checkpoint tasks:

1. **Task 1: Provision Azure SWA staging instances, DNS, CF Access, and GitHub secrets** - Human-action checkpoint
   - Created two Azure SWA Standard instances ($9/mo each)
   - Set GitHub secrets: SWA_DASHBOARD_STAGING_TOKEN, SWA_DOCS_STAGING_TOKEN
   - Configured DNS: CNAME + TXT records for staging-app and staging-docs
   - Added custom domains in Azure Portal with TXT validation
   - Switched CNAMEs to Proxied (orange cloud) after validation
   - Created six CF Access applications (main + health bypass for each subdomain)
   - Triggered CI/CD deployment via push to main

2. **Task 2: Verify end-to-end staging deployment** - Human-verify checkpoint
   - Verified all /health endpoints accessible without CF Access challenge
   - Verified CF Access OTP login on all main paths
   - Verified dashboard shows amber staging banner and connects to staging-api.feelr.dev
   - Verified GitHub Actions workflows completed successfully with health check steps passing
   - Verified production services unaffected (complete isolation)

**No code commits** - This plan provisioned external infrastructure only.

**Plan metadata commit:** Will be created after STATE.md update

## Infrastructure Created

**Azure SWA instances:**
- `feelr-dashboard-staging` - Standard plan, agreeable-moss-075293d10.1.azurestaticapps.net
- `feelr-docs-staging` - Standard plan, delightful-glacier-0994a4910.2.azurestaticapps.net

**Custom domains:**
- `staging-api.feelr.dev` - Gateway (auto-created by Cloudflare Workers)
- `staging-app.feelr.dev` - Dashboard (Azure SWA)
- `staging-docs.feelr.dev` - Docs (Azure SWA)

**DNS records (Cloudflare):**
- `staging-app` CNAME → agreeable-moss-075293d10.1.azurestaticapps.net (Proxied)
- `staging-docs` CNAME → delightful-glacier-0994a4910.2.azurestaticapps.net (Proxied)
- `_dnsauth.staging-app` TXT → Azure validation token (permanent)
- `_dnsauth.staging-docs` TXT → Azure validation token (permanent)

**CF Access applications:**
- "Feelr Staging API" - staging-api.feelr.dev (Allow team)
- "Feelr Staging API Health" - staging-api.feelr.dev/health (Bypass everyone)
- "Feelr Staging Dashboard" - staging-app.feelr.dev (Allow team)
- "Feelr Staging Dashboard Health" - staging-app.feelr.dev/health (Bypass everyone)
- "Feelr Staging Docs" - staging-docs.feelr.dev (Allow team)
- "Feelr Staging Docs Health" - staging-docs.feelr.dev/health (Bypass everyone)

**GitHub Actions secrets:**
- `SWA_DASHBOARD_STAGING_TOKEN` - Dashboard staging deployment token
- `SWA_DOCS_STAGING_TOKEN` - Docs staging deployment token

## Decisions Made

**Separate Azure SWA instances for staging:**
- Azure Static Web Apps does NOT support custom domains on staging environments
- Standard plan required for custom domain support ($9/mo per instance)
- Production and staging fully isolated at infrastructure level

**Proxied CNAME records:**
- Initial DNS-only mode for Azure domain validation (gray cloud)
- Switched to Proxied after validation (orange cloud) for CF Access enforcement

**Health endpoint bypasses:**
- CF Access Bypass policy on /health for all three services
- Enables monitoring and CI/CD smoke tests without authentication
- Most-specific path rule evaluated first (bypass takes precedence over domain-level Allow)

**Permanent TXT records:**
- `_dnsauth.*` TXT records must remain for Azure 6-month certificate renewals
- Deleting them would break certificate auto-renewal

## Deviations from Plan

None - plan executed exactly as written. All infrastructure provisioned manually via Azure Portal, Cloudflare Dashboard, and GitHub web UI as specified in the human-action checkpoint.

## Issues Encountered

None - all provisioning and verification steps completed successfully on first attempt.

## Verification Results

**Gateway staging (staging-api.feelr.dev):**
- ✅ /health accessible without CF Access challenge
- ✅ CF Access OTP login on /v1/mock/echo
- ✅ Gateway responds with FeelrError after OTP (expected - no API key)

**Dashboard staging (staging-app.feelr.dev):**
- ✅ /health accessible without CF Access challenge
- ✅ CF Access OTP login on main path
- ✅ Amber "You are on staging" banner displays
- ✅ API requests go to staging-api.feelr.dev (not api.feelr.dev)

**Docs staging (staging-docs.feelr.dev):**
- ✅ /health accessible without CF Access challenge
- ✅ CF Access OTP login on main path
- ✅ Docs site loads correctly

**CI/CD:**
- ✅ Gateway workflow completed with health check passing
- ✅ Dashboard workflow completed with health check passing
- ✅ Docs workflow completed with health check passing

**Production isolation:**
- ✅ api.feelr.dev unaffected
- ✅ app.feelr.dev unaffected
- ✅ feelr.dev (docs) unaffected

## Next Phase Readiness

**Complete staging infrastructure operational.** All three services deployed to custom domains with CF Access protection, health monitoring, and CI/CD automation.

**Ready for Phase 22-05 (Branding - Favicon & Social Cards):**
- Staging environment available for testing branding changes
- No blockers or concerns

---
*Phase: 22-staging-custom-domains*
*Completed: 2026-02-12*
