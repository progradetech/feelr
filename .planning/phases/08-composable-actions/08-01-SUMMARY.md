---
phase: 08-composable-actions
plan: 01
subsystem: api
tags: [go, chain, yaml, json, validation, data-model]

# Dependency graph
requires:
  - phase: 04-cli-core
    provides: Go CLI module structure and build tooling
provides:
  - Chain, Step, Param, RetryPolicy Go structs for chain definitions
  - LoadChain/LoadChainFromBytes for YAML and JSON parsing
  - ValidateChain for chain definition constraint enforcement
affects: [08-02 executor, 08-03 selector, 08-04 condition evaluator, 08-05 CLI commands]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Combined uses field with connector/action format (github/issues.create)"
    - "LoadChainFromBytes for format-agnostic parsing (reusable by gateway)"
    - "Descriptive validation errors with step index and field name"

key-files:
  created:
    - cli/internal/chain/types.go
    - cli/internal/chain/loader.go
    - cli/internal/chain/loader_test.go
  modified:
    - cli/go.mod

key-decisions:
  - "go.yaml.in/yaml/v3 promoted from indirect to direct dependency"
  - "Param.Default is string type (coerced at runtime based on Type field)"
  - "With values are strings supporting ${{ }} interpolation templates"
  - "Forward reference detection parses steps.X tokens from if expressions"

patterns-established:
  - "Chain validation as separate ValidateChain function (composable with different load paths)"
  - "applyDefaults before validation (defaults set, then constraints checked)"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 8 Plan 01: Chain Definition Types and Loader Summary

**Chain/Step/Param/RetryPolicy Go structs with YAML+JSON loader and 10-step validation ceiling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T20:15:14Z
- **Completed:** 2026-02-07T20:18:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Defined core chain data model (Chain, Step, Param, RetryPolicy) with dual YAML/JSON struct tags
- Implemented LoadChain with file extension detection and LoadChainFromBytes for gateway reuse
- ValidateChain enforces max 10 steps, no duplicate IDs, connector/action uses format, no forward step references, valid param types, retry constraints
- 14 tests covering both formats and all validation error paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Define chain data model types** - `7e578aa` (feat)
2. **Task 2: Implement chain file loader with validation** - `fcd7485` (feat)

## Files Created/Modified
- `cli/internal/chain/types.go` - Chain, Step, Param, RetryPolicy structs with MaxSteps/MaxChainName constants
- `cli/internal/chain/loader.go` - LoadChain, LoadChainFromBytes, ValidateChain with forward reference detection
- `cli/internal/chain/loader_test.go` - 14 tests for YAML/JSON loading, all validation rules, defaults
- `cli/go.mod` - Promoted go.yaml.in/yaml/v3 from indirect to direct dependency

## Decisions Made
- Promoted go.yaml.in/yaml/v3 from indirect to direct dependency (was already in go.mod via viper)
- Param.Default as string type -- coercion to number/boolean happens at runtime in the executor
- With map values are strings that may contain `${{ }}` templates -- resolved by template engine at execution time
- Forward reference detection tokenizes if expressions for `steps.X` patterns against seen step IDs
- SplitN with limit 3 for uses validation catches both no-slash and multi-slash cases

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed YAML generation in too-many-steps test**
- **Found during:** Task 2 (loader tests)
- **Issue:** Test generated invalid YAML due to extra line in loop body producing `mapping values are not allowed` parse error
- **Fix:** Removed duplicate line in YAML step generation loop
- **Files modified:** cli/internal/chain/loader_test.go
- **Verification:** Test now correctly generates 11 valid steps and triggers max-steps validation
- **Committed in:** fcd7485 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test generation fix. No scope creep.

## Issues Encountered
None beyond the test fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chain types ready for executor (Plan 02), selector (Plan 03), condition evaluator (Plan 04)
- LoadChainFromBytes provides gateway upload path for Plan 06 (chain CRUD API)
- Template resolver tests already exist in chain package (from prior work), all passing alongside new loader tests

---
*Phase: 08-composable-actions*
*Completed: 2026-02-07*

## Self-Check: PASSED
