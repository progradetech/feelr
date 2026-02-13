# Feature Landscape: Open-Core Community Contribution Features

**Domain:** Open-core repository restructuring -- community contribution infrastructure
**Researched:** 2026-02-13

## Table Stakes

Features contributors expect when a project invites community participation. Missing any of these signals "we don't actually want contributions."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Connector scaffolding CLI command | Every mature connector ecosystem (Airbyte CDK, n8n node CLI, Activepieces SDK) provides a scaffold tool. Without one, contributors must manually copy the template directory, rename files, update package.json, and wire imports -- error-prone and discouraging. | Medium | Implement as `pnpm create-connector <name>` or a Turbo generator. Reads `connectors/_template/`, prompts for name/display_name/auth_type, outputs ready-to-develop connector. Dependency: existing `_template` directory. |
| Connector validation CI job | Airbyte runs 6 categories of automated QA checks. n8n requires `npx @n8n/scan-community-package`. Contributors need immediate, automated feedback that their connector meets SDK contract requirements. Manual review of structural compliance wastes maintainer time. | Medium | GitHub Action that runs on PRs touching `connectors/*/`. Validates: exports a `ConnectorDefinition`, all actions have required fields (name, description, params, returns, handler), only imports from `@feelr/connector-sdk`, no disallowed dependencies, tests exist and pass. Dependency: connector SDK types. |
| PR template for connector contributions | Contributors need a structured checklist to self-verify completeness before requesting review. Without it, PRs arrive missing tests, docs, or proper registration -- creating review ping-pong. | Low | `.github/PULL_REQUEST_TEMPLATE/connector.md` with checklist: SDK-only dependency, Web Standard APIs only, tests covering list/get/create patterns, agent-optimized descriptions (50-100 tokens), flat response normalization. |
| Issue templates (connector request + bug report) | Standard open-source practice. A "Connector Request" template lets the community vote on which APIs to integrate next, preventing duplicate work. Contributors need a way to signal intent before building. | Low | `.github/ISSUE_TEMPLATE/connector-request.yml` (YAML form with API name, auth type, key endpoints, volunteer checkbox), `bug-report.yml`, `feature-request.yml`, plus `config.yml` chooser. |
| Connector contribution guide (expanded CONTRIBUTING.md) | The existing CONTRIBUTING.md covers basics but lacks the depth contributors need: architecture decisions behind the SDK constraints, complete worked examples for each auth type (bearer_token, oauth2, api_key), response normalization rules, and the testing contract. Airbyte has a full "Contribute a New Connector" guide; Activepieces has step-by-step tutorials. | Medium | Expand existing `CONTRIBUTING.md` or create `docs/contributing/connectors.md` in the docs site. Cover: architecture context (why Web Standard APIs only, why single dependency), auth type guide with examples for each of the 4 types, testing patterns (mock context, error scenarios, pagination), response normalization rules (flat JSON, snake_case, consistent envelope), and the review criteria checklist. Dependency: existing docs site (Nextra). |
| "Good first issue" connector labels | Research shows labeling ~25% of issues as GFI increases new contributor onboarding by 13%. For connector projects specifically, identifying simple APIs (key-based auth, few endpoints, well-documented upstream) as GFI lowers the barrier to first contribution. | Low | Label taxonomy: `good-first-issue`, `connector:new`, `connector:enhancement`, `help-wanted`. Pre-seed 3-5 GFI connector requests for well-documented APIs (e.g., Todoist, OpenWeatherMap, JSONPlaceholder). |
| Affected-only CI for connector PRs | The existing CI runs `pnpm turbo run lint typecheck test --affected` which already handles this via Turborepo. But connector PRs from forks need explicit verification that they only modify files within their connector directory (no gateway changes, no SDK changes without separate review). | Low | Add a path-scoping check in CI: if PR touches `connectors/<name>/` only, run fast path (lint + typecheck + test for that connector). If PR touches `apps/gateway/` or `packages/`, require maintainer review label before merging. Dependency: existing CI workflow. |
| Developer documentation site section | Contributors need a dedicated "Build a Connector" section in the docs site, not just a CONTRIBUTING.md. Backstage, Airbyte, and n8n all have full developer portals with SDK reference, tutorials, and API docs. Feelr already has a Nextra docs site -- this is about adding content, not infrastructure. | Medium | New section in `apps/docs/`: SDK API reference (auto-generated from TypeScript types or manual), "Your First Connector" tutorial (step-by-step with a real API), Auth Type Guide (patterns for each auth_type), Testing Guide, and Submission Checklist. Dependency: existing Nextra docs site. |

