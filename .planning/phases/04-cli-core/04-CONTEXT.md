# Phase 4: CLI Core - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Go binary providing `run`, `tools`, `status` commands with progressive discovery, multiple output modes, and shell completion for agent consumption. OAuth flows (`feelr auth`) are Phase 5. Composable actions/batch workflows are Phase 8. CLI distribution (GoReleaser, Homebrew) is Phase 10.

</domain>

<decisions>
## Implementation Decisions

### Command structure
- Full connector names required (`github`, not `gh`) — no aliases in v1
- Architecture should support adding connector aliases later (reduces token usage for agents)
- Action parameter passing style: Claude's discretion (flag-based vs key=value vs hybrid)
- `--dry-run` global flag included — shows the HTTP request that would be sent without executing
- `tools` discovery source: Claude's discretion (live gateway vs cached with refresh)

### Output modes & formatting
- JSON output (default) prints unwrapped `data` field, not full envelope; `--verbose` for full `{ ok, data, error, meta }` envelope
- `--format minimal` design: Claude's discretion for optimal agent token consumption
- `--format table` for human-readable tabular output
- No color by default; `--color` flag to enable (agent/pipe safety first)
- Error/data stream separation: Claude's discretion (stderr vs stdout)

### Agent ergonomics
- No MCP server mode in v1 — agents use CLI via shell
- No batch mode in v1 — single action per invocation (batch is Phase 8 territory)
- Tool schema/description format: Claude's discretion (JSON Schema, help-style, or both with `--schema` flag)
- Description source (embedded vs gateway-fetched): Claude's discretion

### Auth & config flow
- API key stored in config file (default) with environment variable override (`FEELR_API_KEY`)
- Named profiles supported — each profile has its own API key and gateway URL (`feelr --profile staging run ...`)
- Config file format: TOML (`~/.feelr/config.toml` or similar)
- `feelr init` interactive wizard for first-time setup; direct config/env editing for CI and power users
- Both paths (interactive and manual) work for initial setup

### Claude's Discretion
- Action parameter passing style (flags, key=value, or hybrid)
- `tools` discovery: live gateway vs local cache with refresh
- Minimal output format design
- Error stream routing (stderr vs stdout)
- Tool schema output format
- Description embedding vs gateway fetching
- Shell completion implementation details
- Exit code semantics beyond 0/1/2

</decisions>

<specifics>
## Specific Ideas

- Full connector names only for now, but keep architecture flexible for aliases later — user sees this as a future token reduction opportunity for agents
- `--dry-run` valued for building trust and debugging — shows what HTTP request would be made
- TOML chosen specifically over YAML — aligns with Go ecosystem preferences
- No color by default is a deliberate agent-first choice — humans opt in with `--color`
- Unwrapped `data` in JSON output — agents get clean data for piping, `--verbose` when envelope needed

</specifics>

<deferred>
## Deferred Ideas

- Connector aliases (e.g., `gh` for `github`) — future enhancement to reduce agent token usage
- MCP server mode — potential future phase for direct AI agent integration
- Batch execution mode — Phase 8 (Composable Actions)
- CLI distribution (GoReleaser, Homebrew) — Phase 10

</deferred>

---

*Phase: 04-cli-core*
*Context gathered: 2026-02-06*
