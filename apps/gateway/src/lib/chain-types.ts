/**
 * TypeScript chain types, template resolver, condition evaluator, and validation.
 *
 * Mirrors the Go chain types from cli/internal/chain but adapted for the
 * gateway's TypeScript environment. Template resolution and condition evaluation
 * use the same semantics as the Go implementations.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of steps allowed in a single chain definition. */
export const MAX_STEPS = 10

/** Maximum length of a chain name. */
export const MAX_CHAIN_NAME = 64

// ---------------------------------------------------------------------------
// Chain definition interfaces (mirror Go types.go)
// ---------------------------------------------------------------------------

/** A complete chain definition submitted for server-side execution. */
export interface ChainDefinition {
  name: string
  description: string
  version: string
  params: ChainParam[]
  retry: RetryPolicy
  steps: ChainStep[]
}

/** A runtime parameter that users provide when executing a chain. */
export interface ChainParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
  description: string
  default?: string
}

/** A single action step in the chain execution sequence. */
export interface ChainStep {
  id: string
  uses: string
  with: Record<string, string>
  if?: string
  timeout?: number
}

/** Retry behavior for chain steps. */
export interface RetryPolicy {
  max_attempts: number
  delay_seconds: number
}

// ---------------------------------------------------------------------------
// Execution result interfaces (mirror Go executor.go)
// ---------------------------------------------------------------------------

/** Result of a single step execution. */
export interface ChainStepResult {
  step_id: string
  output: Record<string, unknown> | null
  skipped: boolean
  error: string | null
  duration_ms: number
}

/** Complete chain execution result. */
export interface ChainExecutionResult {
  success: boolean
  steps: ChainStepResult[]
  total_duration_ms: number
}

// ---------------------------------------------------------------------------
// Resolve context (mirror Go selector.go)
// ---------------------------------------------------------------------------

/** Runtime data available for template resolution. */
export interface ResolveContext {
  params: Record<string, string>
  steps: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/** Matches ${{ expression }} with optional whitespace inside braces. */
const TEMPLATE_PATTERN = /\$\{\{\s*(.+?)\s*\}\}/g

/**
 * Resolve all ${{ expression }} templates in the given string.
 * Missing data resolves to empty string.
 */
export function resolveTemplate(template: string, ctx: ResolveContext): string {
  return template.replace(TEMPLATE_PATTERN, (_match, expr: string) => {
    return resolveExpression(expr.trim(), ctx)
  })
}

/**
 * Resolve all template expressions in a step's With map,
 * returning a new map with all values resolved.
 */
export function resolveStepWith(
  withMap: Record<string, string>,
  ctx: ResolveContext
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [k, v] of Object.entries(withMap)) {
    resolved[k] = resolveTemplate(v, ctx)
  }
  return resolved
}

/**
 * Handle a single expression which may contain a null coalescing operator.
 */
function resolveExpression(expr: string, ctx: ResolveContext): string {
  // Check for null coalescing: split on " ?? "
  const idx = expr.indexOf(' ?? ')
  if (idx >= 0) {
    const path = expr.slice(0, idx).trim()
    let fallback = expr.slice(idx + 4).trim()
    fallback = stripQuotes(fallback)

    const val = resolvePath(path, ctx)
    return val === '' ? fallback : val
  }

  return resolvePath(expr, ctx)
}

/** Remove surrounding single or double quotes from a string. */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    if ((s[0] === "'" && s[s.length - 1] === "'") || (s[0] === '"' && s[s.length - 1] === '"')) {
      return s.slice(1, -1)
    }
  }
  return s
}

/**
 * Resolve a dot-notation path against the context.
 * Paths start with a namespace: "params" or "steps".
 */
function resolvePath(path: string, ctx: ResolveContext): string {
  const segments = parsePath(path)
  if (segments.length < 2) {
    return ''
  }

  const namespace = segments[0]
  const rest = segments.slice(1)

  switch (namespace) {
    case 'params':
      return resolveParams(rest, ctx)
    case 'steps':
      return resolveSteps(rest, ctx)
    default:
      return ''
  }
}

/** Look up a param value. Only single-segment keys are supported. */
function resolveParams(segments: string[], ctx: ResolveContext): string {
  if (!ctx.params || segments.length === 0) {
    return ''
  }
  const key = segments[0]
  const val = ctx.params[key]
  return val !== undefined ? val : ''
}