## Differentiators

Features that go beyond baseline expectations and make Feelr's contributor experience stand out. Not every open-core project has these.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Connector compliance test suite (`@feelr/connector-test-utils`) | A shared test utility package that connector authors import to validate their connector against the full SDK contract. Think Airbyte's `connectors test` but as a single `vitest` import. Validates: response envelope shape, pagination contract, error handling, param validation, credential usage, and Web Standard API compliance. Contributors run `pnpm test` and get pass/fail on SDK compliance without reading docs. | High | New package `packages/connector-test-utils/`. Exports `testConnector(definition)` that auto-generates test cases from the ConnectorDefinition. Tests: all actions callable, response matches `ActionResult` shape, `meta` fields present for list actions, `raw` included, no Node.js globals used. Dependency: connector SDK types, Vitest. |
| Connector catalog page (auto-discovered) | A page on the docs site or dashboard that lists all available connectors with their actions, params, and descriptions -- auto-generated from the connector registry. Contributors see their connector appear immediately after merge. Agents can discover capabilities programmatically. | Medium | Build script reads all `connectors/*/src/index.ts`, extracts ConnectorDefinition metadata, generates a JSON catalog file. Docs site renders it. Alternative: gateway already has `listConnectors()` -- expose as `/v1/connectors` discovery endpoint. Dependency: connector registry. |
| Connector sandbox environment | Allow contributors to test their connector against the real gateway without deploying to production. A local development setup that runs the gateway with hot-reloading and the contributor's connector loaded. | Medium | `pnpm dev` already likely exists for local development. Formalize it: `pnpm dev:connector <name>` starts the gateway with only the specified connector loaded, plus a test UI or curl examples. Dependency: gateway local dev setup (wrangler dev or miniflare). |
| Automated changelog for connector releases | When a connector PR merges, auto-generate a changelog entry. Hono's middleware repo uses changesets for this -- each middleware has its own version and changelog. | Low | Adopt changesets (`@changesets/cli`). Connector PRs must include a changeset file describing what changed. CI enforces changeset presence. On merge, changesets bot creates a release PR. Dependency: none (new tooling). |
| Reviewdog integration for connector-specific linting | Beyond standard ESLint, run connector-specific checks (description token count, param naming convention, auth_type validity) and post inline PR comments on violations. Reviewdog supports custom formatters, so a Feelr-specific linter can post results as GitHub PR review comments. | Medium | Custom lint script (`scripts/lint-connector.mjs`) that validates connector-specific rules. Integrate with reviewdog GitHub Action to post inline comments. Rules: description length (50-100 tokens), param names are snake_case, action names use dot notation, no external imports beyond SDK. Dependency: reviewdog action. |
| Connector compatibility matrix | Automated testing that verifies connectors work across multiple runtime environments (Cloudflare Workers, Node.js, Deno) since the SDK uses Web Standard APIs. This proves the self-hosting story works. | High | Test each connector in multiple runtimes via CI matrix. Workers runtime via miniflare, Node.js via vitest, optionally Deno. Validates the "Web Standard APIs only" constraint actually holds. Dependency: connector test utils, miniflare. |
| Interactive connector playground in docs | An embedded playground in the docs site where potential contributors can see a connector's actions, try them with sample data, and understand the input/output contract before writing code. | High | Requires a docs-embedded API client or mock execution environment. Defer unless the docs site already supports interactive components. Dependency: docs site capabilities, mock execution context. |

## Anti-Features

