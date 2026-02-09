/**
 * Feelr Connector Template
 *
 * How to create a new connector:
 *
 * 1. Copy this directory to connectors/your-connector-name/
 * 2. Update package.json "name" to "@feelr/connector-your-name"
 * 3. Update the ConnectorDefinition fields below (name, display_name, auth_type)
 * 4. Implement actions in src/actions/ directory (one file per action or group)
 * 5. Import and register actions in this file's actions map
 * 6. Register in apps/gateway/src/routes/v1.ts:
 *      import { yourConnector } from '../connectors/your-name'
 *      registerConnector(yourConnector)
 * 7. Run `pnpm install` from the monorepo root to register the workspace package
 * 8. Run `pnpm turbo typecheck` to verify everything compiles
 *
 * Rules:
 * - Only use Web Standard APIs (fetch, URL, Headers, etc.) -- no Cloudflare bindings
 * - Only depend on @feelr/connector-sdk -- no other runtime dependencies
 * - For larger connectors, split actions into separate files in src/actions/
 * - Write agent-optimized descriptions (50-100 tokens) for each action
 */

import type { ConnectorDefinition } from '@feelr/connector-sdk'

import { itemsList } from './actions/items'
import { itemGet } from './actions/item-get'
import { itemCreate } from './actions/item-create'

/**
 * Connector definition.
 *
 * This is the main export that gets registered with the gateway.
 * Update all fields when creating a new connector.
 */
export const templateConnector: ConnectorDefinition = {
  /** Lowercase identifier used in URLs: /v1/{name}/{action} */
  name: 'template',

  /** Human-readable display name */
  display_name: 'Template Connector',

  /** Connector version -- follows semver */
  version: '0.1.0',

  /**
   * Auth mechanism this connector uses:
   * - 'bearer_token': API key or personal access token (most common)
   * - 'oauth2': OAuth 2.0 flow (Slack, Discord, etc.)
   * - 'api_key': API key in header or query (Stripe, etc.)
   * - 'none': No auth required
   */
  auth_type: 'bearer_token',

  /**
   * Actions map: key is the action name (dot notation), value is ActionDefinition.
   *
   * Each action is imported from its own file in src/actions/ for clarity.
   * The three actions below demonstrate the three main patterns:
   * - items.list: Paginated collection retrieval (LIST pattern)
   * - item.get: Single resource by ID (GET pattern)
   * - item.create: Write/mutation operation (CREATE pattern)
   */
  actions: {
    'items.list': itemsList,
    'item.get': itemGet,
    'item.create': itemCreate,
  },
}
