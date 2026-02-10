# Domain Pitfalls: Interactive Demo, Demo Dashboard Mode, and Landing Page

**Domain:** Marketing and onboarding features integrated into existing Next.js static export dashboard
**Researched:** 2026-02-10
**Confidence:** HIGH (verified against existing codebase, Cloudflare/GoReleaser docs, and Homebrew docs)

**Context:** This document covers pitfalls specific to adding three features to the existing Feelr dashboard: (1) animated terminal walkthrough on the landing page, (2) demo dashboard mode with DemoContext + SWR hook mocking, (3) landing page replacing the current redirect. It also covers the GoReleaser tap owner fix and Cloudflare API token permission fix. The architectural approach is defined in ARCHITECTURE.md: DemoContext with sessionStorage, hook-level mock data injection, custom terminal animation (no library).

---

## Critical Pitfalls

Mistakes that break existing functionality, strand users, or create confusing state.

---

### Pitfall 1: Root Page Component Type Change -- 'use client' to Server Component Breaks Build

**What goes wrong:**
The current `app/page.tsx` is a `'use client'` component (it uses `useEffect` and `useRouter` for redirect logic). The new landing page must be a server component to export `metadata` for SEO. If a developer adds the `metadata` export without removing `'use client'`, Next.js silently ignores the metadata (client components cannot export metadata). If they remove `'use client'` but keep the `useEffect`/`useRouter` calls, the build fails with "Cannot use useEffect in a Server Component."

This is a complete rewrite of the file, not an incremental edit. Treating it as an incremental change will cause build failures.

**Why it happens:**
The root page was originally a thin redirect (pure client logic). The new landing page is primarily static content (server renderable) with client sub-components. These are fundamentally different component types. Next.js App Router distinguishes between them at the file level via the `'use client'` directive.

**Consequences:**
- Build fails if `useEffect`/`useRouter` remain in a server component
- SEO metadata is silently dropped if `metadata` is exported from a client component
- The landing page renders with no `<title>` or `<meta description>`, hurting SEO

**Prevention:**
1. Replace `app/page.tsx` entirely -- do not modify the existing file. Delete all existing content and write the new server component from scratch.
2. Move all interactive elements (CTA buttons, terminal demo) into separate `'use client'` sub-components imported by the server page.
3. The old redirect logic is no longer needed -- the landing page has explicit "Sign In" and "Try Demo" links.
4. Verify after build: check `apps/dashboard/out/index.html` contains `<title>` and `<meta name="description">` tags.

**Detection:**
`next build` fails, or `grep -c '<title>' apps/dashboard/out/index.html` returns 0.

---

### Pitfall 2: DemoContext Initial State Flash -- isDemo is false on First Render, Causing Redirect

**What goes wrong:**
DemoContext initializes `isDemo` as `false` in `useState(false)`. The `useEffect` that reads `sessionStorage` runs after the first render. During that first render, `AuthGuard` sees `isDemo=false` AND no admin token, so it redirects to `/login`. By the time the `useEffect` sets `isDemo=true`, the user is already on the login page. Demo mode appears to not work.

**Why it happens:**
React `useState` initializer runs synchronously. `sessionStorage.getItem()` also runs synchronously, but the `useEffect` wrapper defers it to after mount. There is a one-frame gap where `isDemo` is `false` even though the user is in demo mode.

**Consequences:**
- Users clicking "Try Demo" are immediately bounced to /login
- Demo mode appears completely broken
- The issue is intermittent -- sometimes fast enough to not cause a redirect (race condition)

**Prevention:**
Initialize `isDemo` by reading sessionStorage eagerly in the `useState` initializer, not in `useEffect`:

```typescript
const [isDemo, setIsDemo] = useState(() => {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(DEMO_KEY) === 'true';
});
```

This reads sessionStorage synchronously during the first render, so `isDemo` is `true` from the very first frame. The `typeof window` check handles SSR/build-time rendering where `sessionStorage` does not exist.

**Detection:**
Manual test: navigate to /demo, verify you land on /overview (not /login). Automated: E2E test that clicks "Try Demo" and asserts URL is /overview.

---

### Pitfall 3: Homebrew Tap Migration Strands Existing Users on Dead Repository

**What goes wrong:**
You change the GoReleaser `repository.owner` from `andrewprograde` to `progradetech` and push a release. Users who previously ran `brew tap andrewprograde/feelr` still have the old tap configured. When they run `brew upgrade feelr`, Homebrew fetches from `andrewprograde/homebrew-feelr`, which either has the old formula (stale version) or a deleted formula ("formula not found"). There is no automatic redirect between third-party taps.

