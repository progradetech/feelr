---
phase: 21-interactive-demo-integration
plan: 01
subsystem: ui
tags: [react, terminal, animation, css-keyframes, tailwind-v4, reduced-motion, a11y]

# Dependency graph
requires:
  - phase: 20-landing-page
    provides: "globals.css with @theme inline block and Tailwind v4 setup"
provides:
  - "WalkthroughStep type and WALKTHROUGH_STEPS constant (8-step demo script)"
  - "TypingLine component with character-by-character reveal and onComplete callback"
  - "OutputBlock component with CSS fade-in animation and onComplete callback"
  - "TerminalShell component with macOS-style chrome wrapper"
  - "useReducedMotion hook for accessibility-aware animation control"
  - "terminal-fade-in and terminal-cursor-blink CSS keyframes in Tailwind theme"
affects: [21-02-interactive-demo-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [stable-callback-ref, ssr-safe-media-query, tailwind-v4-animation-theme]

key-files:
  created:
    - apps/dashboard/src/components/terminal-demo/walkthrough-script.ts
    - apps/dashboard/src/components/terminal-demo/use-reduced-motion.ts
    - apps/dashboard/src/components/terminal-demo/typing-line.tsx
    - apps/dashboard/src/components/terminal-demo/output-block.tsx
    - apps/dashboard/src/components/terminal-demo/terminal-shell.tsx
  modified:
    - apps/dashboard/src/app/globals.css

key-decisions:
  - "Template literal concatenation over cn() utility for className merging (no cn utility exists in project)"
  - "Stable callback refs (onCompleteRef) to prevent stale closure bugs in setInterval/setTimeout"
  - "SSR-safe useReducedMotion with false initial state (avoids hydration mismatch)"

patterns-established:
  - "Stable callback ref: useRef + useEffect sync for callbacks used in timers"
  - "Tailwind v4 animation registration: custom properties in @theme inline block + @keyframes"
  - "Terminal demo component composition: TerminalShell > TypingLine/OutputBlock"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 21 Plan 01: Terminal Demo Foundation Summary

**Terminal demo building blocks: walkthrough script data, TypingLine/OutputBlock/TerminalShell components, reduced-motion hook, and CSS animation keyframes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T15:44:24Z
- **Completed:** 2026-02-11T15:46:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Walkthrough script with 8 steps covering `feelr init` and `feelr run github.list-repos` demo flow
- Three composable terminal components: character-by-character typing, fade-in output, macOS chrome shell
- CSS keyframe animations registered in Tailwind v4 theme (terminal-fade-in, terminal-cursor-blink)
- SSR-safe reduced motion detection hook for accessibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Create walkthrough script data, CSS animations, and reduced-motion hook** - `ced6fef` (feat)
2. **Task 2: Create TypingLine, OutputBlock, and TerminalShell components** - `c9070af` (feat)

## Files Created/Modified
- `apps/dashboard/src/components/terminal-demo/walkthrough-script.ts` - WalkthroughStep type and 8-step WALKTHROUGH_STEPS array (pure data, no React)
- `apps/dashboard/src/components/terminal-demo/use-reduced-motion.ts` - SSR-safe hook for prefers-reduced-motion media query
- `apps/dashboard/src/components/terminal-demo/typing-line.tsx` - Character-by-character typing with blinking cursor and onComplete
- `apps/dashboard/src/components/terminal-demo/output-block.tsx` - Fade-in multi-line output with onComplete after animation
- `apps/dashboard/src/components/terminal-demo/terminal-shell.tsx` - macOS-style terminal chrome with traffic lights and scrollable content
- `apps/dashboard/src/app/globals.css` - Added terminal-fade-in and terminal-cursor-blink keyframes plus Tailwind theme animation properties

## Decisions Made
- Template literal string concatenation for className merging (no cn utility in project, plan explicitly said not to import one)
- Stable callback refs (onCompleteRef pattern) to prevent stale closure bugs in setInterval and setTimeout
- SSR-safe useReducedMotion with false initial state to avoid hydration mismatch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc` not available at monorepo root (only in dashboard node_modules) - resolved by using direct path to dashboard's tsc binary

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All terminal demo building blocks are complete and type-safe
- Plan 02 can compose these into the full interactive demo orchestrator
- Animation keyframes and Tailwind theme properties are registered and ready

## Self-Check: PASSED

All 6 files verified present. Both commit hashes (ced6fef, c9070af) confirmed in git log.

---
*Phase: 21-interactive-demo-integration*
*Completed: 2026-02-11*
