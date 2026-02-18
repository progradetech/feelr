# Phase 21: Interactive Demo & Integration - Research

**Researched:** 2026-02-11
**Domain:** Animated terminal UI component with typing effects, landing page integration, and demo mode transition
**Confidence:** HIGH

## Summary

Phase 21 builds an embedded terminal UI component on the landing page that plays a scripted walkthrough of the Feelr CLI (`feelr init`, `feelr run github.list-repos`, JSON response), then transitions the user into the demo dashboard. The existing infrastructure is well-suited: DemoContext with `enterDemo()`/`exitDemo()` is already built (Phase 18), SWR hooks intercept data in demo mode (Phase 19), and the landing page is a server component with client component islands (Phase 20). The core engineering challenge is the terminal animation component itself and the sequencing logic that orchestrates multiple typing steps with pauses and output reveals.

The project currently has zero animation dependencies. The `motion` package (v12.34.0, formerly Framer Motion) officially supports React 19 (`peerDependencies: react ^18.0.0 || ^19.0.0`) and would add ~34kb min+gzip for the full `<motion>` component. However, the animations required here are trivially simple: sequential text reveal (typing) and fade-in (output blocks). These are achievable with `setInterval` for typing and CSS `@keyframes` for fade-in, resulting in zero new dependencies. Given the project's lean dependency philosophy (no animation library across 6 phases of dashboard work), a custom zero-dependency approach is the correct choice. The Magic UI Terminal component pattern provides an excellent reference architecture but should be reimplemented without the `motion` dependency.

The landing page (`app/page.tsx`) is a server component, so the terminal demo and "Try Demo" button must be client components rendered as islands. The `LandingRedirect` component already demonstrates this pattern. After the terminal walkthrough completes, the component calls `enterDemo()` from DemoContext and navigates to `/overview` via `router.push()`. The AuthGuard on the dashboard layout already bypasses auth checks when `isDemo` is true, so the transition is seamless.

**Primary recommendation:** Build a custom `<TerminalDemo>` client component using `setInterval`-based typing animation with CSS fade-in for output blocks, driven by a step-based state machine. Integrate it as a client island on the server-rendered landing page, with a "Try Demo" CTA that starts the animation and transitions to the demo dashboard on completion. No new npm dependencies required.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | State management, hooks (`useState`, `useEffect`, `useCallback`, `useRef`) | Already installed; all animation state is React state |
| Next.js | 15.5.12 | App Router, static export, `useRouter` for navigation | Already installed; client component island pattern established |
| Tailwind CSS | 4.1.18 | Terminal styling, animations via `@keyframes` in CSS | Already installed; monospace font variable `--font-jetbrains-mono` available as `font-mono` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.469.0 | Terminal icon, play button icon | Already installed; consistent with existing landing page icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom typing animation | `motion` package (34kb gzip) | Adds 34kb for 2 simple animations; project has no animation library; overkill |
| Custom typing animation | `react-type-animation` (3.2.0) | Stale (2 years old); limited API; custom gives full control over sequencing |
| Custom terminal component | Magic UI Terminal | Copy-paste component requires `motion` dependency; same visual can be built with CSS |
| `setInterval` for typing | `requestAnimationFrame` | rAF is better for continuous animations; `setInterval` with 40-80ms delay is fine for character-by-character typing and is simpler to reason about |

**Installation:**
```bash
# No new dependencies needed -- all tools already in the project
```

## Architecture Patterns

### Recommended Project Structure
```
apps/dashboard/src/
  components/
    terminal-demo/
      terminal-demo.tsx       # Main TerminalDemo client component (orchestrator)
      terminal-shell.tsx      # Terminal chrome (macOS dots, border, scrollable content area)
      typing-line.tsx         # Single line with typing animation
      output-block.tsx        # Static output that fades in after typing completes
      demo-cta.tsx            # "Try Demo" button + "Watch Demo" entry on landing page
      walkthrough-script.ts   # The demo script steps (typed data, not JSX)
  app/
    page.tsx                  # Landing page (server component) -- add TerminalDemo island
```

