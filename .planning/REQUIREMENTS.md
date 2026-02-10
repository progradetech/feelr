# Requirements: Feelr

**Defined:** 2026-02-10
**Core Value:** An AI agent can call any supported external API in one line with near-zero context overhead

## v1.2.0 Requirements

Requirements for Marketing & Onboarding milestone. Each maps to roadmap phases.

### CI/CD

- [ ] **CICD-01**: Staging deploy succeeds with Cloudflare API token that has KV write permissions
- [ ] **CICD-02**: GoReleaser config updated to push Homebrew formula to progradetech/homebrew-feelr
- [ ] **CICD-03**: Deprecation formula in andrewprograde/homebrew-feelr guides users to new tap

### Landing Page

- [ ] **LAND-01**: Landing page at app.feelr.dev with hero section, value proposition, and sign-in CTA
- [ ] **LAND-02**: Install commands displayed below sign-in (brew install progradetech/feelr/feelr + feelr init)
- [ ] **LAND-03**: Feature cards showing the 4 connectors and key capabilities
- [ ] **LAND-04**: Brand typography applied (Space Grotesk headings, JetBrains Mono code, Inter body)
- [ ] **LAND-05**: Landing page exports SEO metadata (title, description, Open Graph tags)

### Interactive Demo

- [ ] **DEMO-01**: Embedded terminal UI component with animated typing effects
- [ ] **DEMO-02**: Scripted walkthrough sequence: feelr init → feelr run github.list-repos → JSON response
- [ ] **DEMO-03**: Demo button on landing page launches the terminal walkthrough
- [ ] **DEMO-04**: Terminal walkthrough completes in under 30 seconds

### Demo Dashboard

- [ ] **DASH-01**: DemoContext provider with sessionStorage-backed demo mode flag
- [ ] **DASH-02**: Mock data fixtures matching existing dashboard TypeScript types
- [ ] **DASH-03**: AuthGuard bypass when demo mode is active
- [ ] **DASH-04**: All 4 SWR hooks return mock data when in demo mode
- [ ] **DASH-05**: Demo banner visible on all dashboard pages indicating demo mode
- [ ] **DASH-06**: Terminal walkthrough transitions to demo dashboard view
- [ ] **DASH-07**: Interactive mutations in demo mode show toast + local state update

### Analytics

- [ ] **ANLYT-01**: Cloudflare Web Analytics script integrated on all pages

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### SDKs

- **SDK-01**: Python SDK for Feelr API
- **SDK-02**: Node.js SDK for Feelr API

### Connectors

- **CONN-01**: Notion connector
- **CONN-02**: Vercel connector

### Platform

- **PLAT-01**: MCP-compatible mode (thin bridge adapter)
- **PLAT-02**: Team key sharing with scoped permissions

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real sandboxed terminal (Docker per session) | Requires backend infrastructure, embedded walkthrough achieves same goal |
| Real API calls in demo | Requires token management, mocked responses are predictable and zero-maintenance |
| GoReleaser brews → homebrew_casks migration | Don't change two things at once — migrate formula format separately from tap owner |
| Visual chain builder / drag-and-drop UI | Target audience is developers, not visual builders |
| Server-side rendering for dashboard | Static export is sufficient, SSR adds deployment complexity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CICD-01 | TBD | Pending |
| CICD-02 | TBD | Pending |
| CICD-03 | TBD | Pending |
| LAND-01 | TBD | Pending |
| LAND-02 | TBD | Pending |
| LAND-03 | TBD | Pending |
| LAND-04 | TBD | Pending |
| LAND-05 | TBD | Pending |
| DEMO-01 | TBD | Pending |
| DEMO-02 | TBD | Pending |
| DEMO-03 | TBD | Pending |
| DEMO-04 | TBD | Pending |
| DASH-01 | TBD | Pending |
| DASH-02 | TBD | Pending |
| DASH-03 | TBD | Pending |
| DASH-04 | TBD | Pending |
| DASH-05 | TBD | Pending |
| DASH-06 | TBD | Pending |
| DASH-07 | TBD | Pending |
| ANLYT-01 | TBD | Pending |

**Coverage:**
- v1.2.0 requirements: 20 total
- Mapped to phases: 0
- Unmapped: 20 (awaiting roadmap)

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after initial definition*
