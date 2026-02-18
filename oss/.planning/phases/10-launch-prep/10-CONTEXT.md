# Phase 10: Launch Prep - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Feelr publicly launchable with Stripe billing (cloud-only), a documentation site, CLI binary distribution, and open-source packaging (LICENSE, CONTRIBUTING.md, README, connector template). Self-hosting docs live in the repo, not the docs site. No new features or connectors.

</domain>

<decisions>
## Implementation Decisions

### Billing model
- Three tiers at launch: Free, Pro, Team
- Free tier limits: Claude's discretion (reasonable defaults based on dev tool patterns)
- Billing mechanism: Claude's discretion (flat monthly vs metered with base — pick what Stripe supports cleanly)
- Overage handling: Hard block with 429 response until next billing cycle — no surprise charges
- Billing disabled by default for self-hosted (existing toggle from Phase 9)

### Documentation site
- Two quick-start guides: one for direct API users (curl path), one for CLI users (install + run path)
- Per-connector action references: Hybrid — auto-generated schema tables from ActionDefinition types + hand-written examples for most common actions
- Self-hosting docs: Live in the repo README/self-host directory only. Docs site links to it, doesn't duplicate
- Docs tone: Claude's discretion (developer casual like Stripe, or technical reference — pick what fits agent-focused dev tools)

### CLI distribution
- All install methods presented equally: Homebrew tap, curl script, go install, GitHub Releases
- Update checking: Silent check on startup, cached max once/day, one-liner print if outdated, no auto-download
- Platforms: Claude's discretion (at minimum macOS + Linux amd64/arm64, Windows if GoReleaser makes it trivial)
- Release automation: Fully automated — git tag push triggers GitHub Actions, builds, signs, publishes to Releases + updates Homebrew tap

### Open-source packaging
- License: MIT
- Connector template: Full working example — complete mock connector with 3-4 actions, tests, README. Copy-and-modify pattern for contributors
- README tone: Marketing-forward — hero section, badges, feature highlights, GIF demo. Designed to grab attention on GitHub trending
- CLA: None. MIT license covers it. Keep contributor barrier low

### Claude's Discretion
- Free tier specific limits (requests/month, connectors, API keys)
- Billing mechanism (flat vs metered-with-base)
- Documentation tone (developer casual vs technical reference)
- Platform matrix (whether to include Windows)
- Pro and Team tier pricing and limits
- Stripe product/price structure

</decisions>

<specifics>
## Specific Ideas

- Quick-start should have two clear paths: API-first and CLI-first, both from zero to working request
- Connector template should be a full working example (not just types) so contributors can copy-and-modify
- README should be optimized for GitHub trending visibility — hero section, badges, feature highlights
- Hard block on overages (429) — no metered overages, no surprise charges

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-launch-prep*
*Context gathered: 2026-02-09*
