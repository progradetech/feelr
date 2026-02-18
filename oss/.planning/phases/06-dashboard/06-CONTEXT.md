# Phase 6: Dashboard - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Next.js web UI for managing a Feelr account — API key CRUD, connector auth status, and usage visualization. Communicates exclusively through gateway `/internal/*` API routes. No direct KV or D1 access. No billing (Phase 10). No rate limit configuration (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Page structure & navigation
- Sidebar navigation with persistent left sidebar (sections: Overview, Keys, Connectors, Usage)
- Overview landing page with summary cards (total keys, connected services count, recent usage sparkline)
- Dashboard authentication via admin token from CLI (`feelr init` generates it, user pastes into login)

### API key management
- One-time key reveal after creation with copy button — full key shown once in highlighted box, masked forever after dismissal (GitHub PAT pattern)
- Revoking a key requires typing the key name to confirm (GitHub repo deletion pattern) — extra friction for destructive action
- Key creation form and list info density are Claude's discretion

### Connector status display
- Layout (card grid vs table), status state granularity, re-auth flow approach, and detail drill-down are all Claude's discretion
- Must show: connector name, auth status (at minimum connected/not connected), and action to reconnect

### Usage visualization
- Metrics, time windows, chart types, and filter controls are all Claude's discretion
- Must satisfy success criteria: usage queryable per key, per connector, per time window (hour/day/month)

### Claude's Discretion
- Visual style direction (developer-minimal vs polished SaaS — user is open to either)
- API key creation form (inline vs modal)
- Key list info density (minimal vs detailed with last-used/request-count)
- Connector layout (cards vs table), status states (3 vs 4 states), re-auth UX (browser OAuth vs CLI instructions), detail view (yes/no)
- Usage metrics (request count alone vs count + error rate), time range controls (fixed presets vs date picker), chart types (line/area vs bar breakdown), filter complexity (dropdown filters vs aggregate only)

</decisions>

<specifics>
## Specific Ideas

- Sidebar navigation pattern like Stripe/Vercel developer dashboards
- Key reveal follows GitHub's one-time-show PAT pattern — "You won't be able to see this again"
- Key revocation uses GitHub-style type-to-confirm for destructive safety
- Admin token auth keeps the dashboard simple without needing a separate user management system

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-dashboard*
*Context gathered: 2026-02-06*
