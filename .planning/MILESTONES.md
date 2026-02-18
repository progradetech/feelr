# Milestones

## v1.0 MVP (Shipped: 2026-02-09)

**Phases:** 1-10 | **Plans:** 51 | **Timeline:** 5 days (2026-02-05 to 2026-02-09)
**LOC:** ~18,600 (12,585 TypeScript + 6,021 Go) | **Files:** 401

**Delivered:** Agent-friendly API simplification layer with edge gateway, 4 connectors, Go CLI, web dashboard, composable actions, self-hosting, and launch-ready packaging.

---

## v1.1 Deployment & CI/CD (Shipped: 2026-02-10)

**Phases:** 11-16 | **Plans:** 13 | **Timeline:** 2 days (2026-02-09 to 2026-02-10)
**Commits:** 53 | **Files modified:** 71

**Delivered:** Production deployment infrastructure — DNS, multi-environment Workers, Azure Static Web Apps, 3 independent CI/CD pipelines, deployment runbooks, and safety checks.

---

## v1.2 Marketing & Onboarding (Shipped: 2026-02-11)

**Phases:** 17-21 | **Plans:** 11 | **Tasks:** 25 | **Timeline:** 2 days (2026-02-10 to 2026-02-11)
**Files modified:** 71 | **Lines changed:** +7,877 / -73

**Delivered:** Marketing and onboarding experience — landing page, interactive terminal demo, demo dashboard mode, Homebrew tap migration, Cloudflare Web Analytics.

---

## v1.3 Staging & Branding (Shipped: 2026-02-12)

**Phases:** 22-24 | **Plans:** 7 | **Tasks:** ~17 | **Timeline:** 2 days (2026-02-11 to 2026-02-12)
**Commits:** 30 | **Files modified:** 54 | **Lines changed:** +4,959 / -71

**Delivered:** Staging infrastructure with custom domains for all three services, plus full Feelr branding — favicons, web manifests, and logo integration.

---

## v1.4 Open Core (Shipped: 2026-02-17)

**Phases:** 25-29 | **Plans:** 16 | **Tasks:** 36 | **Timeline:** 5 days (2026-02-13 to 2026-02-17)
**Commits:** 43 | **Files modified:** 87 | **Lines changed:** +11,416 / -212

**Delivered:** Open-core restructuring — public MIT repo for community contributions, private cloud overlay for billing/hosting, dual CI/CD with cross-repo sync, and full community contribution infrastructure.

---

## v1.5 CI/CD Stabilization (Shipped: 2026-02-18)

**Phases:** 30-32 | **Plans:** 8 | **Tasks:** 15 | **Timeline:** 2 days (2026-02-17 to 2026-02-18)
**Files modified:** 366 | **Lines changed:** +83,810 / -128

**Delivered:** CI/CD stabilization for the open-core deployment model — stripped deploy workflows from public repo, fixed cloud repo sync and lockfile handling, verified all three service deploy workflows, established cross-repo dispatch chain, and achieved green GitHub Actions boards on both repos.

**Key accomplishments:**
1. Stripped 3 deploy workflows from public repo — clean CI-only surface (ci.yml + release.yml)
2. Generated root pnpm-lock.yaml and fixed sync workflow to preserve git subtree markers
3. Fixed gateway deploy chain with pinned stripe dependency and wrangler esbuild alias
4. Verified all 3 cloud service deploy workflows (gateway, dashboard, docs) with production smoke tests
5. Recreated cross-repo dispatch and verified full public-to-cloud sync chain
6. Cleaned up 54 stale workflow runs — both repos at green-board status

---

