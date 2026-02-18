# Phase 29: Community Contribution Infrastructure - Research

**Researched:** 2026-02-16
**Domain:** GitHub issue/PR templates, pnpm monorepo scaffolding, CI validation workflows, Nextra v4 docs authoring, SDK compliance testing
**Confidence:** HIGH

## Summary

Phase 29 is the final phase of v1.4 (Open Core). It builds the community infrastructure that enables external contributors to discover, scaffold, develop, test, and submit connector contributions to the public `progradetech/feelr` repo. The work spans five distinct areas: (1) GitHub issue and PR templates using YAML form syntax, (2) a `pnpm create-connector` scaffolding script, (3) a connector validation CI job, (4) expanded CONTRIBUTING.md documentation, and (5) Nextra developer docs with SDK reference and tutorials.

The codebase already has a solid foundation: the `connectors/_template/` directory contains a fully working template with 3 example actions (LIST, GET, CREATE patterns), tests, and documentation. The `@feelr/connector-sdk` package exports well-defined TypeScript interfaces (`ConnectorDefinition`, `ActionDefinition`, `ActionContext`, `ActionResult`, `ParamDefinition`). All four existing connectors (GitHub/bearer_token, Slack/oauth2, Stripe/api_key, Discord/bearer_token) follow the identical pattern: single `src/index.ts` exporting a `ConnectorDefinition`, action files in `src/actions/`, tests in `src/__tests__/`, and `@feelr/connector-sdk` as the only runtime dependency. The existing CI workflow (`.github/workflows/ci.yml`) already runs lint, typecheck, and test on PRs via Turborepo's `--affected` flag.

The scaffolding script does NOT need to be an npm package or CLI binary. It should be a simple Node.js script invoked via a `pnpm create-connector` root script that copies `connectors/_template/`, performs string replacements (name, package name, export name, auth type), and runs `pnpm install`. The connector validation CI job extends the existing CI workflow with an additional job that checks connector-specific constraints: correct SDK exports, no disallowed dependencies, and test coverage. The `@feelr/connector-test-utils` package provides reusable contract tests that validate a `ConnectorDefinition` at runtime.

**Primary recommendation:** Build everything as scripts and CI steps within the existing monorepo tooling. No new external dependencies. The scaffolding is a Node.js script, the validation is a GitHub Actions job with a validation script, and the test utils are a new workspace package. Nextra docs get a new `developers/` section with three pages.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Node.js `fs/promises` + `path` | Built-in | Scaffolding script file operations | No external deps needed for copy + string replace |
| GitHub issue forms (YAML) | N/A | Structured issue templates | GitHub-native, `.github/ISSUE_TEMPLATE/*.yml` format |
| GitHub Actions | N/A | Connector validation CI job | Already used for CI/CD |
| Vitest | ~3.2.0 | Connector test utils runtime | Already used across all connectors |
| Nextra | ^4.2.0 | Developer documentation pages | Already used for docs site |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `pnpm/action-setup` | v4 | Install pnpm in CI | Already in CI workflow |
| `actions/checkout` | v4 | Checkout code in CI | Already in CI workflow |
| `dorny/paths-filter` | v3 | Path-based job triggers | Trigger connector validation only when `connectors/` changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Node.js scaffolding script | Yeoman/Plop generator | Overkill for a single template with string replacements; adds external dependency |
| Custom Node.js scaffolding script | `degit` or `giget` | Designed for remote templates, not local monorepo templates; unnecessary complexity |
| Inline validation script | Custom ESLint plugin | Too heavy for 5 simple checks; ESLint plugin ecosystem is complex to maintain |
| `@feelr/connector-test-utils` | Vitest snapshot tests | Snapshots are fragile and don't validate contracts dynamically |

**No new package installation needed** -- all tools are Node.js built-ins, already-installed workspace packages, or GitHub-provided actions.

## Architecture Patterns