**Why it happens:**
Unlike Homebrew core, third-party taps do not support built-in `tap_migrations.json` redirects between taps. Homebrew's migration docs are for core-to-tap migrations, not tap-to-tap.

**Consequences:**
- Existing users stuck on old version forever unless they manually untap and re-tap
- Users report "formula not found" errors
- Trust erosion ("this tool is broken")

**Prevention:**
Execute the migration in this order:
1. Create `progradetech/homebrew-feelr` repository
2. Generate new PAT with write access to `progradetech/homebrew-feelr`
3. Update `HOMEBREW_TAP_GITHUB_TOKEN` in GitHub Secrets
4. Change `repository.owner` in `.goreleaser.yaml` to `progradetech`
5. Push a release -- GoReleaser publishes formula to new tap
6. Update old tap (`andrewprograde/homebrew-feelr`) formula with deprecation notice:
   ```ruby
   def install
     opoo "This tap is deprecated. Please run:"
     opoo "  brew untap andrewprograde/feelr"
     opoo "  brew install progradetech/feelr/feelr"
     bin.install "feelr"
   end
   ```
7. Do NOT delete the old formula for at least 3 months
8. Update all docs/README to reference new tap

**Detection:**
Post-release: `brew install progradetech/feelr/feelr && feelr --version` succeeds on clean machine.

---

### Pitfall 4: GoReleaser HOMEBREW_TAP_GITHUB_TOKEN Lacks Write Access to New Organization Repo

**What goes wrong:**
The `release.yml` workflow passes `HOMEBREW_TAP_GITHUB_TOKEN` to GoReleaser for pushing the formula. This token was created for `andrewprograde/homebrew-feelr`. When targeting `progradetech/homebrew-feelr`, the token has no write access. GoReleaser creates the GitHub Release but silently fails the Homebrew push. Users who `brew upgrade` get nothing.

**Why it happens:**
GitHub PATs are scoped to specific repositories or organizations. A PAT for `andrewprograde` has no automatic access to `progradetech` repos.

**Consequences:**
- GitHub Release created but tap never updated
- `brew install progradetech/feelr/feelr` shows old or no version
- Release workflow shows green (Homebrew push failure is non-fatal in GoReleaser)

**Prevention:**
1. Create fine-grained PAT scoped to `progradetech/homebrew-feelr` with Contents: Read and write, Metadata: Read
2. Update `HOMEBREW_TAP_GITHUB_TOKEN` GitHub Secret before first release
3. Test with `goreleaser release --snapshot --clean` locally using new token

**Detection:**
Check `progradetech/homebrew-feelr` for a commit matching the release version.

---

## Moderate Pitfalls

Mistakes that cause confusing UX, accessibility violations, or subtle bugs.

---

### Pitfall 5: Demo SWR Cache Collides with Real Data Cache

**What goes wrong:**
If the SWR keys for demo mode are the same as real mode (e.g., both use `'admin-keys'`), entering demo mode populates the SWR cache with mock data. When the user exits demo and signs in with a real token, SWR serves the cached mock data until revalidation occurs. The user briefly sees fake data on their real dashboard.

**Why it happens:**
SWR caches data by key in a static global cache. If demo mode writes to the same key as real mode, the cache is poisoned.

**Prevention:**
Namespace SWR keys by mode:
```typescript
const swrKey = isDemo ? 'demo-keys' : 'admin-keys';
```
This ensures demo data and real data occupy separate cache entries. When switching modes, SWR fetches fresh data for the new key.

**Detection:**
Test: enter demo mode, exit, sign in with real token, verify real data (not mock data) appears.

---

### Pitfall 6: Terminal Animation Breaks on Reduced-Motion Preference

**What goes wrong:**
The animated terminal auto-plays typing animation. Users with `prefers-reduced-motion: reduce` see rapidly changing content they cannot control. This is a WCAG 2.1 AA violation (Success Criterion 2.3.3).

**Why it happens:**
Animation is built first, accessibility added as afterthought.

**Prevention:**
1. Check `prefers-reduced-motion` before starting animation:
   ```typescript
   const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (prefersReducedMotion) {
     // Show all terminal lines immediately, no typing
   }
   ```
2. CSS fallback:
   ```css
   @media (prefers-reduced-motion: reduce) {
     .terminal-cursor { animation: none; }
   }
   ```