### Pattern 1: Step-Based Animation State Machine
**What:** A reducer/state machine that advances through discrete steps (IDLE -> TYPING_STEP_1 -> PAUSE -> OUTPUT_1 -> TYPING_STEP_2 -> ... -> COMPLETE), where each step knows its content, duration, and transition trigger.
**When to use:** When multiple sequential animations must play in order with pauses between them.
**Example:**
```typescript
// walkthrough-script.ts
export interface WalkthroughStep {
  type: 'typing' | 'output' | 'pause';
  /** For 'typing': the text to type character by character */
  text?: string;
  /** For 'typing': optional prompt prefix shown instantly (e.g., "$ ") */
  prompt?: string;
  /** For 'output': lines to reveal with fade-in */
  lines?: string[];
  /** Duration override in ms (for 'pause' steps, or typing speed per char) */
  duration?: number;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  { type: 'typing', prompt: '$ ', text: 'feelr init', duration: 60 },
  { type: 'pause', duration: 400 },
  { type: 'output', lines: [
    'Feelr CLI v1.0.0',
    'Initializing workspace...',
    'API key: flr_****...7f3a',
    'Gateway: https://api.feelr.dev',
    'Ready! Run `feelr run <action>` to get started.',
  ]},
  { type: 'pause', duration: 800 },
  { type: 'typing', prompt: '$ ', text: 'feelr run github.list-repos', duration: 50 },
  { type: 'pause', duration: 600 },
  { type: 'output', lines: [
    '{',
    '  "ok": true,',
    '  "data": [',
    '    { "name": "feelr", "stars": 1247, "language": "Go" },',
    '    { "name": "api-gateway", "stars": 89, "language": "TypeScript" },',
    '    { "name": "cli-plugins", "stars": 34, "language": "Go" }',
    '  ]',
    '}',
  ]},
  { type: 'pause', duration: 1200 },
];
```

### Pattern 2: Client Component Island on Server Page
**What:** The landing page (`app/page.tsx`) remains a server component for metadata/SEO but renders `<TerminalDemo />` as a `'use client'` island, following the exact pattern already used for `<LandingRedirect />` and `<CopyButton />`.
**When to use:** When a server-rendered page needs interactive client behavior.
**Example:**
```typescript
// app/page.tsx (server component -- no 'use client')
import { TerminalDemo } from '@/components/terminal-demo/terminal-demo';

export default function LandingPage() {
  return (
    <main>
      {/* ... existing hero, install, connectors sections ... */}
      <section className="px-4 py-16 md:px-6">
        <TerminalDemo />
      </section>
      {/* ... rest of landing page ... */}
    </main>
  );
}
```

### Pattern 3: Typing Animation with setInterval
**What:** A custom hook or component that reveals text character-by-character using `setInterval`, with cleanup on unmount and completion callback.
**When to use:** For the typing lines in the terminal walkthrough.
**Example:**
```typescript
// typing-line.tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface TypingLineProps {
  prompt?: string;
  text: string;
  speed?: number;          // ms per character
  onComplete?: () => void;
  className?: string;
}

export function TypingLine({ prompt = '', text, speed = 60, onComplete, className }: TypingLineProps) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');

    const interval = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current <= text.length) {
        setDisplayed(text.slice(0, indexRef.current));
      } else {
        clearInterval(interval);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <div className={className}>
      <span className="text-emerald-400">{prompt}</span>
      <span>{displayed}</span>
      {indexRef.current < text.length && (
        <span className="animate-terminal-cursor inline-block w-2 h-4 bg-zinc-300 ml-0.5 align-middle" />
      )}
    </div>
  );
}
```

### Pattern 4: CSS Fade-In for Output Blocks
**What:** Output blocks (multi-line JSON responses, init output) appear with a CSS animation rather than typing each character. This keeps the total walkthrough under 30 seconds while still looking polished.
**When to use:** For blocks of static output text in the terminal.
**Example:**
```css
/* globals.css addition */
@keyframes terminal-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes terminal-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@theme inline {
  --animate-terminal-fade-in: terminal-fade-in 0.3s ease-out forwards;
  --animate-terminal-cursor: terminal-cursor-blink 0.8s step-end infinite;
}
```