/** Navigate step output data using remaining path segments. */
function resolveSteps(segments: string[], ctx: ResolveContext): string {
  if (!ctx.steps || segments.length === 0) {
    return ''
  }

  const stepID = segments[0]
  const data = ctx.steps[stepID]
  if (data === undefined || data === null) {
    return ''
  }

  if (segments.length === 1) {
    return stringify(data)
  }

  const val = walkPath(data, segments.slice(1))
  if (val === null || val === undefined) {
    return ''
  }
  return stringify(val)
}

/**
 * Navigate a nested data structure using path segments.
 * Supports map key access and array index access via [N] notation.
 */
function walkPath(data: unknown, segments: string[]): unknown {
  let current: unknown = data
  for (const seg of segments) {
    if (current === null || current === undefined) {
      return null
    }

    // Check for array index: segment starts with [
    if (seg.startsWith('[') && seg.endsWith(']')) {
      const idxStr = seg.slice(1, -1)
      const idx = parseInt(idxStr, 10)
      if (isNaN(idx)) {
        return null
      }
      if (!Array.isArray(current) || idx < 0 || idx >= current.length) {
        return null
      }
      current = current[idx]
      continue
    }

    // Map key access
    if (typeof current !== 'object' || Array.isArray(current)) {
      return null
    }
    const obj = current as Record<string, unknown>
    if (!(seg in obj)) {
      return null
    }
    current = obj[seg]
  }
  return current
}

/**
 * Split a dotted path like "steps.create.data[0].title" into
 * ["steps", "create", "data", "[0]", "title"], handling bracket notation.
 */
function parsePath(path: string): string[] {
  const segments: string[] = []
  let current = ''

  for (let i = 0; i < path.length; i++) {
    const ch = path[i]
    switch (ch) {
      case '.':
        if (current.length > 0) {
          segments.push(current)
          current = ''
        }
        break
      case '[':
        if (current.length > 0) {
          segments.push(current)
          current = ''
        }
        current += '['
        for (i++; i < path.length; i++) {
          current += path[i]
          if (path[i] === ']') {
            break
          }
        }
        segments.push(current)
        current = ''
        break
      default:
        current += ch
    }
  }
  if (current.length > 0) {
    segments.push(current)
  }
  return segments
}

/** Convert a value to its string representation. */
function stringify(val: unknown): string {
  if (val === null || val === undefined) {
    return ''
  }
  if (typeof val === 'string') {
    return val
  }
  if (typeof val === 'number') {
    // Format integers without decimal point
    if (Number.isInteger(val)) {
      return val.toString()
    }
    return val.toString()
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false'
  }
  return String(val)
}

// ---------------------------------------------------------------------------
// Condition evaluation (mirror Go condition.go)
// ---------------------------------------------------------------------------

/**
 * Evaluate a boolean condition expression against the given context.
 * Template expressions (${{ }}) are resolved before evaluation.
 * An empty expression returns true (unconditional step).
 *
 * Supported operators: ==, !=, >, <, >=, <=, contains, exists
 * Boolean combinators: && (AND), || (OR)
 * Precedence: || is lowest, && is higher, comparisons are highest.
 */
export function evalCondition(expr: string, ctx: ResolveContext): boolean {
  // Resolve templates first
  let resolved = resolveTemplate(expr, ctx)
  resolved = resolved.trim()

  // Empty expression is unconditional (true)
  if (resolved === '') {
    return true
  }

  return evalOr(resolved)
}

/** Split on " || " and return true if any group is true. */
function evalOr(expr: string): boolean {
  const groups = expr.split(' || ')
  for (const group of groups) {
    if (evalAnd(group.trim())) {
      return true
    }
  }
  return false
}

/** Split on " && " and return true only if all terms are true. */
function evalAnd(expr: string): boolean {
  const terms = expr.split(' && ')
  for (const term of terms) {
    if (!evalTerm(term.trim())) {
      return false
    }
  }
  return true
}

/** Evaluate a single comparison term. */
function evalTerm(term: string): boolean {
  if (term === '') {
    return true
  }

  // Check for "exists" prefix
  if (term.startsWith('exists ')) {
    const val = term.slice(7).trim()
    return val !== ''
  }
  if (term === 'exists') {
    return false
  }

  // Try two-character operators first (must check before single-char)
  for (const op of ['==', '!=', '>=', '<=']) {
    const opStr = ` ${op} `
    const idx = term.indexOf(opStr)
    if (idx >= 0) {
      const left = term.slice(0, idx).trim()
      const right = term.slice(idx + opStr.length).trim()
      return evalComparison(left, op, right)
    }
  }

  // Single-character operators (> and <) -- must not match >= or <=
  for (const op of ['>', '<']) {
    const opStr = ` ${op} `
    const idx = term.indexOf(opStr)
    if (idx >= 0) {
      // Verify this isn't part of >= or <=
      const afterOp = idx + 1 + op.length
      if (afterOp < term.length && term[afterOp] === '=') {
        continue
      }
      const left = term.slice(0, idx).trim()
      const right = term.slice(idx + opStr.length).trim()
      return evalComparison(left, op, right)
    }
  }

  // Check for "contains" operator
  const containsIdx = term.indexOf(' contains ')
  if (containsIdx >= 0) {
    const left = term.slice(0, containsIdx).trim()
    const right = term.slice(containsIdx + 10).trim()
    return left.includes(right)
  }

  // Simple truthy: non-empty, not "0", not "false"
  return isTruthy(term)
}

