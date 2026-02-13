# Contributing to Feelr

Thanks for wanting to contribute to Feelr! This guide covers everything you need to get started -- from setting up the monorepo to building your own connector.

## Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/feelr.git
cd feelr

# Install dependencies
pnpm install

# Verify everything compiles
pnpm turbo typecheck
```

**Requirements:** Node.js 20+, pnpm 9+, Go 1.25+ (for CLI work)

## Project Structure

```
feelr/
  apps/
    gateway/        # Cloudflare Workers + Hono edge gateway
    dashboard/      # Next.js admin dashboard
    docs/           # Nextra documentation site (feelr.dev/docs)
  packages/
    connector-sdk/  # Shared types and utilities for connectors
    tsconfig/       # Shared TypeScript config
  connectors/
    _template/      # Starter template for new connectors
    github/         # GitHub connector
    slack/          # Slack connector
    stripe/         # Stripe connector
    discord/        # Discord connector
  cli/              # Go CLI binary
  chains/           # Pre-built composable action chains
  self-host/        # Docker-based self-hosting setup
```

## Creating a New Connector

This is the most common way to contribute. Each connector wraps an upstream API and exposes it through standardized actions that AI agents can discover and call.

### Step-by-step

1. **Copy the template:**
   ```bash
   cp -r connectors/_template connectors/your-connector
   ```

2. **Update `package.json`:**
   Change the name to `@feelr/connector-your-name` and update the description.

3. **Implement actions** in `src/actions/`:
   Each action is an `ActionDefinition` with a name, description, params, return type, and handler:

   ```typescript
   import type { ActionDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'

   export const thingsList: ActionDefinition = {
     name: 'things.list',
     description: 'Lists things with pagination. Accepts optional page and per_page params. Returns array of { id, name } objects.',
     params: [
       { name: 'page', type: 'number', required: false, description: 'Page number', default: 1 },
       { name: 'per_page', type: 'number', required: false, description: 'Items per page', default: 20 },
     ],
     returns: 'list',
     handler: async (ctx: ActionContext): Promise<ActionResult> => {
       const response = await ctx.fetch('https://api.example.com/things', {
         headers: { Authorization: `Bearer ${ctx.credential}` },
       })
       const raw = await response.json()
       return {
         data: raw.items.map((item: any) => ({ id: item.id, name: item.name })),
         meta: { has_more: raw.has_more, cursor: raw.next_cursor },
         raw,
       }
     },
   }
   ```

4. **Add tests** in `src/__tests__/`:
   See the template tests for examples of testing actions with mock contexts.

5. **Register in the gateway:**
   In `apps/gateway/src/routes/v1.ts`, import your connector and register it:
   ```typescript
   import { yourConnector } from '../connectors/your-name'
   registerConnector(yourConnector)
   ```

6. **Verify:**
   ```bash
   pnpm install
   pnpm turbo typecheck
   ```

See the [connector template README](connectors/_template/README.md) for detailed examples of list, get, and create action patterns.

### Connector Guidelines

- **Web Standard APIs only** -- use `fetch`, `URL`, `Headers`, etc. No Node.js or Cloudflare-specific bindings.
- **`@feelr/connector-sdk` is the only runtime dependency** -- no other packages.
- **Agent-optimized descriptions** -- 50-100 tokens, explain what the action does, what params it accepts, and what it returns. Agents read these to decide which action to call.
- **Flat response normalization** -- return consistent, flat JSON objects with snake_case keys. No deeply nested structures.
- **Error handling** -- use `FeelrError` from the SDK with appropriate error codes and hints.

## CLI Development

The CLI is written in Go and lives in the `cli/` directory.

```bash
cd cli

# Build
go build .

# Run tests
go test ./...

# Run the CLI
./feelr status
```

## Commit Convention

Follow conventional commits:

- `feat(scope):` -- new feature or capability
- `fix(scope):` -- bug fix
- `docs(scope):` -- documentation only
- `test(scope):` -- test additions or fixes
- `refactor(scope):` -- code cleanup, no behavior change
- `chore(scope):` -- tooling, config, dependencies

Scope is typically the connector or subsystem name: `github`, `cli`, `gateway`, `dashboard`, etc.

## Pull Requests

- Describe **what** changed and **why**
- Include test output or verification steps
- Keep PRs focused -- one feature or fix per PR
- Link related issues if applicable

## No CLA Required

Feelr is MIT-licensed. By submitting a pull request, you agree that your contribution is licensed under the same MIT license. No Contributor License Agreement to sign.

## Questions?

Open an issue or start a discussion on GitHub. We are happy to help with connector development or point you in the right direction.