### Recommended Project Structure (new files)
```
.github/
  ISSUE_TEMPLATE/
    config.yml                    # Template chooser config
    connector-request.yml         # COMM-01: Connector request form
    bug-report.yml                # COMM-01: Bug report form
    feature-request.yml           # COMM-01: Feature request form
  PULL_REQUEST_TEMPLATE.md        # COMM-02: PR template with checklist
  workflows/
    ci.yml                        # Extended: add connector-validation job
scripts/
  create-connector.mjs            # COMM-03: Scaffolding script
packages/
  connector-test-utils/           # COMM-06: SDK compliance test suite
    src/
      index.ts                    # Public API: validateConnector()
      contract-tests.ts           # ConnectorDefinition contract checks
    package.json
    tsconfig.json
connectors/
  _template/                      # Already exists, may need minor updates
CONTRIBUTING.md                   # COMM-05: Expanded with dev guide
apps/docs/app/docs/
  developers/
    _meta.ts                      # Section navigation
    sdk-reference/page.mdx        # COMM-07: SDK type reference
    your-first-connector/page.mdx # COMM-07: Tutorial
```

### Pattern 1: Scaffolding Script (create-connector.mjs)

**What:** A Node.js script that copies `connectors/_template/` to `connectors/<name>/`, performs string replacements, and registers the workspace package.

**When to use:** Invoked via `pnpm create-connector <name>` from root `package.json` scripts.

