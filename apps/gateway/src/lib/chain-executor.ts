/**
 * Server-side chain executor.
 *
 * Executes chain definitions by calling action handlers DIRECTLY from the
 * connector registry -- no HTTP subrequests. This eliminates round-trip
 * latency per step and enables future features like scheduled chains.
 *
 * Key design decisions:
 * - Direct action.handler() calls via registry (same process, zero network)
 * - Per-step credential fetching (different connectors = different creds)
 * - Step output stored in ResolveContext for template resolution
 * - Retry policy at step level with configurable delay
 */

import type {
  ChainDefinition,
  ChainStepResult,
  ChainExecutionResult,
  ResolveContext,
  ChainStep,
} from './chain-types'
import { validateChain, resolveTemplate, resolveStepWith, evalCondition } from './chain-types'
import { getConnector } from '../connectors/registry'
import { getCredential } from '../auth/credentials'
import type { KeyValueStore } from '../runtime/interfaces'

/** Options for chain execution. */
export interface ExecuteChainOptions {
  chain: ChainDefinition
  params: Record<string, string>
  kv: KeyValueStore
  encryptionKey: string
}

/**
 * Execute a chain definition server-side.
 *
 * Validates the chain, validates required params, applies defaults,
 * then executes each step sequentially: evaluate condition, resolve
 * templates, look up connector+action from registry, fetch credential,
 * call action.handler() directly.
 *
 * Returns a ChainExecutionResult with per-step outputs and overall success.
 */
export async function executeChain(opts: ExecuteChainOptions): Promise<ChainExecutionResult> {
  const { chain, params, kv, encryptionKey } = opts

  // Validate chain definition
  const validationError = validateChain(chain)
  if (validationError) {
    return {
      success: false,
      steps: [],
      total_duration_ms: 0,
    }
  }

  // Validate required params and apply defaults
  const resolvedParams = validateAndApplyParams(chain, params)
  if (typeof resolvedParams === 'string') {
    // Validation error string
    return {
      success: false,
      steps: [{
        step_id: '_params',
        output: null,
        skipped: false,
        error: resolvedParams,
        duration_ms: 0,
      }],
      total_duration_ms: 0,
    }
  }

  // Initialize resolve context
  const ctx: ResolveContext = {
    params: resolvedParams,
    steps: {},
  }

  // Determine retry settings (default to 1 attempt if unset)
  const maxAttempts = chain.retry?.max_attempts && chain.retry.max_attempts >= 1
    ? chain.retry.max_attempts
    : 1
  const delaySeconds = chain.retry?.delay_seconds && chain.retry.delay_seconds >= 0
    ? chain.retry.delay_seconds
    : 0

  const chainStart = performance.now()
  const stepResults: ChainStepResult[] = []
  let success = true

  for (const step of chain.steps) {
    const stepResult = await executeStep(step, ctx, maxAttempts, delaySeconds, kv, encryptionKey)

    // Store output in context for subsequent steps (null for skipped/failed)
    if (stepResult.skipped || stepResult.error !== null) {
      ctx.steps[step.id] = null
    } else {
      ctx.steps[step.id] = stepResult.output
    }

    stepResults.push(stepResult)

    // Halt chain on step failure
    if (stepResult.error !== null) {
      success = false
      break
    }
  }

  const totalDuration = Math.round(performance.now() - chainStart)

  return {
    success,
    steps: stepResults,
    total_duration_ms: totalDuration,
  }
}

/**
 * Validate required params are present and apply defaults for optional params.
 * Returns resolved params map or error string.
 */
function validateAndApplyParams(
  chain: ChainDefinition,
  provided: Record<string, string>
): Record<string, string> | string {
  const resolved: Record<string, string> = { ...provided }

  if (!chain.params) {
    return resolved
  }

  for (const p of chain.params) {
    if (resolved[p.name] !== undefined) {
      continue
    }
    if (p.required) {
      return `missing required param: ${p.name}`
    }
    if (p.default !== undefined && p.default !== '') {
      resolved[p.name] = p.default
    }
  }

  return resolved
}

/**
 * Execute a single step with condition check and retry logic.
 * Calls action.handler() directly from the connector registry.
 */
async function executeStep(
  step: ChainStep,
  ctx: ResolveContext,
  maxAttempts: number,
  delaySeconds: number,
  kv: KeyValueStore,
  encryptionKey: string
): Promise<ChainStepResult> {
  const start = performance.now()

  // Evaluate condition if present
  if (step.if) {
    const condResult = evalCondition(step.if, ctx)
    if (!condResult) {
      return {
        step_id: step.id,
        output: null,
        skipped: true,
        error: null,
        duration_ms: Math.round(performance.now() - start),
      }
    }
  }

  // Resolve step With params using current context
  const resolvedWith = resolveStepWith(step.with || {}, ctx)

  // Parse connector/action from Uses field
  const slashIdx = step.uses.indexOf('/')
  if (slashIdx < 0) {
    return {
      step_id: step.id,
      output: null,
      skipped: false,
      error: `invalid uses format "${step.uses}": expected connector/action`,
      duration_ms: Math.round(performance.now() - start),
    }
  }
  const connectorName = step.uses.slice(0, slashIdx)
  const actionName = step.uses.slice(slashIdx + 1)

  // Look up connector from registry
  const connector = getConnector(connectorName)
  if (!connector) {
    return {
      step_id: step.id,
      output: null,
      skipped: false,
      error: `connector "${connectorName}" is not registered`,
      duration_ms: Math.round(performance.now() - start),
    }
  }

  // Look up action
  const action = connector.actions[actionName]
  if (!action) {
    return {
      step_id: step.id,
      output: null,
      skipped: false,
      error: `action "${actionName}" is not available on connector "${connectorName}"`,
      duration_ms: Math.round(performance.now() - start),
    }
  }

  // Fetch credential for this connector (different connectors = different creds)
  let credential: string | undefined
  try {
    const credRecord = await getCredential(connectorName, kv, encryptionKey)
    if (credRecord) {
      credential = credRecord.accessToken
    }
  } catch {
    // Credential retrieval failed -- proceed without credential.
    // Connectors should handle missing credentials gracefully.
  }

  // Execute with retry
  let lastError: string | null = null
  let output: Record<string, unknown> | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await action.handler({
        params: resolvedWith as Record<string, unknown>,
        fetch: fetch,
        credential,
      })

      // Extract data as step output
      if (Array.isArray(result.data)) {
        // For list results, wrap in an object for template access
        output = { data: result.data, meta: result.meta || {} }
      } else {
        output = { ...result.data, ...(result.meta ? { _meta: result.meta } : {}) }
      }
      lastError = null
      break
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      // If more attempts remain, wait before retrying
      if (attempt < maxAttempts && delaySeconds > 0) {
        await sleep(delaySeconds * 1000)
      }
    }
  }

  if (lastError !== null) {
    return {
      step_id: step.id,
      output: null,
      skipped: false,
      error: `step "${step.id}" failed after ${maxAttempts} attempt(s): ${lastError}`,
      duration_ms: Math.round(performance.now() - start),
    }
  }

  return {
    step_id: step.id,
    output,
    skipped: false,
    error: null,
    duration_ms: Math.round(performance.now() - start),
  }
}

/** Promise-based sleep utility. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
