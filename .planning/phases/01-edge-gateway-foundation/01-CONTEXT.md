# Phase 1: Edge Gateway Foundation - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

A working Cloudflare Workers + Hono gateway that routes requests to connectors and returns normalized responses through a consistent envelope. This phase delivers the routing layer, response format, error format, and Connector SDK types. No auth, no real connectors — just the skeleton that everything else plugs into.

</domain>

<decisions>
## Implementation Decisions

### Response envelope shape
- Standard envelope: `{ ok, data, error, meta }`
- **Meta contents:** Claude's discretion — pick what's useful for agents without bloating
- **Data shape:** Claude's discretion — decide whether data is always array or matches request shape
- **Pagination:** Claude's discretion — decide whether pagination lives in meta or as top-level siblings
- **Raw upstream response:** Available behind a `?raw=true` query param for debugging; omitted by default

### Error communication
- **Actionable hints:** Three hints only — `retry` (transient failure), `auth` (re-authenticate), `abort` (permanent, don't retry)
- **Error messages:** Feelr-authored primary message + upstream's original message in a `detail` field for context
- **HTTP status codes:** Feelr normalizes all upstream codes to its own set (400, 401, 403, 404, 429, 500, 502) — predictable across all connectors
- **Error code style:** Claude's discretion — pick the code format (namespaced strings vs short codes)

### Connector routing & naming
- **URL action pattern:** Claude's discretion — pick between dot notation (/v1/github/issues.list) and slash-separated (/v1/github/issues/list)
- **HTTP methods:** Claude's discretion — decide whether all-POST or method-matched
- **API versioning:** Claude's discretion — decide strategy starting with /v1
- **API key location:** Accept in both `X-Feelr-Key` header AND `?key=fk_xxx` query param (header preferred, query param for quick testing)

### Response normalization depth
- **Field naming:** snake_case everywhere, regardless of upstream API conventions — consistent across all connectors
- **Flattening depth:** Claude's discretion — pick the flattening strategy that best serves agent consumption
- **Timestamp format:** Claude's discretion — pick a single consistent format across all connectors
- **Shared types vs connector-defined:** Claude's discretion — decide whether common resource types exist or each connector defines its own shape

### Claude's Discretion
- Meta field contents and shape
- Data field shape (always array vs match request)
- Pagination placement
- Error code format (namespaced vs short)
- URL action pattern (dots vs slashes)
- HTTP method strategy (all-POST vs method-matched)
- API versioning approach
- Response flattening depth
- Timestamp format
- Shared base types vs connector-specific shapes

</decisions>

<specifics>
## Specific Ideas

- Raw upstream response available via `?raw=true` flag — useful for debugging when normalized response is insufficient
- API key accepted in header or query param to support both production use and quick curl testing
- The success criteria reference `curl api.feelr.dev/v1/github/issues.list -H "X-Feelr-Key: fk_xxx"` as the target developer experience

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-edge-gateway-foundation*
*Context gathered: 2026-02-05*
