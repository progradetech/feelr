# Phase 8: Composable Actions - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-step workflow execution engine. Users define chains of connector actions that run as a single command, with data passing between steps and conditional logic. Includes pre-built chains for common patterns and custom chain definitions via YAML/JSON. Complexity ceiling enforced: max 10 steps, sequential only, no loops, global retry policy.

</domain>

<decisions>
## Implementation Decisions

### Chain definition format
- Support both YAML and JSON — YAML for humans writing chains, JSON for programmatic generation (agents creating chains)
- Chains stored as local files AND uploadable to gateway for server-side execution
- Step action reference syntax: Claude's discretion (combined `uses` field vs separate connector/action fields)
- Chain organization (flat vs namespaced folders): Claude's discretion

### Data passing & selectors
- Selector syntax: Claude's discretion (dot notation, dot+bracket, or full JSONPath — pick right expressiveness level)
- Interpolation style: Claude's discretion (template strings like ${{ }} vs dedicated input mapping block)
- Missing data handling: Claude's discretion (null with default vs strict failure)
- Runtime parameters: YES — chain definitions declare typed input params, users provide at runtime (e.g., `feelr chain run deploy-notify --repo owner/repo`), steps reference via params

### Conditional logic
- Conditional syntax: Claude's discretion (step-level `if:` field vs dedicated conditional block)
- Comparison operators: Full set — ==, !=, >, <, >=, <=, contains, exists
- Skipped step output handling: Claude's discretion (null resolution vs chain error)
- Boolean combinators (AND/OR): Claude's discretion based on complexity vs usefulness

### Pre-built chains & CLI experience
- Ship 5-6 pre-built chains covering all connector pairs (at least one chain per connector combination)
- CLI command structure: Claude's discretion (new `chain` subcommand vs extending `run`)
- Chain output: Default shows final step output only; --verbose shows all steps (clean for piping)
- Dry-run mode: Essential — validates definition, resolves selectors against mock data, shows execution plan

### Claude's Discretion
- Step action reference syntax (combined `uses:` vs separate fields)
- Chain file organization (flat vs namespaced)
- Selector syntax expressiveness level
- Interpolation style (template strings vs input mapping)
- Missing data handling strategy
- Conditional syntax style
- Skipped step output behavior
- Boolean combinator support
- CLI command structure for chains
- Specific pre-built chain selection (must cover all 4 connectors, 5-6 total)
- Global retry policy design

</decisions>

<specifics>
## Specific Ideas

- Runtime parameters are a hard requirement — chains must be reusable with different inputs, not self-contained
- 5-6 pre-built chains covering all connectors — user wants comprehensive examples, not minimal
- Final-step-only default output aligns with existing CLI philosophy (data to stdout, errors to stderr)
- Dry-run is essential, not nice-to-have — must validate definition AND show execution plan with mock data
- Full comparison operators (==, !=, >, <, >=, <=, contains, exists) — not just equality

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-composable-actions*
*Context gathered: 2026-02-07*
