/**
 * Feelr Connector Template
 *
 * How to create a new connector:
 *
 * 1. Copy this directory to connectors/your-connector-name/
 * 2. Update package.json "name" to "@feelr/connector-your-name"
 * 3. Update the ConnectorDefinition fields below (name, display_name, auth_type)
 * 4. Implement actions in src/actions/ directory (or inline for small connectors)
 * 5. Register in apps/gateway/src/routes/v1.ts:
 *      import { yourConnector } from '../connectors/your-name'
 *      registerConnector(yourConnector)
 * 6. Run `pnpm install` from the monorepo root to register the workspace package
 * 7. Run `pnpm turbo typecheck` to verify everything compiles
 *
 * Rules:
 * - Only use Web Standard APIs (fetch, URL, Headers, etc.) -- no Cloudflare bindings
 * - Only depend on @feelr/connector-sdk -- no other runtime dependencies
 * - For larger connectors, split actions into separate files in src/actions/
 */

import type {
  ConnectorDefinition,
  ActionDefinition,
  ActionContext,
  ActionResult,
  ParamDefinition,
} from '@feelr/connector-sdk'

/**
 * Example action: resource.list
 *
 * Demonstrates the full pattern for a list action:
 * - ParamDefinition array with required and optional params
 * - Agent-optimized description (50-100 tokens)
 * - Handler using ctx.fetch (Web Standard) and ctx.credential
 * - Returning ActionResult with data array, pagination meta, and raw
 */
const resourceList: ActionDefinition = {
  name: 'resource.list',

  /** Agent-optimized description: what it does, what it accepts, what it returns */
  description:
    'Lists resources from the upstream API with pagination. ' +
    'Accepts optional "page" (number, default 1) and "per_page" (number, default 20) params. ' +
    'Returns an array of { id, name, created_at } resource objects with cursor-based pagination.',

  /** Parameter definitions -- agents use these to know what to pass */
  params: [
    {
      name: 'page',
      type: 'number',
      required: false,
      description: 'Page number to fetch (1-indexed)',
      default: 1,
    },
    {
      name: 'per_page',
      type: 'number',
      required: false,
      description: 'Number of items per page (max 100)',
      default: 20,
    },
  ] satisfies ParamDefinition[],

  /** 'list' means data will be an array; 'single' means a single object */
  returns: 'list',

  /**
   * Action handler.
   *
   * @param ctx.params - Validated parameters (defaults already applied by gateway)
   * @param ctx.fetch - Web Standard fetch function
   * @param ctx.credential - User's upstream API credential (available after Phase 2)
   */
  handler: async (ctx: ActionContext): Promise<ActionResult> => {
    const page = Number(ctx.params.page ?? 1)
    const perPage = Number(ctx.params.per_page ?? 20)

    // --- Replace this block with your actual upstream API call ---
    // Example pattern:
    //
    //   const response = await ctx.fetch(
    //     `https://api.example.com/resources?page=${page}&per_page=${perPage}`,
    //     {
    //       headers: {
    //         'Authorization': `Bearer ${ctx.credential}`,
    //         'Accept': 'application/json',
    //       },
    //     },
    //   )
    //
    //   if (!response.ok) {
    //     throw new FeelrError('UPSTREAM_ERROR', {
    //       message: `Upstream API returned ${response.status}`,
    //       hint: response.status === 401 ? 'auth' : 'retry',
    //       status: 502,
    //       detail: await response.text(),
    //     })
    //   }
    //
    //   const raw = await response.json()

    // Placeholder data for template demonstration
    const raw = {
      items: Array.from({ length: perPage }, (_, i) => ({
        id: `res_${(page - 1) * perPage + i + 1}`,
        name: `Resource ${(page - 1) * perPage + i + 1}`,
        created_at: new Date().toISOString(),
      })),
      total: 100,
      page,
      per_page: perPage,
    }
    // --- End placeholder block ---

    // Normalize the upstream response into the Feelr ActionResult format
    const data = raw.items.map((item) => ({
      id: item.id,
      name: item.name,
      created_at: item.created_at,
    }))

    const hasMore = page * perPage < raw.total

    return {
      /** Normalized data array -- snake_case keys, consistent shape */
      data,
      /** Pagination metadata -- gateway includes these in the response envelope */
      meta: {
        has_more: hasMore,
        cursor: hasMore ? String(page + 1) : undefined,
        total_count: raw.total,
      },
      /** Raw upstream response -- returned when ?raw=true for debugging */
      raw,
    }
  },
}

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
   * For larger connectors, import actions from src/actions/:
   *   import { resourceList } from './actions/resource-list'
   *   import { resourceGet } from './actions/resource-get'
   */
  actions: {
    'resource.list': resourceList,
  },
}