**Key design decisions:**
- Takes connector name as positional arg, auth type as `--auth` flag (default: `bearer_token`)
- Validates name: lowercase, alphanumeric + hyphens, no `_template`
- Copies entire `_template/` directory tree (excluding `node_modules/`, `.turbo/`)
- Replaces in all files: `template` -> `<name>`, `Template` -> `<PascalName>`, `@feelr/connector-template` -> `@feelr/connector-<name>`, `bearer_token` -> `<auth_type>`
- Runs `pnpm install` at the end to register the new workspace package
- Does NOT auto-register in the gateway (that's a PR review step)

**Example invocation:**
```bash
pnpm create-connector todoist --auth api_key
```

**Example script structure:**
```javascript
// scripts/create-connector.mjs
import { cp, readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const CONNECTORS_DIR = resolve(import.meta.dirname, '..', 'connectors')
const TEMPLATE_DIR = join(CONNECTORS_DIR, '_template')

// Parse args
const name = process.argv[2]
const authFlag = process.argv.indexOf('--auth')
const authType = authFlag !== -1 ? process.argv[authFlag + 1] : 'bearer_token'

// Validate
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: pnpm create-connector <name> [--auth api_key|oauth2|bearer_token|none]')
  process.exit(1)
}

// Copy template, replace strings, pnpm install
// ... (full implementation in plan)
```

### Pattern 2: Connector Validation CI Job

**What:** A GitHub Actions job that runs on PRs touching `connectors/**` and validates SDK compliance.

**When to use:** Triggers automatically on connector PRs as part of the existing CI workflow.

**Checks to perform:**
1. **SDK contract compliance:** Each connector's `src/index.ts` default/named export satisfies `ConnectorDefinition` interface (has `name`, `display_name`, `version`, `auth_type`, `actions`)
2. **Dependency restrictions:** `package.json` has only `@feelr/connector-sdk` as a runtime dependency (not devDependencies)
3. **No disallowed imports:** No `node:*` imports, no `@cloudflare/*` imports (Web Standard APIs only)
4. **Test existence:** At least one `.test.ts` file exists in `src/__tests__/`
5. **Test passing:** `vitest run` exits 0

**Implementation approach:** A validation script (`scripts/validate-connectors.mjs`) that can be run locally and in CI. The CI job calls it after the standard check job passes.

**Example CI job addition:**
```yaml
connector-validation:
  needs: check
  runs-on: ubuntu-latest
  if: contains(github.event.pull_request.changed_files, 'connectors/')
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: "pnpm"
    - run: pnpm install --frozen-lockfile
    - name: Validate connector compliance
      run: node scripts/validate-connectors.mjs --changed
```

### Pattern 3: Connector Test Utils Package

**What:** A workspace package `@feelr/connector-test-utils` that exports a `validateConnector()` function running contract tests against any `ConnectorDefinition`.

**When to use:** Imported in connector test files to auto-generate SDK compliance tests.

**Example usage in a connector's test file:**
```typescript
import { validateConnector } from '@feelr/connector-test-utils'
import { myConnector } from '../index'

// Auto-generates contract tests for the connector
validateConnector(myConnector)

// Connector-specific tests below...
describe('my-connector specific tests', () => { ... })
```

**What validateConnector() checks:**
- `name` is lowercase, alphanumeric + hyphens
- `display_name` is non-empty string
- `version` matches semver pattern
- `auth_type` is one of the valid enum values
- `actions` is non-empty and each action has required fields
- Each action's `params` array has valid `ParamDefinition` entries
- Each action's `handler` is a function
- Each action's `description` is 10-200 characters
- Each action's `name` uses dot notation (e.g., `items.list`)
- For `returns: 'list'` actions, handler returns array `data`
- For `returns: 'single'` actions, handler returns object `data`

### Pattern 4: GitHub Issue Form Templates

**What:** YAML-based structured forms for connector requests, bug reports, and feature requests.

**Key design for connector-request.yml:**
```yaml
name: Connector Request
description: Request a new connector for an API service
title: "[connector]: "
labels: ["connector-request", "good first issue"]
body:
  - type: input
    id: api-name
    attributes:
      label: API Service Name
      placeholder: "e.g., Todoist, OpenWeatherMap, Linear"
    validations:
      required: true
  - type: input
    id: api-docs
    attributes:
      label: API Documentation URL
      placeholder: "https://developer.example.com/docs"
    validations:
      required: true
  - type: dropdown
    id: auth-type
    attributes:
      label: Authentication Type
      options:
        - API Key
        - OAuth 2.0
        - Bearer Token
        - None / Public API
    validations:
      required: true
  - type: textarea
    id: use-cases
    attributes:
      label: Use Cases
      description: What actions would be most useful?
      placeholder: "e.g., List tasks, Create tasks, Get project details"
    validations:
      required: true
```

### Pattern 5: Nextra Developer Docs Section

**What:** New `developers/` section in the Nextra docs with SDK reference and tutorial.

**Structure:**
- `apps/docs/app/docs/developers/_meta.ts` -- section navigation
- `apps/docs/app/docs/developers/sdk-reference/page.mdx` -- complete SDK type reference
- `apps/docs/app/docs/developers/your-first-connector/page.mdx` -- step-by-step tutorial

**Meta configuration:**
```typescript
// apps/docs/app/docs/_meta.ts (updated)
export default {
  'getting-started-api': 'Quick Start (API)',
  'getting-started-cli': 'Quick Start (CLI)',
  auth: 'Authentication',
  connectors: 'Connectors',
  developers: 'Developers',       // NEW
  'cli-reference': 'CLI Reference',
  '-- Self-Hosting': {
    title: 'Self-Hosting',
    href: 'https://github.com/progradetech/feelr/tree/main/self-host',
  },
}
```

### Anti-Patterns to Avoid
- **Overengineering the scaffolding tool:** Do NOT use Yeoman, Plop, or `create-*` npm packages. A 100-line Node.js script with `fs.cp()` + string replace is sufficient and has zero dependencies.
- **Blocking CI on coverage thresholds:** Do NOT enforce a specific coverage percentage. Require tests to EXIST and PASS, not a coverage number. Contributors will abandon PRs if coverage gates are arbitrary.
- **Auto-registering connectors in the gateway:** The scaffolding script should NOT modify `apps/gateway/src/routes/v1.ts`. That's a review-time decision and must be done manually to prevent accidental registration of incomplete connectors.
- **Creating a separate connector-validation CI workflow:** Extend the existing `ci.yml` with a conditional job, don't create a new workflow file. Keeps the CI pipeline unified.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Issue templates | Custom issue creation UI | GitHub YAML issue forms | Native, maintained by GitHub, auto-renders structured forms |
| Directory copying | Custom recursive copy | `fs.cp()` with `recursive: true` | Node.js 20+ built-in, handles symlinks and permissions correctly |
| PR file change detection | Custom git diff parsing | `dorny/paths-filter` or `github.event.pull_request` | Battle-tested GitHub Action, handles merge commits correctly |
| Type validation at runtime | Hand-written type checks | Simple property existence checks | Full Zod/AJV validation is overkill for CI checks; TypeScript already validates at build time |

**Key insight:** This phase is mostly content creation (templates, docs, guides) with two small scripts (scaffolding + validation). Resist the urge to build frameworks. The existing codebase patterns are excellent -- just automate and document them.

## Common Pitfalls

### Pitfall 1: Scaffolding Script Doesn't Update pnpm-workspace.yaml
**What goes wrong:** The new connector directory is created but pnpm doesn't recognize it as a workspace package, so `pnpm install` doesn't link it.
**Why it happens:** `pnpm-workspace.yaml` uses `connectors/*` glob, which should auto-include new directories. BUT if the glob doesn't match (e.g., nested differently), pnpm silently ignores the package.
**How to avoid:** The existing `pnpm-workspace.yaml` already includes `connectors/*` glob. Verify the scaffolded connector lands directly under `connectors/<name>/` (not nested deeper). Run `pnpm install` after scaffolding to confirm workspace linkage.
**Warning signs:** `pnpm install` doesn't show the new package being linked. `pnpm --filter @feelr/connector-<name> test` says package not found.

### Pitfall 2: Validation Script Breaks on Template Connector
**What goes wrong:** The validation script runs against `connectors/_template/` and fails because template has mock data / placeholder exports.
**Why it happens:** Glob `connectors/*` matches `_template` too.
**How to avoid:** Exclude `_template` directory explicitly in the validation script. Check for directory names starting with `_`.
**Warning signs:** CI fails on unmodified main branch.

### Pitfall 3: Issue Form Labels Don't Exist Yet
**What goes wrong:** Issue forms reference labels like `connector-request` or `good-first-issue` that don't exist in the repo, and GitHub silently drops them.
**Why it happens:** GitHub issue form `labels` field requires pre-existing labels. If the label doesn't exist, GitHub ignores it (doesn't error).
**How to avoid:** Create labels FIRST using GitHub CLI or API before merging issue templates. Include label creation in the plan as a prerequisite step.
**Warning signs:** New issues don't have the expected labels assigned.