### Pattern 5: Demo Mode Transition
**What:** After the walkthrough completes, call `enterDemo()` from DemoContext to set demo mode, then `router.push('/overview')` to navigate to the dashboard. The existing AuthGuard bypasses auth when `isDemo` is true, and SWR hooks return mock data.
**When to use:** At the end of the terminal walkthrough sequence.
**Example:**
```typescript
// Inside TerminalDemo component
const { enterDemo } = useDemo();
const router = useRouter();

function handleWalkthroughComplete() {
  enterDemo();
  router.push('/overview');
}
```

### Anti-Patterns to Avoid
- **Typing every character of output blocks:** JSON responses have 8+ lines; typing each character would take 30+ seconds for output alone. Use fade-in for output, typing only for commands.
- **Real terminal emulation (xterm.js, etc.):** Massive dependency (200kb+) for a canned demo. The component is a styled `<pre>` block, not a real terminal.
- **Hardcoding animation timing:** Use a declarative step array, not imperative `setTimeout` chains. Step-based approach is testable and maintainable.
- **Playing animation on page load:** The terminal should have a visible "Try Demo" button. Auto-playing animations are jarring and violate accessibility guidelines (WCAG 2.2.2).
- **Forgetting reduced-motion preferences:** Must respect `prefers-reduced-motion: reduce` by either skipping animations entirely or showing the completed state instantly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Complex animation orchestration | XState or full state machine library | Simple `useReducer` with step index | Only 6-8 sequential steps; a step counter + effect is sufficient |
| Terminal emulation | xterm.js, real PTY | Styled `<pre>` + `<code>` | This is a canned script, not an interactive terminal |
| Route-aware animation cleanup | Custom unmount detection | `useEffect` cleanup + `useRef` for mounted flag | Standard React pattern for async cleanup |

**Key insight:** This is fundamentally a slideshow with typing effects, not a real terminal. Every piece of content is predetermined. The engineering should reflect that simplicity.

## Common Pitfalls

### Pitfall 1: Stale Closures in Animation Callbacks
**What goes wrong:** `onComplete` callback captures stale state because the interval closure binds to the initial render's function reference.
**Why it happens:** `setInterval` captures the `onComplete` from when the effect ran. If `onComplete` changes identity between renders, the old reference fires.
**How to avoid:** Use `useRef` for the callback: `const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete;` and call `onCompleteRef.current?.()` inside the interval.
**Warning signs:** The walkthrough gets "stuck" on a step and never advances, or skips steps.

### Pitfall 2: Memory Leaks from Uncleared Intervals
**What goes wrong:** User navigates away from landing page while typing animation is running. The interval continues firing on an unmounted component.
**Why it happens:** No cleanup in the `useEffect`, or cleanup doesn't clear ALL active intervals.
**How to avoid:** Always return a cleanup function from `useEffect` that calls `clearInterval`. Use a single interval per step, not nested timeouts.
**Warning signs:** React console warnings about state updates on unmounted components.

### Pitfall 3: Landing Page Becoming a Client Component
**What goes wrong:** Adding `'use client'` to `app/page.tsx` to use `useDemo()` or `useRouter()` directly. This breaks the `export const metadata` which requires a server component.
**Why it happens:** The "Try Demo" button needs to call `enterDemo()`, which is tempting to wire up directly in the page.
**How to avoid:** Keep `app/page.tsx` as a server component. Extract ALL interactive elements as client component islands (`<TerminalDemo />`, `<DemoCta />`).
**Warning signs:** Build error: "You are attempting to export 'metadata' from a component marked with 'use client'."

### Pitfall 4: Demo Mode Leaking to Non-Demo Users
**What goes wrong:** The `enterDemo()` call fires before the user explicitly clicks "Try Demo", or the sessionStorage flag persists unexpectedly.
**Why it happens:** Race condition where `enterDemo()` is called during component mount or animation setup.
**How to avoid:** Only call `enterDemo()` inside the `handleWalkthroughComplete()` callback, which fires after the LAST step completes. Never call `enterDemo()` on mount.
**Warning signs:** Refreshing the landing page automatically redirects to `/overview` in demo mode.