/** Evaluate left op right for the given operator. */
function evalComparison(left: string, op: string, right: string): boolean {
  switch (op) {
    case '==':
      return left === right
    case '!=':
      return left !== right
    case '>':
    case '<':
    case '>=':
    case '<=':
      return evalNumericOrString(left, op, right)
    default:
      return false
  }
}

/** Try numeric comparison first; fall back to string comparison. */
function evalNumericOrString(left: string, op: string, right: string): boolean {
  const lf = parseFloat(left)
  const rf = parseFloat(right)

  if (!isNaN(lf) && !isNaN(rf)) {
    switch (op) {
      case '>':
        return lf > rf
      case '<':
        return lf < rf
      case '>=':
        return lf >= rf
      case '<=':
        return lf <= rf
    }
  }

  // Fallback to string comparison
  switch (op) {
    case '>':
      return left > right
    case '<':
      return left < right
    case '>=':
      return left >= right
    case '<=':
      return left <= right
  }
  return false
}

/** True if the value is non-empty, not "0", and not "false". */
function isTruthy(val: string): boolean {
  return val !== '' && val !== '0' && val !== 'false'
}

// ---------------------------------------------------------------------------
// Chain validation
// ---------------------------------------------------------------------------

/**
 * Validate a chain definition against complexity ceiling rules.
 * Throws descriptive error message on validation failure.
 */
export function validateChain(chain: ChainDefinition): string | null {
  if (!chain.name || chain.name.trim() === '') {
    return 'chain name is required'
  }
  if (chain.name.length > MAX_CHAIN_NAME) {
    return `chain name exceeds maximum length of ${MAX_CHAIN_NAME} characters`
  }

  if (!chain.steps || chain.steps.length === 0) {
    return 'chain must have at least one step'
  }
  if (chain.steps.length > MAX_STEPS) {
    return `chain exceeds maximum of ${MAX_STEPS} steps`
  }

  // Validate step IDs are unique and non-empty
  const stepIDs = new Set<string>()
  for (const step of chain.steps) {
    if (!step.id || step.id.trim() === '') {
      return 'all steps must have an id'
    }
    if (stepIDs.has(step.id)) {
      return `duplicate step id: ${step.id}`
    }
    stepIDs.add(step.id)

    // Validate uses field format: connector/action
    if (!step.uses || !step.uses.includes('/')) {
      return `step "${step.id}" has invalid uses format: expected connector/action`
    }
    const slashIdx = step.uses.indexOf('/')
    const connector = step.uses.slice(0, slashIdx)
    const action = step.uses.slice(slashIdx + 1)
    if (!connector || !action) {
      return `step "${step.id}" has invalid uses format: empty connector or action`
    }
  }

  // Validate retry policy
  if (chain.retry) {
    if (chain.retry.max_attempts < 0) {
      return 'retry max_attempts cannot be negative'
    }
    if (chain.retry.delay_seconds < 0) {
      return 'retry delay_seconds cannot be negative'
    }
  }

  // Validate params
  if (chain.params) {
    const paramNames = new Set<string>()
    for (const param of chain.params) {
      if (!param.name || param.name.trim() === '') {
        return 'all params must have a name'
      }
      if (paramNames.has(param.name)) {
        return `duplicate param name: ${param.name}`
      }
      paramNames.add(param.name)
    }
  }

  // Validate no forward references in if conditions
  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i]
    if (step.if) {
      // Check for references to steps that come after this one
      const stepsBeforePattern = /steps\.(\w+)/g
      let match: RegExpExecArray | null
      while ((match = stepsBeforePattern.exec(step.if)) !== null) {
        const refStepID = match[1]
        // Check if referenced step comes after current step
        const refIndex = chain.steps.findIndex((s) => s.id === refStepID)
        if (refIndex >= i) {
          return `step "${step.id}" has forward reference to step "${refStepID}" in condition`
        }
      }
    }
  }

  return null
}