### Pitfall 4: Nextra v4 _meta.ts Key Order Matters
**What goes wrong:** New `developers` section appears in wrong position in sidebar navigation.
**Why it happens:** Nextra v4 uses `_meta.ts` export key order to determine sidebar/navbar ordering. JavaScript object key order is insertion order for string keys.
**How to avoid:** Insert the `developers` key in the correct position within the `_meta.ts` export (between `connectors` and `cli-reference`).
**Warning signs:** Sidebar navigation shows sections in unexpected order.

### Pitfall 5: Template String Replacement Clobbers Binary or Non-Text Files
**What goes wrong:** The scaffolding script tries to string-replace in binary files or `.turbo/` cache files.
**Why it happens:** Naive recursive file processing doesn't skip non-text files.
**How to avoid:** Only process `.ts`, `.json`, `.md` files. Skip `node_modules/`, `.turbo/`, and any dot-directories. Use `fs.cp()` first (without replacement), then only replace in known text file extensions.
**Warning signs:** Corrupted files after scaffolding, TypeScript compile errors.

### Pitfall 6: PR Template Too Long Discourages Contributors
**What goes wrong:** Contributors delete the template contents or skip filling it out.
**Why it happens:** Template has too many sections or checkboxes that feel bureaucratic.
**How to avoid:** Keep the PR template SHORT. For connector PRs: summary, checklist (4-5 items max), testing notes. For non-connector PRs: even simpler.
**Warning signs:** PRs come in with empty template sections.

## Code Examples