### Pitfall 5: Animation Timing Exceeds 30-Second Budget
**What goes wrong:** The walkthrough takes longer than 30 seconds, violating DEMO-04 requirement.
**Why it happens:** Typing speed too slow, too many pause steps, output blocks typed character-by-character.
**How to avoid:** Budget the timing mathematically:
  - `feelr init` = 10 chars * 60ms = 600ms
  - Pause = 400ms
  - Init output = 300ms fade-in
  - Pause = 800ms
  - `feelr run github.list-repos` = 28 chars * 50ms = 1400ms
  - Pause = 600ms
  - JSON output = 300ms fade-in
  - Pause = 1200ms
  - **Total: ~5.6 seconds** (well within budget)
**Warning signs:** Manually timing the animation sequence during development.

### Pitfall 6: Accessibility -- Autoplaying Animations
**What goes wrong:** Animation starts on page load, creating vestibular discomfort for users with motion sensitivity.
**Why it happens:** Developer wires animation to component mount instead of user interaction.
**How to avoid:** Require explicit user action (click "Try Demo" button) to start the walkthrough. Respect `prefers-reduced-motion` media query -- skip directly to completed state or show static terminal.
**Warning signs:** WCAG audit flags 2.2.2 and 2.3.3 violations.

## Code Examples

Verified patterns from the existing codebase and official sources:

