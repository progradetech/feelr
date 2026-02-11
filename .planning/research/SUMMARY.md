# Research Summary: Staging Custom Domains & Branding Integration

**Domain:** DevOps infrastructure (staging environments) + Frontend branding (favicon/manifest)
**Researched:** 2026-02-11
**Overall confidence:** HIGH

## Executive Summary

This milestone addresses two independent concerns: establishing custom staging subdomains across all three Feelr services (dashboard, docs, gateway) and integrating the existing SVG branding assets as favicons, logos, and web manifest entries across the dashboard and docs apps.

The most significant finding is that Azure Static Web Apps has a hard limitation: custom domains cannot be assigned to preview/staging environments. This has been an open feature request since May 2020 with no resolution timeline. The recommended approach, confirmed by Microsoft's own multi-stage deployment blog post and community consensus, is to create **separate SWA instances** dedicated to staging, each with its own deployment token and custom domain binding. This means 2 new Azure SWA Standard resources ($18/month total) and 2 new GitHub Actions secrets. The gateway staging domain is trivial by comparison -- Cloudflare Workers supports per-environment custom domains natively via `wrangler.toml`.

For branding, Next.js 15 App Router provides file-based favicon conventions that work out of the box with static export. Place `favicon.ico`, `icon.svg`, and `apple-icon.png` in the `app/` directory and Next.js auto-injects the correct `<link>` tags. Nextra 4 uses the same App Router, so the same conventions apply. The only new dependency is `sharp` (dev only) to convert the SVG logomark into the required PNG/ICO formats via a one-time build script.

## Key Findings

**Stack:** 1 new dev dependency (sharp ^0.34.5), 2 new Azure SWA Standard instances, 3 new DNS CNAME records, workflow config changes only.
**Architecture:** Separate SWA instances for staging (forced by Azure limitation), Cloudflare Workers custom_domain for gateway staging, Next.js file-based icons for branding.
**Critical pitfall:** Azure SWA does NOT support custom domains on staging environments. Must use separate SWA instances with their own deployment tokens.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Staging Custom Domains** - Infrastructure setup first
   - Addresses: staging-api.feelr.dev (gateway), staging-app.feelr.dev (dashboard), staging-docs.feelr.dev (docs)
   - Avoids: Trying to use Azure SWA deployment_environment with custom domains (impossible)
   - Rationale: Infrastructure changes should precede content changes. Once staging domains exist, branding work can be verified on staging before production.

2. **Branding & Favicon Integration** - Asset generation and integration
   - Addresses: favicon.ico, icon.svg, apple-icon.png, manifest.webmanifest, navbar logo replacement
   - Avoids: Using Next.js code-generated icons (icon.tsx) for complex SVGs with gradients (Satori rendering limitations)
   - Rationale: Depends on working staging environments to verify branding changes before production push.

**Phase ordering rationale:**
- Staging domains are pure infrastructure -- no code changes to the apps themselves (only workflow and config changes). Getting these working first provides a verification environment for all subsequent work.
- Branding is code changes to both apps. Having staging domains means branding can be verified at staging-app.feelr.dev and staging-docs.feelr.dev before a production tag push.
- The gateway staging domain (wrangler.toml change) can be done independently in the same phase as SWA staging, since it uses a different deployment pipeline.

**Research flags for phases:**
- Phase 1 (Staging Domains): Needs manual Azure Portal steps (create SWA resources, configure custom domains). The CNAME validation can take time to propagate.
- Phase 2 (Branding): Standard patterns, unlikely to need additional research. File-based icons are well-documented and verified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against official Azure docs, Next.js docs, Cloudflare docs, and existing codebase. |
| Features | HIGH | Feature set is well-defined: 3 staging subdomains + branding across 2 apps. No ambiguity. |
| Architecture | HIGH | Azure SWA limitation is confirmed by official docs and community. Separate instances is the standard workaround. |
| Pitfalls | HIGH | Azure SWA custom domain limitation is thoroughly documented. manifest.ts force-static requirement verified in multiple sources. |

## Gaps to Address

- Exact SWA default hostnames for staging instances (only known after Azure Portal creation)
- Azure SWA custom domain CNAME validation timing (can take minutes to days depending on DNS propagation)
- Whether `sharp` handles the Feelr logomark SVG gradients correctly at 32x32 (should be tested during icon generation script development)
