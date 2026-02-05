/**
 * A connector wraps an upstream API (GitHub, Slack, etc.)
 * and exposes its functionality through standardized actions.
 */
export interface ConnectorDefinition {
  /** Lowercase identifier: "github", "slack" */
  name: string
  /** Display name: "GitHub", "Slack" */
  display_name: string
  /** Connector version */
  version: string
  /** Auth mechanism this connector uses */
  auth_type: 'oauth2' | 'api_key' | 'bearer_token' | 'none'
  /** Map of action name to action definition */
  actions: Record<string, ActionDefinition>
}

/**
 * A single action within a connector (e.g., "issues.list").
 */
export interface ActionDefinition {
  /** Action name using dot notation: "issues.list" */
  name: string
  /** Agent-optimized description, 50-100 tokens */
  description: string
  /** Parameter definitions for this action */
  params: ParamDefinition[]
  /** Whether this action returns a list or single item */
  returns: 'list' | 'single'
  /** Execute the action */
  handler: (ctx: ActionContext) => Promise<ActionResult>
}

/**
 * Context passed to action handlers.
 * Uses only Web Standard APIs -- no Cloudflare-specific bindings.
 */
export interface ActionContext {
  /** Validated parameters from the request */
  params: Record<string, unknown>
  /** Web Standard fetch function */
  fetch: typeof globalThis.fetch
  /** User's upstream API credential (decrypted). Undefined in Phase 1. */
  credential?: string
}

/**
 * Result returned by action handlers.
 */
export interface ActionResult {
  /** The response data -- array for list actions, object for single */
  data: Record<string, unknown>[] | Record<string, unknown>
  /** Optional pagination and metadata */
  meta?: {
    cursor?: string
    has_more?: boolean
    total_count?: number
  }
  /** Raw upstream response for ?raw=true debugging */
  raw?: unknown
}

/**
 * Definition of a single parameter for an action.
 */
export interface ParamDefinition {
  /** Parameter name in snake_case */
  name: string
  /** Parameter type */
  type: 'string' | 'number' | 'boolean'
  /** Whether the parameter is required */
  required: boolean
  /** Short description for agent consumption */
  description: string
  /** Default value if not provided */
  default?: string | number | boolean
}
