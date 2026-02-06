import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../lib/types'
import { listConnectors, getConnector } from '../connectors/registry'
import { wrapResponse } from '../lib/envelope'
import { FeelrError } from '../lib/errors'

/**
 * Tools discovery routes.
 *
 * Provides progressive connector discovery for CLI and agents:
 * - GET /           -> list all registered connectors
 * - GET /:connector -> list actions for a connector
 * - GET /:connector/:action -> full parameter schema for an action
 *
 * Mounted at /v1/tools in app.ts.
 * API key auth is inherited from the /v1/* middleware in app.ts.
 */
const tools = new OpenAPIHono<AppEnv>()

/**
 * List all registered connectors.
 * Returns name, display_name, version, auth_type, and action_count for each.
 */
tools.get('/', (c) => {
  const connectors = listConnectors()

  const items = connectors.map((connector) => ({
    name: connector.name,
    display_name: connector.display_name,
    version: connector.version,
    auth_type: connector.auth_type,
    action_count: Object.keys(connector.actions).length,
  }))

  const requestId = c.get('requestId')
  const response = wrapResponse({
    data: items,
    meta: {
      request_id: requestId,
      connector: 'gateway',
      action: 'tools.list',
      duration_ms: 0,
    },
  })

  return c.json(response)
})

/**
 * List actions for a specific connector.
 * Returns connector metadata plus an array of action summaries.
 */
tools.get('/:connector', (c) => {
  const connectorName = c.req.param('connector')
  const connector = getConnector(connectorName)

  if (!connector) {
    throw new FeelrError('CONNECTOR_NOT_FOUND', {
      message: `Connector "${connectorName}" is not registered`,
      hint: 'abort',
      status: 404,
    })
  }

  const actions = Object.values(connector.actions).map((action) => ({
    name: action.name,
    description: action.description,
    returns: action.returns,
  }))

  const requestId = c.get('requestId')
  const response = wrapResponse({
    data: {
      name: connector.name,
      display_name: connector.display_name,
      actions,
    },
    meta: {
      request_id: requestId,
      connector: connectorName,
      action: 'tools.detail',
      duration_ms: 0,
    },
  })

  return c.json(response)
})

/**
 * Full parameter schema for a specific action.
 * Returns action name, description, params (with types and defaults), and returns type.
 */
tools.get('/:connector/:action', (c) => {
  const connectorName = c.req.param('connector')
  const actionName = c.req.param('action')

  const connector = getConnector(connectorName)
  if (!connector) {
    throw new FeelrError('CONNECTOR_NOT_FOUND', {
      message: `Connector "${connectorName}" is not registered`,
      hint: 'abort',
      status: 404,
    })
  }

  const action = connector.actions[actionName]
  if (!action) {
    throw new FeelrError('ACTION_NOT_FOUND', {
      message: `Action "${actionName}" is not available on connector "${connectorName}"`,
      hint: 'abort',
      status: 404,
    })
  }

  const requestId = c.get('requestId')
  const response = wrapResponse({
    data: {
      name: action.name,
      description: action.description,
      params: action.params,
      returns: action.returns,
    },
    meta: {
      request_id: requestId,
      connector: connectorName,
      action: `tools.schema`,
      duration_ms: 0,
    },
  })

  return c.json(response)
})

export const toolsRoutes = tools