3. Provide a "Skip" button that reveals full output immediately.

**Detection:**
Lighthouse accessibility audit. Manual test: enable "Reduce motion" in OS accessibility settings, verify terminal shows static content.

---

### Pitfall 7: Mock Data Drifts from Real API Types Over Time

**What goes wrong:**
Demo fixtures (`DEMO_KEYS`, `DEMO_CONNECTORS`) are created matching current TypeScript types. Months later, the gateway adds a new field to `ApiKey` (e.g., `tier: string`). Real hooks validate against updated types. Demo fixtures are forgotten. Demo mode still compiles but shows stale/missing data.

**Why it happens:**
Mock data is created once and forgotten. TypeScript only catches drift if a new field is required, not if it is optional.

**Prevention:**
1. Use `satisfies` keyword for compile-time validation:
   ```typescript
   export const DEMO_KEYS = [...] satisfies ApiKey[];
   ```
2. Co-locate all fixtures in one file (`lib/demo-data.ts`) importing from `lib/types.ts`
3. If `ApiKey` gains a required field, the build fails until fixtures are updated

**Detection:**
TypeScript compilation. If it compiles, the types match.

---

### Pitfall 8: Cloudflare API Token Missing KV Write Permission -- Error 10023

**What goes wrong:**
The CI/CD `CLOUDFLARE_API_TOKEN` was created with "Workers Scripts: Edit" only. Deploying a Worker with KV bindings requires "Workers KV Storage: Edit". The deploy fails with `workers.api.error.unauthorized [code: 10023]` -- a generic message that does not specify which permission is missing.

**Why it happens:**
Cloudflare's "Edit Cloudflare Workers" token template does NOT include KV Storage permissions. Each binding type (KV, D1) requires a separate permission.

**Prevention:**
Create/edit the API token with ALL required permissions:

| Permission | Scope |
|------------|-------|
| Account > Workers Scripts > Edit | All accounts |
| Account > Workers KV Storage > Edit | All accounts |
| Account > D1 > Edit | All accounts |
| Zone > Workers Routes > Edit | All zones |

Durable Objects are covered by Workers Scripts (no separate permission needed).

**Detection:**
Search CI logs for `10023` or `unauthorized`. Error only appears during deploy, not build.

---

### Pitfall 9: GoReleaser brews -> homebrew_casks Migration Combined with Tap Change = Double Break

**What goes wrong:**
The `.goreleaser.yaml` uses deprecated `brews` section. If you simultaneously migrate to `homebrew_casks` AND change the tap owner, two things break: (1) formula directory changes from `Formula/` to `Casks/`, (2) install command changes from `brew install` to `brew install --cask`. Combined with the tap change, this is a three-variable change that is impossible to debug.

**Prevention:**
Change one variable at a time:
- **This milestone:** Change tap owner only. Keep `brews` (deprecated but functional).
- **Future milestone:** Migrate `brews` to `homebrew_casks` after users have settled on the new tap.

**Detection:**
Test full install flow: `brew tap progradetech/feelr && brew install progradetech/feelr/feelr && feelr --version`

---

## Minor Pitfalls

Annoyances that create technical debt but are not blocking.

---

### Pitfall 10: Terminal Demo Script Hardcoded -- Stale When CLI Commands Change

**What goes wrong:**
Terminal shows commands like `feelr auth github`. When CLI restructures commands, the demo shows outdated syntax. Users follow the demo, type the old command, get an error.

**Prevention:**
- Define terminal lines in a separate data file (`terminal-script.ts`)
- In CI, validate that each command in the script exists: `./feelr <cmd> --help`
- Update terminal script as part of CLI release checklist

---

### Pitfall 11: Random Mock Data in demo-data.ts Changes on Every Build

**What goes wrong:**
If mock data uses `Math.random()` (e.g., for usage chart values), each static export build produces different HTML. This breaks Turborepo cache (hash changes every build) and makes CI unreliable (screenshots differ between runs).

**Prevention:**
Use deterministic values, not random:
```typescript
// Bad: different every build
hourly: Array.from({ length: 24 }, (_, i) => ({
  count: Math.floor(Math.random() * 150) + 20,
})),

// Good: deterministic
hourly: Array.from({ length: 24 }, (_, i) => ({
  count: 20 + ((i * 37 + 13) % 130),  // Pseudo-random but deterministic
})),
```

Or use a seeded random function. Or just hardcode the array.

**Detection:**
Build twice, compare `out/` directory hashes. They should be identical.

---