### Example 1: Scaffolding Script Core Logic
```javascript
// scripts/create-connector.mjs
import { cp, readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const CONNECTORS_DIR = join(ROOT, 'connectors')
const TEMPLATE_DIR = join(CONNECTORS_DIR, '_template')

const VALID_AUTH_TYPES = ['api_key', 'oauth2', 'bearer_token', 'none']
const REPLACEABLE_EXTENSIONS = new Set(['.ts', '.json', '.md'])
const SKIP_DIRS = new Set(['node_modules', '.turbo', '.git'])

function toPascalCase(str) {
  return str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

async function replaceInFile(filePath, replacements) {
  if (!REPLACEABLE_EXTENSIONS.has(extname(filePath))) return
  let content = await readFile(filePath, 'utf-8')
  for (const [search, replace] of replacements) {
    content = content.replaceAll(search, replace)
  }
  await writeFile(filePath, content)
}

async function processDir(dir, replacements) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await processDir(fullPath, replacements)
    } else {
      await replaceInFile(fullPath, replacements)
    }
  }
}

// Main
const name = process.argv[2]
const authIdx = process.argv.indexOf('--auth')
const authType = authIdx !== -1 ? process.argv[authIdx + 1] : 'bearer_token'

if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: pnpm create-connector <name> [--auth api_key|oauth2|bearer_token|none]')
  process.exit(1)
}
if (!VALID_AUTH_TYPES.includes(authType)) {
  console.error(`Invalid auth type: ${authType}. Must be one of: ${VALID_AUTH_TYPES.join(', ')}`)
  process.exit(1)
}

const targetDir = join(CONNECTORS_DIR, name)
const pascal = toPascalCase(name)

// Copy template
await cp(TEMPLATE_DIR, targetDir, {
  recursive: true,
  filter: (src) => !SKIP_DIRS.has(src.split('/').pop()),
})

// Replace strings
const replacements = [
  ['@feelr/connector-template', `@feelr/connector-${name}`],
  ['templateConnector', `${pascal.charAt(0).toLowerCase() + pascal.slice(1)}Connector`],
  ['Template Connector', `${pascal} Connector`],
  ["name: 'template'", `name: '${name}'`],
  ["auth_type: 'bearer_token'", `auth_type: '${authType}'`],
]

await processDir(targetDir, replacements)

console.log(`Created connector at connectors/${name}/`)
console.log('Running pnpm install...')
execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' })
console.log(`\nNext steps:`)
console.log(`  1. cd connectors/${name}`)
console.log(`  2. Edit src/actions/ to implement your API calls`)
console.log(`  3. Update tests in src/__tests__/`)
console.log(`  4. Run: pnpm --filter @feelr/connector-${name} test`)
```

### Example 2: Connector Validation Script
```javascript
// scripts/validate-connectors.mjs
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CONNECTORS_DIR = join(ROOT, 'connectors')
const SKIP = new Set(['_template'])

const VALID_AUTH_TYPES = ['api_key', 'oauth2', 'bearer_token', 'none']
const DISALLOWED_IMPORT_PATTERNS = [/from ['"]node:/, /from ['"]@cloudflare\//]

async function validateConnector(connectorDir, name) {
  const errors = []

  // 1. Check package.json dependencies
  const pkg = JSON.parse(await readFile(join(connectorDir, 'package.json'), 'utf-8'))
  const deps = Object.keys(pkg.dependencies || {})
  const nonSdkDeps = deps.filter(d => d !== '@feelr/connector-sdk')
  if (nonSdkDeps.length > 0) {
    errors.push(`Disallowed runtime dependencies: ${nonSdkDeps.join(', ')}. Only @feelr/connector-sdk is allowed.`)
  }

  // 2. Check for disallowed imports in source files
  // ... scan .ts files for node: and @cloudflare imports

  // 3. Check test files exist
  // ... verify src/__tests__/*.test.ts exists

  return errors
}
```