### Terminal Shell Chrome (macOS-style)
```typescript
// terminal-shell.tsx
'use client';

interface TerminalShellProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function TerminalShell({ title = 'Terminal', children, className }: TerminalShellProps) {
  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 ${className ?? ''}`}>
      {/* Title bar with traffic lights */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <div className="h-3 w-3 rounded-full bg-yellow-500" />
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <span className="ml-2 text-xs text-zinc-500">{title}</span>
      </div>
      {/* Terminal content area */}
      <pre className="overflow-auto p-4 font-mono text-sm leading-relaxed text-zinc-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}
```

### Walkthrough Orchestrator Hook
```typescript
// use-walkthrough.ts
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { WALKTHROUGH_STEPS, type WalkthroughStep } from './walkthrough-script';

type WalkthroughState = 'idle' | 'running' | 'complete';

export function useWalkthrough(onComplete: () => void) {
  const [state, setState] = useState<WalkthroughState>('idle');
  const [stepIndex, setStepIndex] = useState(-1);
  const [stepDone, setStepDone] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const start = useCallback(() => {
    setState('running');
    setStepIndex(0);
    setStepDone(false);
  }, []);

  // Advance to next step when current step completes
  useEffect(() => {
    if (state !== 'running' || !stepDone) return;

    const nextIndex = stepIndex + 1;
    if (nextIndex >= WALKTHROUGH_STEPS.length) {
      setState('complete');
      onCompleteRef.current();
      return;
    }

    setStepIndex(nextIndex);
    setStepDone(false);
  }, [state, stepIndex, stepDone]);

  // Handle pause steps automatically
  useEffect(() => {
    if (state !== 'running' || stepIndex < 0) return;
    const step = WALKTHROUGH_STEPS[stepIndex];
    if (!step || step.type !== 'pause') return;

    const timer = setTimeout(() => {
      setStepDone(true);
    }, step.duration ?? 500);

    return () => clearTimeout(timer);
  }, [state, stepIndex]);

  const currentStep = stepIndex >= 0 ? WALKTHROUGH_STEPS[stepIndex] : null;
  const completedSteps = WALKTHROUGH_STEPS.slice(0, stepIndex);

  return { state, currentStep, completedSteps, stepIndex, start, markStepDone: () => setStepDone(true) };
}
```

### Existing DemoContext Usage Pattern (from Phase 18)
```typescript
// Source: apps/dashboard/src/lib/demo-context.tsx (existing)
export function useDemo(): DemoContextValue {
  return use(DemoContext);
}

// Source: apps/dashboard/src/components/auth-guard.tsx (existing)
// AuthGuard already bypasses auth when isDemo is true:
if (isDemo) return <>{children}</>;
```

### Reduced Motion Hook
```typescript
// use-reduced-motion.ts
'use client';

import { useState, useEffect } from 'react';

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);

    function handleChange(e: MediaQueryListEvent) {
      setPrefersReducedMotion(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `framer-motion` package | `motion` package (`motion/react`) | 2024 | Renamed package; React 19 support added in v12+ |
| `<Context.Provider value={}>` | `<Context value={}>` | React 19 (2024) | Project already uses direct context rendering |
| `useRouter` from `next/router` | `useRouter` from `next/navigation` | Next.js 13+ (2023) | Project already uses `next/navigation` |
| Manual font loading | `next/font/google` | Next.js 13+ (2023) | Project already uses this for JetBrains Mono, Inter, Space Grotesk |

**Deprecated/outdated:**
- `react-typist` (npm): Last updated 5+ years ago, not React 19 compatible
- `react-typing-animation`: Last published 7 years ago, no React 19 support
- `framer-motion` package name: Renamed to `motion`; import path is now `motion/react`

## Open Questions

1. **Terminal section placement on landing page**
   - What we know: The landing page has Hero -> Install -> Connectors -> Capabilities -> Footer sections
   - What's unclear: Should the terminal demo go between Install and Connectors, or have its own dedicated section?
   - Recommendation: Place it between the Install section and Connectors section, as it naturally follows "Get started in seconds" with a live demonstration. The "Try Demo" CTA should be near the terminal.

2. **"Try Demo" button behavior when user clicks during animation**
   - What we know: The button starts the walkthrough animation
   - What's unclear: Should clicking again during animation skip to the end, reset, or do nothing?
   - Recommendation: Disable the button during animation (show a "Watching..." or progress state). After completion, show "Explore Dashboard" button that triggers the transition.

3. **Mobile responsiveness of terminal component**
   - What we know: The landing page uses responsive Tailwind classes (`md:px-6`, etc.)
   - What's unclear: How small should the terminal render? Typing animations on very small screens?
   - Recommendation: Set `max-w-2xl mx-auto` on the terminal, ensure `overflow-x-auto` on `<pre>`, and reduce font size on mobile (`text-xs sm:text-sm`).

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `apps/dashboard/src/lib/demo-context.tsx`, `src/components/auth-guard.tsx`, `src/components/landing-redirect.tsx`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, all SWR hooks, all demo data files
- `npm view motion peerDependencies` -- verified React 19 support: `react: ^18.0.0 || ^19.0.0`
- `pnpm list --filter @feelr/dashboard` -- verified installed versions: React 19.2.4, Next.js 15.5.12, Tailwind 4.1.18

### Secondary (MEDIUM confidence)
- [Magic UI Terminal Component](https://magicui.design/docs/components/terminal) -- reference architecture for terminal chrome + typing animation + animated span pattern. Source code verified from GitHub (`registry/magicui/terminal.tsx`).
- [Motion.dev](https://motion.dev/docs/react-installation) -- confirmed `motion` package v12.34.0 supports React 19
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) -- CSS media query for accessibility
- [Josh W. Comeau: Accessible Animations](https://www.joshwcomeau.com/react/prefers-reduced-motion/) -- React pattern for `useReducedMotion` hook
- [Next.js useRouter docs](https://nextjs.org/docs/app/api-reference/functions/use-router) -- `router.push()` for programmatic navigation in app router

### Tertiary (LOW confidence)
- Bundle size for `motion` package (~34kb min+gzip for full motion component) -- from Motion docs, not independently verified with bundlephobia
- `react-type-animation` v3.2.0 last published 2 years ago -- from npm search results

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all tools are already installed and verified
- Architecture: HIGH -- patterns follow established codebase conventions (client islands, DemoContext, SWR hooks)
- Pitfalls: HIGH -- derived from direct code analysis of existing auth guard, landing redirect, and demo context
- Animation approach: MEDIUM -- custom implementation chosen over library; Magic UI pattern is a good reference but adapted for zero-dependency approach
- Timing budget: MEDIUM -- calculated mathematically but needs real-device testing

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days -- stable domain, no fast-moving dependencies)
