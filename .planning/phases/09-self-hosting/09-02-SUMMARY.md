---
phase: 09-self-hosting
plan: 02
subsystem: infra
tags: [yaml, config, self-hosting, docker, workerd]

# Dependency graph
requires:
  - phase: 09-self-hosting-01
    provides: Runtime abstraction interfaces (KeyValueStore, UsageDatabase, RateLimiter, TokenCoordinatorClient)
provides:
  - Commented YAML configuration template for self-hosted deployments
  - Env template with required secret placeholders
  - TypeScript config types matching YAML structure
  - Config loader with deep merge and env var overrides
affects: [09-self-hosting-03, 09-self-hosting-06, 09-self-hosting-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "YAML config + .env secrets separation for self-hosting"
    - "Built-in YAML parser (no external deps) for workerd compatibility"
    - "Deep merge with defaults for partial config overrides"
    - "Env var overrides via workerd bindings (not process.env)"

key-files:
  created:
    - self-host/feelr.yaml.template
    - self-host/env.template
    - apps/gateway/src/runtime/config.ts
  modified: []

key-decisions:
  - "Built-in YAML parser instead of js-yaml -- workerd cannot load Node.js modules"
  - "loadConfigFromObject() as alternative entry point for pre-parsed JSON configs"
  - "Env overrides applied last (FEELR_PORT, FEELR_AUTO_MIGRATE) via workerd bindings"
  - "FeelrYamlConfig is separate from FeelrConfig in interfaces.ts -- config.ts is the full YAML-level config, FeelrConfig is the minimal runtime feature toggle"

patterns-established:
  - "Config-driven feature flags: billing.enabled, encryption.enabled toggle runtime behavior"
  - "YAML template as documentation: comments teach users what each setting does"
  - "Defaults match template: DEFAULT_CONFIG values are 1:1 with feelr.yaml.template"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 9 Plan 02: Self-Hosting Configuration Summary

**YAML config template with commented settings, env secrets template, and TypeScript config loader with built-in YAML parser for workerd**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-08T00:16:30Z
- **Completed:** 2026-02-08T00:19:51Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Created fully commented `feelr.yaml.template` covering all configurable settings (gateway, billing, encryption, rate limits, storage, retention, logging)
- Created `env.template` with required secrets (FEELR_ADMIN_TOKEN, FEELR_ENCRYPTION_KEY) and optional connector credentials
- Built TypeScript config types (`FeelrYamlConfig`) matching YAML structure exactly, with `DEFAULT_CONFIG` defaults matching template values
- Implemented built-in YAML parser and `loadConfig()`/`loadConfigFromObject()` with deep merge and env var overrides

## Task Commits

Each task was committed atomically:

1. **Task 1: Create feelr.yaml template and .env template** - `6b12e1c` (feat)
2. **Task 2: Create config types and loader** - `a00545a` (feat)

## Files Created/Modified
- `self-host/feelr.yaml.template` - Fully commented YAML config template for self-hosted deployments
- `self-host/env.template` - Template .env file with required secret placeholders and optional overrides
- `apps/gateway/src/runtime/config.ts` - FeelrYamlConfig type, DEFAULT_CONFIG, loadConfig(), loadConfigFromObject()

## Decisions Made
- Built a simple hand-rolled YAML parser rather than depending on js-yaml, since the config runs in workerd which cannot load Node.js native modules. The YAML structure is simple enough (no anchors, arrays, or multi-line strings) that a line-by-line parser works.
- Provided both `loadConfig(yamlText)` for direct YAML parsing and `loadConfigFromObject(obj)` for pre-parsed JSON. The Docker entrypoint can convert YAML to JSON before injection.
- Environment variable overrides (FEELR_PORT, FEELR_AUTO_MIGRATE) are applied last, taking precedence over YAML values. They read from workerd bindings, not process.env.
- `FeelrYamlConfig` in config.ts is the full configuration surface. The existing `FeelrConfig` in interfaces.ts remains as the minimal runtime toggle interface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed deepMerge TypeScript type errors**
- **Found during:** Task 2 (config types and loader)
- **Issue:** `FeelrYamlConfig` interface is not assignable to `Record<string, unknown>` due to missing index signature. The generic `deepMerge<T extends Record<string, unknown>>` caused TS2345 errors.
- **Fix:** Changed deepMerge to use `Record<string, unknown>` parameters directly with `unknown` casts at call sites.
- **Files modified:** apps/gateway/src/runtime/config.ts
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** a00545a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type fix necessary for compilation. No scope creep.

## Issues Encountered
None beyond the type fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Config system ready for adapter factory (Plan 03) to use FeelrYamlConfig for runtime detection and rate limit configuration
- Templates ready for Docker infrastructure (Plan 06) to mount and use
- Init script (Plan 07) will generate feelr.yaml from template with user inputs

## Self-Check: PASSED

---
*Phase: 09-self-hosting*
*Completed: 2026-02-07*