### Pitfall 12: DemoProvider in Root Layout Makes Layout a Client Boundary

**What goes wrong:**
Adding `<DemoProvider>` (a `'use client'` component) to `app/layout.tsx` means the layout's child tree starts at a client component boundary. This does NOT prevent server components from working (they still render at build time in static export), but it may confuse developers who think the layout itself became a client component.

**Prevention:**
- The layout file (`app/layout.tsx`) does NOT need `'use client'`. Only `DemoProvider` has it.
- The `metadata` export in `layout.tsx` continues to work because the layout itself is still a server component.
- Document this in a code comment:
  ```typescript
  // DemoProvider is a 'use client' component. Importing it here does NOT
  // make the layout a client component. The metadata export still works.
  ```

**Detection:**
Verify `<title>` and `<meta>` tags exist in built HTML output.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Severity |
|-------------|---------------|------------|----------|
| Phase 1 (DemoContext) | Initial state flash (#2) | Use useState initializer to read sessionStorage synchronously | Critical |
| Phase 1 (DemoContext) | DemoProvider client boundary confusion (#12) | Comment in layout.tsx, verify metadata in output | Minor |
| Phase 2 (Hook Mods) | SWR cache collision (#5) | Namespace keys: `demo-*` vs `admin-*` | Moderate |
| Phase 2 (Hook Mods) | Mock data type drift (#7) | Use `satisfies` keyword, co-locate in single file | Moderate |
| Phase 2 (Hook Mods) | Non-deterministic mock data (#11) | Use deterministic values, not Math.random() | Minor |
| Phase 3 (Landing Page) | Server/client component type change (#1) | Full rewrite of page.tsx, not incremental edit | Critical |
| Phase 3 (Landing Page) | Accessibility: reduced motion (#6) | Check prefers-reduced-motion, provide static fallback | Moderate |
| Phase 3 (Landing Page) | Stale terminal script (#10) | External data file, CI validation | Minor |
| Phase 4 (Config Fixes) | CF API token missing KV perms (#8) | Add Workers KV Storage: Edit permission | Moderate |
| Phase 4 (Config Fixes) | Homebrew tap strands users (#3) | Deprecation formula in old tap, 3-month overlap | Critical |
| Phase 4 (Config Fixes) | PAT lacks new org access (#4) | New fine-grained PAT for progradetech | Critical |
| Phase 4 (Config Fixes) | brews + tap change = double break (#9) | Change one variable at a time | Moderate |

---

## Sources

### Cloudflare Official Documentation (HIGH confidence)
- [API Token Permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) -- Workers, KV, D1 permission names
- [workers-sdk#5649](https://github.com/cloudflare/workers-sdk/issues/5649) -- error 10023 confirmed as missing KV permission

### GoReleaser Official Documentation (HIGH confidence)
- [Homebrew Casks](https://goreleaser.com/customization/homebrew_casks/) -- repository config, token requirements
- [Deprecation Notices](https://goreleaser.com/deprecations/) -- brews deprecated in v2.10

### Homebrew Official Documentation (HIGH confidence)
- [Taps (Third-Party Repositories)](https://docs.brew.sh/Taps) -- tap naming, no cross-tap redirects
- [Homebrew Discussion #1253](https://github.com/orgs/Homebrew/discussions/1253) -- deprecating between taps

### Next.js Official Documentation (HIGH confidence)
- [Static Exports](https://nextjs.org/docs/app/guides/static-exports) -- server/client component behavior, metadata export rules
- [Metadata API](https://nextjs.org/docs/app/building-your-application/optimizing/metadata) -- metadata must be in server components

### Accessibility (HIGH confidence)
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) -- media query for motion sensitivity
- [WCAG 2.1 SC 2.3.3](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html) -- animation accessibility requirement

### Verified via Project Files (HIGH confidence)
- `apps/dashboard/src/app/page.tsx` -- confirms current 'use client' directive and useEffect redirect
- `apps/dashboard/src/components/auth-guard.tsx` -- confirms auth check runs in useEffect (async)
- `apps/dashboard/src/lib/hooks/*.ts` -- confirms SWR key patterns, inline fetchers
- `apps/dashboard/src/lib/auth.ts` -- confirms localStorage for admin token
- `.goreleaser.yaml` -- confirms `brews` section with `andrewprograde` owner
- [GitHub Fine-Grained PAT docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) -- org-scoped tokens

---
*Pitfalls research for: Feelr interactive demo, demo dashboard mode, and landing page*
*Researched: 2026-02-10*
