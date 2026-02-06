import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'
import type { ApiKeyRecord } from '../auth/types'
import { parseApiKey, validateApiKey } from '../auth/keys'
import { FeelrError } from '../lib/errors'

/**
 * API key validation middleware.
 *
 * Generates a unique request ID and validates the API key against KV-stored hashes.
 *
 * Flow:
 * 1. Generate request ID for tracing
 * 2. Extract API key from X-Feelr-Key header or ?key= query param
 * 3. Parse key format (fk_<env>_<shortToken>_<longToken>)
 * 4. Look up record in KV by short token
 * 5. Validate long token hash with timing-safe comparison
 * 6. Store validated record in context for downstream handlers
 * 7. Update lastUsedAt timestamp in background (non-blocking)
 *
 * Applied to /v1/* routes only. Admin routes use their own auth.
 */
export const apiKeyMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // Generate unique request ID for tracing
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)

  // Extract API key: header takes priority over query param
  const headerKey = c.req.header('X-Feelr-Key') ?? null
  const queryKey = new URL(c.req.url).searchParams.get('key')
  const apiKey = headerKey ?? queryKey

  if (!apiKey) {
    throw new FeelrError('AUTH_REQUIRED', {
      message: 'API key required. Include X-Feelr-Key header or ?key= parameter.',
      hint: 'auth',
      status: 401,
    })
  }

  c.set('apiKey', apiKey)

  // Parse key format: fk_<env>_<shortToken>_<longToken>
  const parsed = parseApiKey(apiKey)
  if (!parsed) {
    throw new FeelrError('AUTH_INVALID', {
      message: 'Invalid API key format.',
      hint: 'auth',
      status: 401,
    })
  }

  // Look up record in KV by short token
  const record = await c.env.AUTH_KV.get(`apikey:${parsed.shortToken}`, 'json') as ApiKeyRecord | null
  if (!record) {
    throw new FeelrError('AUTH_INVALID', {
      message: 'API key not found.',
      hint: 'auth',
      status: 401,
    })
  }

  // Validate long token hash with timing-safe comparison
  const isValid = await validateApiKey(parsed.longToken, record.longTokenHash)
  if (!isValid) {
    throw new FeelrError('AUTH_INVALID', {
      message: 'Invalid API key.',
      hint: 'auth',
      status: 401,
    })
  }

  // Store validated record in context for downstream handlers
  c.set('apiKeyRecord', record)

  // Update lastUsedAt timestamp in background (non-blocking)
  // Use optional chaining for test environments where executionCtx may not exist
  const updatedRecord: ApiKeyRecord = {
    ...record,
    lastUsedAt: new Date().toISOString(),
  }
  c.executionCtx?.waitUntil?.(
    c.env.AUTH_KV.put(`apikey:${parsed.shortToken}`, JSON.stringify(updatedRecord))
  )

  await next()
})
