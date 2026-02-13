import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { wrapResponse } from '../lib/envelope'
import { executeChain } from '../lib/chain-executor'
import type { ChainDefinition } from '../lib/chain-types'
import { MAX_STEPS } from '../lib/chain-types'

/**
 * Chain execution routes.
 *
 * Provides server-side chain execution for the gateway:
 * - POST /run  -> execute a chain definition
 *
 * Mounted at /v1/chains in app.ts (before the /v1 dispatch catch-all).
 * API key auth is inherited from the /v1/* middleware in app.ts.
 */
const chains = new OpenAPIHono<AppEnv>()

/**
 * Execute a chain definition server-side.
 *
 * Accepts a JSON body with:
 *   chain: ChainDefinition  -- the full chain definition
 *   params: Record<string, string>  -- runtime parameters
 *
 * Returns the execution result in the standard Feelr response envelope
 * with chain metadata (step count, success, total duration).
 */
chains.post('/run', async (c) => {
  const requestId = c.get('requestId')

  // Parse request body
  let body: { chain?: ChainDefinition; params?: Record<string, string> }
  try {
    body = await c.req.json()
  } catch {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'Invalid JSON body',
      hint: 'abort',
      status: 400,
    })
  }

  // Validate chain is present
  if (!body.chain) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'Missing "chain" field in request body',
      hint: 'abort',
      status: 400,
    })
  }

  const chain = body.chain
  const params = body.params || {}

  // Quick validation before executing
  if (!chain.name) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'Chain name is required',
      hint: 'abort',
      status: 400,
    })
  }

  if (!chain.steps || !Array.isArray(chain.steps) || chain.steps.length === 0) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'Chain must have at least one step',
      hint: 'abort',
      status: 400,
    })
  }

  if (chain.steps.length > MAX_STEPS) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: `Chain exceeds maximum of ${MAX_STEPS} steps`,
      hint: 'abort',
      status: 400,
    })
  }

  // Execute chain
  const startTime = performance.now()
  const result = await executeChain({
    chain,
    params,
    kv: c.env.AUTH_KV,
    encryptionKey: c.env.ENCRYPTION_KEY,
  })
  const durationMs = Math.round(performance.now() - startTime)

  // Determine final step output for the response data
  const finalStepOutput = result.success && result.steps.length > 0
    ? result.steps[result.steps.length - 1].output
    : null

  // Build response in standard envelope with chain metadata
  const response = wrapResponse({
    data: {
      result: finalStepOutput,
      chain: {
        name: chain.name,
        success: result.success,
        steps_executed: result.steps.length,
        steps_total: chain.steps.length,
        steps: result.steps.map((s) => ({
          step_id: s.step_id,
          skipped: s.skipped,
          error: s.error,
          duration_ms: s.duration_ms,
        })),
      },
    },
    meta: {
      request_id: requestId,
      connector: 'gateway',
      action: 'chains.run',
      duration_ms: durationMs,
    },
  })

  // Return 200 even if chain failed (chain failure is in the response body)
  // but if the first step had a param validation error, return 400
  if (!result.success && result.steps.length > 0 && result.steps[0].step_id === '_params') {
    throw new FeelrError('VALIDATION_ERROR', {
      message: result.steps[0].error || 'Parameter validation failed',
      hint: 'abort',
      status: 400,
    })
  }

  return c.json(response)
})

export const chainsRoutes = chains
