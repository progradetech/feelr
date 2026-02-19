import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { wrapResponse } from '../lib/envelope'
import { getCredential } from '../auth/credentials'
import { registerConnector, getConnector } from '../connectors/registry'
import { mockConnector } from '../connectors/mock'
import { githubConnector } from '@feelr/connector-github'
import { slackConnector } from '@feelr/connector-slack'
import { stripeConnector } from '@feelr/connector-stripe'
import { discordConnector } from '@feelr/connector-discord'
import { recordUsage } from '../middleware/usage-recorder'

/**
 * V1 API routes -- main dispatch layer.
 *
 * Handles /:connector/:action routing pattern.
 * Looks up connector and action from the registry,
 * extracts params, calls the handler, and wraps the response.
 */
const v1 = new OpenAPIHono<AppEnv>()

// Register connectors on module load
registerConnector(mockConnector)
registerConnector(githubConnector)
registerConnector(slackConnector)
registerConnector(stripeConnector)
registerConnector(discordConnector)

// System params that should not be forwarded to action handlers
const SYSTEM_PARAMS = new Set(['key', 'raw', 'cursor'])

/**
 * Main dispatch route.
 * Accepts any HTTP method (RPC-style gateway).
 * Dot notation in :action param is preserved (e.g., "items.list").
 */
v1.all('/:connector/:action', async (c) => {
  const connectorName = c.req.param('connector')
  const actionName = c.req.param('action')
  const requestId = c.get('requestId')

  // Look up connector
  const connector = getConnector(connectorName)
  if (!connector) {
    throw new FeelrError('CONNECTOR_NOT_FOUND', {
      message: `Connector "${connectorName}" is not registered`,
      hint: 'abort',
      status: 404,
    })
  }

  // Look up action
  const action = connector.actions[actionName]
  if (!action) {
    throw new FeelrError('ACTION_NOT_FOUND', {
      message: `Action "${actionName}" is not available on connector "${connectorName}"`,
      hint: 'abort',
      status: 404,
    })
  }

  // Extract params based on HTTP method
  let rawParams: Record<string, unknown> = {}

  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    // GET/HEAD: extract from URL search params
    const url = new URL(c.req.url)
    for (const [key, value] of url.searchParams.entries()) {
      rawParams[key] = value
    }
  } else {
    // POST/PUT/DELETE/PATCH: parse JSON body
    try {
      const body = await c.req.json()
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        rawParams = body as Record<string, unknown>
      }
    } catch {
      // Body parse failed -- proceed with empty params
      // (may also have query params)
      const url = new URL(c.req.url)
      for (const [key, value] of url.searchParams.entries()) {
        rawParams[key] = value
      }
    }
  }

  // Extract cursor before filtering system params
  const cursor = rawParams.cursor !== undefined ? String(rawParams.cursor) : undefined

  // Remove system params before forwarding to handler
  const actionParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawParams)) {
    if (!SYSTEM_PARAMS.has(key)) {
      actionParams[key] = value
    }
  }

  // Apply param defaults from action definition
  for (const paramDef of action.params) {
    if (actionParams[paramDef.name] === undefined && paramDef.default !== undefined) {
      actionParams[paramDef.name] = paramDef.default
    }
  }

  // Retrieve decrypted credential for this connector (if stored)
  // Reads directly from KV -- no DO round-trip in the request path.
  // The DO handles refresh in the background via alarms.
  let credential: string | undefined
  try {
    const credRecord = await getCredential(connectorName, c.env.AUTH_KV, c.env.ENCRYPTION_KEY)
    if (credRecord) {
      credential = credRecord.accessToken
    }
  } catch {
    // Credential retrieval failed -- proceed without credential.
    // This is non-fatal: mock connector doesn't use credentials,
    // and connectors should handle missing credentials gracefully.
  }

  // Execute action handler with timing and error metering
  const apiKeyShort = c.get('apiKeyRecord')?.shortToken ?? 'unknown'
  const startTime = performance.now()

  let result: Awaited<ReturnType<typeof action.handler>>
  try {
    result = await action.handler({
      params: actionParams,
      fetch: (input, init) => fetch(input, init),
      credential,
      cursor,
    })
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime)

    // Record failed request usage (best-effort, non-blocking)
    const statusCode = err instanceof FeelrError ? err.status : 500
    c.executionCtx.waitUntil(
      recordUsage(c.env.USAGE_DB, {
        api_key_short: apiKeyShort,
        connector: connectorName,
        action: actionName,
        status_code: statusCode,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
      })
    )

    // Re-throw to let the global error handler format the response
    throw err
  }

  const durationMs = Math.round(performance.now() - startTime)

  // Check for ?raw=true -- return raw upstream data without envelope
  const url = new URL(c.req.url)
  if (url.searchParams.get('raw') === 'true' && result.raw !== undefined) {
    return c.json(result.raw as any)
  }

  // Wrap in standard envelope
  const response = wrapResponse({
    data: result.data,
    meta: {
      request_id: requestId,
      connector: connectorName,
      action: actionName,
      duration_ms: durationMs,
      ...(result.meta?.cursor !== undefined && { cursor: result.meta.cursor }),
      ...(result.meta?.has_more !== undefined && { has_more: result.meta.has_more }),
    },
  })

  // Non-blocking usage recording via waitUntil (never fails the parent request)
  c.executionCtx.waitUntil(
    recordUsage(c.env.USAGE_DB, {
      api_key_short: apiKeyShort,
      connector: connectorName,
      action: actionName,
      status_code: 200,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    })
  )

  return c.json(response)
})

export const v1Routes = v1