Features to explicitly NOT build during the open-core restructuring.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| CLA (Contributor License Agreement) | The existing CONTRIBUTING.md already states "No CLA Required" and uses MIT license. CLAs add friction, discourage drive-by contributions, and are unnecessary when the project is MIT-licensed. The DCO (Developer Certificate of Origin) is lighter but still adds commit signing friction for a project at this stage. | Keep the current "By submitting a PR, you agree to MIT license" statement. Revisit only if the project needs to relicense or dual-license in the future. |
| npm-published connector packages | n8n publishes community nodes to npm as separate packages. This adds package management overhead, versioning complexity, and a distribution channel separate from the monorepo. Feelr connectors are in-process modules registered at build time, not runtime-installed plugins. | Keep connectors as monorepo workspace packages (`@feelr/connector-*`). They are built and bundled with the gateway. No separate npm publishing needed. The monorepo IS the distribution mechanism. |
| Runtime connector loading / plugin system | A dynamic plugin system where connectors are loaded at runtime from npm or a directory would enable users to install connectors without rebuilding. But this adds security risks (arbitrary code execution), complexity (dependency resolution, version conflicts), and defeats the type-safety of the current approach. | Keep the current compile-time registration pattern (`registerConnector()` in gateway routes). Self-hosters rebuild with their desired connectors included. The build step IS the security boundary. |
| Connector marketplace with ratings/reviews | Over-engineering for a project with 4 connectors. Marketplaces need critical mass (~50+ connectors) to justify the infrastructure. Building a marketplace now would be building for a problem that does not yet exist. | Use the GitHub repo's connector directory as the de facto catalog. Use GitHub stars, issue activity, and the auto-generated catalog page for discoverability. Revisit at 30+ community connectors. |
| Automated connector approval (merge without review) | Some projects auto-merge PRs that pass all CI checks. For connectors that handle user credentials and make API calls, human review is essential. A malicious connector could exfiltrate credentials or make unauthorized API calls. | Require at least one maintainer approval for all connector PRs. CI gates catch structural issues; humans catch intent issues. |
| Separate "community" vs "official" connector tiers | Airbyte has "certified" vs "community" connectors with different support levels. This makes sense at scale (700+ connectors) but creates a two-class system that discourages contributions early on. | All merged connectors are equal. Quality is enforced at merge time through CI checks and review. If quality diverges later (30+ connectors), consider adding a "maintained-by" field to ConnectorDefinition metadata. |
| Connector versioning independent of gateway | Each connector having its own semver independent of the gateway release creates a combinatorial testing nightmare and confuses users about compatibility. | Connectors version with the monorepo. A single release includes all connectors at compatible versions. The `version` field in ConnectorDefinition tracks the connector's API coverage, not its release version. |
| GraphQL or gRPC connector SDK | The current SDK uses simple TypeScript interfaces and `fetch`. Adding GraphQL or gRPC support adds complexity without benefit -- connectors wrap REST APIs and the gateway serves REST responses. | Keep the SDK as TypeScript interfaces + Web Standard `fetch`. If a connector needs to call a GraphQL upstream, it uses `fetch` with a POST body -- no special SDK support needed. |

## Feature Dependencies

```
Connector scaffolding CLI
  --> Depends on: existing _template directory, pnpm workspace setup
  --> Enables: faster connector development, consistent structure

Connector validation CI job
  --> Depends on: connector SDK types (ConnectorDefinition interface)
  --> Enables: automated quality gates, maintainer time savings
  --> Blocked by: nothing (can be built from existing types)

Connector compliance test suite (@feelr/connector-test-utils)
  --> Depends on: connector SDK types, Vitest
  --> Enables: self-service validation, connector validation CI job (enhanced)
  --> Feeds into: connector validation CI job

PR template + Issue templates
  --> Depends on: nothing
  --> Enables: structured contribution flow

Expanded contribution guide
  --> Depends on: existing docs site (Nextra), all auth types documented
  --> Enables: self-service connector development

Developer documentation site section
  --> Depends on: existing docs site (Nextra)
  --> Enables: SDK API reference, tutorials
  --> Blocked by: nothing (content, not infrastructure)

Connector catalog page
  --> Depends on: connector registry (already exists), docs site
  --> Enables: discoverability

Connector sandbox environment
  --> Depends on: gateway local dev setup (wrangler dev)
  --> Enables: local testing without deployment

Changesets adoption
  --> Depends on: nothing (new tooling)
  --> Enables: automated changelog, version management

Reviewdog integration
  --> Depends on: custom lint rules, CI workflow
  --> Enables: inline PR feedback
```

## MVP Recommendation

Prioritize these in this order -- each builds on the previous:

1. **Issue templates** (connector request, bug report, feature request) -- zero-code change, enables community signaling immediately. Create the templates, pre-seed 3-5 connector request issues for well-known APIs (Todoist, Linear, Notion, Jira, OpenWeatherMap) tagged `good-first-issue`.

2. **PR template for connector contributions** -- zero-code change, structures every future connector PR. Include the SDK compliance checklist directly in the template.

3. **Connector scaffolding CLI** (`pnpm create-connector <name>`) -- the single highest-impact developer experience improvement. Eliminates the most common source of structural errors (wrong package.json name, missing test file, incorrect import paths). Every connector ecosystem leader (Airbyte, n8n, Activepieces) has this.

4. **Connector validation CI job** -- the automated quality gate. Runs on every PR touching `connectors/*/`. Validates SDK contract compliance, dependency restrictions, and test existence. This is the feature that lets maintainers scale review without burning out.

5. **Expanded contribution guide with developer docs section** -- the self-service documentation. Covers all 4 auth types with worked examples, testing patterns, response normalization rules, and the review criteria. Goes in the docs site (Nextra) for discoverability.

6. **Connector compliance test suite** (`@feelr/connector-test-utils`) -- the "gold standard" differentiator. Contributors import a single function, run tests, and know their connector is SDK-compliant before submitting a PR. Reduces review cycles significantly.

Defer:
- **Connector catalog page**: Valuable but not blocking contributions. Build when there are 6+ connectors to catalog.
- **Changesets adoption**: Useful for changelog automation but adds contributor friction (must run `yarn changeset`). Adopt when release cadence demands it.
- **Reviewdog integration**: Nice-to-have inline comments, but the validation CI job covers the same ground with pass/fail output. Add when the custom lint rules are mature.
- **Connector compatibility matrix**: Important for the self-hosting story but not for community contributions. Build during the self-hosting phase.
- **Interactive connector playground**: High complexity, low urgency. The sandbox environment (local dev) serves the same need for contributors.

## Sources

- [Airbyte: Contribute a New Connector](https://docs.airbyte.com/platform/contributing-to-airbyte/submit-new-connector) -- two-track submission process (Builder vs CDK), pre-submission discussion requirement, QA checks [HIGH confidence]
- [Airbyte: Connector QA Checks](https://docs.airbyte.com/platform/contributing-to-airbyte/resources/qa-checks) -- 6 categories of automated validation (docs, metadata, packaging, assets, security, versioning) [HIGH confidence]
- [n8n: Submit Community Nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/) -- npm-first distribution, verification guidelines, n8n-node CLI tool [HIGH confidence]
- [n8n: Community Node Verification Guidelines](https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/) -- MIT license required, no runtime dependencies, TypeScript required, English only, linter must pass [HIGH confidence]
- [Activepieces: Contribute](https://www.activepieces.com/docs/developers/sharing-pieces/contribute) -- three sharing methods, 60% community-contributed pieces, TypeScript SDK [MEDIUM confidence]
- [Hono Middleware Monorepo](https://github.com/honojs/middleware) -- third-party middleware contribution model, proposal-then-maintain pattern, changesets for versioning, Vitest for testing [HIGH confidence]
- [CNCF: Outlining Open Source Project Structure](https://www.cncf.io/blog/2023/04/03/outlining-the-structure-of-your-open-source-software-project/) -- core/contrib split as commitment level, not developer class [MEDIUM confidence]
- [Reviewdog](https://github.com/reviewdog/reviewdog) -- automated code review tool, inline PR comments, supports custom formatters [HIGH confidence]
- [CLA Assistant](https://cla-assistant.io/) / [DCO App](https://github.com/dcoapp/app) -- CLA vs DCO tradeoffs, DCO requires per-commit signing, CLA is once-per-developer [MEDIUM confidence]
- [GitHub: Issue and PR Templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository) -- YAML form templates, config.yml chooser [HIGH confidence]
- [Turborepo: GitHub Actions with --affected](https://turborepo.dev/docs/guides/ci-vendors/github-actions) -- affected package detection, fetch-depth: 0 requirement [HIGH confidence]
- [splitsh/lite](https://github.com/splitsh/lite) -- git subtree splitting tool for monorepo-to-public-repo sync [MEDIUM confidence]
- Existing Feelr codebase analysis: connector SDK types, template directory, CI workflow, CONTRIBUTING.md, gateway registry [HIGH confidence]