### Example 3: Connector Test Utils validateConnector()
```typescript
// packages/connector-test-utils/src/index.ts
import { describe, it, expect } from 'vitest'
import type { ConnectorDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'

export function validateConnector(connector: ConnectorDefinition): void {
  describe(`SDK Contract: ${connector.name}`, () => {
    it('has a valid name (lowercase, alphanumeric + hyphens)', () => {
      expect(connector.name).toMatch(/^[a-z][a-z0-9-]*$/)
    })

    it('has a non-empty display_name', () => {
      expect(connector.display_name.length).toBeGreaterThan(0)
    })

    it('has a valid semver version', () => {
      expect(connector.version).toMatch(/^\d+\.\d+\.\d+/)
    })

    it('has a valid auth_type', () => {
      expect(['api_key', 'oauth2', 'bearer_token', 'none']).toContain(connector.auth_type)
    })

    it('has at least one action', () => {
      expect(Object.keys(connector.actions).length).toBeGreaterThan(0)
    })

    describe('actions', () => {
      for (const [actionName, action] of Object.entries(connector.actions)) {
        describe(actionName, () => {
          it('has a dot-notation name', () => {
            expect(action.name).toContain('.')
          })

          it('has a description between 10 and 300 characters', () => {
            expect(action.description.length).toBeGreaterThanOrEqual(10)
            expect(action.description.length).toBeLessThanOrEqual(300)
          })

          it('has a valid returns type', () => {
            expect(['list', 'single']).toContain(action.returns)
          })

          it('has a handler function', () => {
            expect(typeof action.handler).toBe('function')
          })

          it('has valid param definitions', () => {
            for (const param of action.params) {
              expect(param.name).toBeTruthy()
              expect(['string', 'number', 'boolean']).toContain(param.type)
              expect(typeof param.required).toBe('boolean')
              expect(param.description).toBeTruthy()
            }
          })
        })
      }
    })
  })
}
```

### Example 4: GitHub Issue Form (connector-request.yml)
```yaml
name: Connector Request
description: Request support for a new API service
title: "[connector]: "
labels: ["connector-request"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for suggesting a new connector! Before submitting, please check
        [existing connector requests](https://github.com/progradetech/feelr/labels/connector-request)
        to avoid duplicates.
  - type: input
    id: api-name
    attributes:
      label: API Service Name
      description: The name of the API you want to connect to
      placeholder: "e.g., Todoist, OpenWeatherMap, Linear"
    validations:
      required: true
  - type: input
    id: api-docs-url
    attributes:
      label: API Documentation URL
      description: Link to the official API docs
      placeholder: "https://developer.example.com/docs"
    validations:
      required: true
  - type: dropdown
    id: auth-type
    attributes:
      label: Authentication Type
      description: How does the API authenticate requests?
      options:
        - API Key (header or query param)
        - OAuth 2.0
        - Bearer Token / Personal Access Token
        - No authentication (public API)
    validations:
      required: true
  - type: textarea
    id: actions
    attributes:
      label: Suggested Actions
      description: What actions would be most useful? Use dot notation.
      placeholder: |
        - tasks.list - List all tasks with pagination
        - tasks.create - Create a new task
        - projects.list - List projects
    validations:
      required: true
  - type: textarea
    id: context
    attributes:
      label: Additional Context
      description: Why is this connector useful? Any implementation notes?
    validations:
      required: false
```

### Example 5: PR Template with SDK Checklist
```markdown
## Summary

<!-- What does this PR do? Link to related issue if applicable. -->

## Type of Change

- [ ] New connector
- [ ] Connector enhancement (new actions)
- [ ] Bug fix
- [ ] Documentation
- [ ] Other: ___

## Connector SDK Compliance (for connector PRs)

- [ ] Only runtime dependency is `@feelr/connector-sdk`
- [ ] All actions use Web Standard APIs only (fetch, URL, Headers -- no node: or @cloudflare imports)
- [ ] Action descriptions are 50-100 tokens and agent-optimized
- [ ] Response data uses flat JSON with snake_case keys
- [ ] Tests exist in `src/__tests__/` and pass (`pnpm test`)
- [ ] Error handling uses `FeelrError` from the SDK

## Testing

<!-- How was this tested? Include test output if helpful. -->
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitHub issue templates (`.md`) | GitHub issue forms (`.yml`) | 2022 | Structured data collection, required fields, dropdowns |
| Manual `cp -r` connector creation | Scaffolding scripts | Standard practice | Consistent setup, fewer typos, faster onboarding |
| Manual code review for SDK compliance | Automated CI validation | Standard practice | Catches issues before review, faster feedback loop |
| Nextra v3 (`pages/` router) | Nextra v4 (`app/` router) | 2024 | Uses `_meta.ts` instead of `_meta.json`, co-located with `page.mdx` files |

**Deprecated/outdated:**
- GitHub `.md` issue templates: Still supported but `.yml` issue forms are preferred for structured input
- Nextra v3 `_meta.json`: Replaced by `_meta.ts` (or `.js`/`.jsx`/`.tsx`) in Nextra v4

## Open Questions

1. **Should the scaffolding script prompt interactively or use flags only?**
   - What we know: The success criteria says `pnpm create-connector <name>`, suggesting positional args. Interactive prompts are friendlier but harder to script/automate.
   - What's unclear: Whether the user expects interactive prompts (e.g., "Select auth type: [1] API Key [2] OAuth2...")
   - Recommendation: Use flags only (`--auth`). This is more unix-like, scriptable, and consistent with the CLI-first philosophy. Print a helpful usage message if args are wrong.

2. **Should `@feelr/connector-test-utils` be a devDependency of each connector?**
   - What we know: COMM-06 says "auto-generates SDK contract tests." The template would need to include it.
   - What's unclear: Whether it should be pre-included in the template or added manually.
   - Recommendation: Include as a devDependency in the `_template/package.json` so every scaffolded connector gets it automatically. This ensures compliance tests run for all connectors.

3. **How should the CI detect "changed connectors" vs running on all connectors?**
   - What we know: The existing CI uses `turbo run --affected` which handles this for build/test/typecheck. The validation script needs to know which connectors to validate.
   - What's unclear: Whether to validate ALL connectors or only changed ones.
   - Recommendation: Validate only changed connectors in CI (using `git diff --name-only` to detect changed paths under `connectors/`). Provide a `--all` flag for local use.

4. **Where do the "good first issue" connector requests get created?**
   - What we know: COMM-08 says pre-seed 3-5 requests (Todoist, OpenWeatherMap, etc.). These need to be actual GitHub issues in the public repo.
   - What's unclear: Whether to create them via `gh issue create` in CI or manually after merge.
   - Recommendation: Create them via `gh issue create` as the final step, after issue templates are merged. This ensures they use the new structured form.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- `connectors/_template/`, `packages/connector-sdk/`, existing connectors (github, slack, stripe, discord), CI workflows, docs structure -- all read directly
- [GitHub Docs: Syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) -- YAML form schema, element types, validations
- [GitHub Docs: Form schema syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema) -- Element types: markdown, textarea, input, dropdown, checkboxes
- [GitHub Docs: Configuring issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository) -- config.yml, blank_issues_enabled, contact_links
- [GitHub Docs: Creating PR templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository) -- `.github/PULL_REQUEST_TEMPLATE.md` location
- [Nextra v4 _meta file docs](https://nextra.site/docs/file-conventions/meta-file) -- MetaRecord type, section configuration, sidebar ordering

### Secondary (MEDIUM confidence)
- [Nextra 4 x App Router migration guide](https://the-guild.dev/blog/nextra-4) -- Nextra v4 uses app router, `_meta.ts` files
- [pnpm workspaces docs](https://pnpm.io/workspaces) -- Workspace package auto-discovery via globs

### Tertiary (LOW confidence)
- None -- all critical claims verified against primary sources or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new external dependencies, all built-in or already in the project
- Architecture: HIGH -- patterns derived directly from existing codebase (4 connectors, template, CI workflow, docs)
- Pitfalls: HIGH -- identified from direct codebase inspection and official GitHub docs
- Scaffolding script: HIGH -- straightforward Node.js fs operations, verified `pnpm-workspace.yaml` already includes `connectors/*`
- Issue form syntax: HIGH -- verified against official GitHub docs
- Nextra docs structure: HIGH -- verified against existing `apps/docs/app/docs/` structure and `_meta.ts` files

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain -- GitHub templates, Node.js fs, pnpm workspaces are mature and slow-moving)
