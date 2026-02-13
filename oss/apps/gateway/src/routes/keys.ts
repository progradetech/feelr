/**
 * API key management routes.
 *
 * Mounted at /admin -- all routes require ADMIN_TOKEN in Authorization header.
 * These are admin-only routes separated from user API at /v1.
 *
 * Routes:
 *   POST   /keys       - Create a new API key (returns full key exactly once)
 *   GET    /keys       - List all API keys (metadata only, no secrets)
 *   DELETE /keys/:id   - Revoke an API key by short token
 */

import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import type { ApiKeyRecord } from '../auth/types'
import { FeelrError } from '../lib/errors'
import { generateApiKey } from '../auth/keys'

/** Maximum number of API keys allowed (soft limit) */
const MAX_KEYS = 25

/**
 * Validate admin token from Authorization header using timing-safe comparison.
 * Local to this module -- admin-auth middleware is created in Plan 04.
 */
async function validateAdmin(authHeader: string | undefined, adminToken: string): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice(7)
  const encoder = new TextEncoder()
  const a = encoder.encode(token)
  const b = encoder.encode(adminToken)

  if (a.byteLength !== b.byteLength) return false
  return crypto.subtle.timingSafeEqual(a, b)
}

const keys = new Hono<AppEnv>()

/**
 * Admin authentication guard -- applied to all key management routes.
 */
keys.use('/keys/*', async (c, next) => {
  const isValid = await validateAdmin(c.req.header('Authorization'), c.env.ADMIN_TOKEN)
  if (!isValid) {
    throw new FeelrError('ADMIN_AUTH_REQUIRED', {
      message: 'Admin token required. Include Authorization: Bearer <admin-token> header.',
      hint: 'auth',
      status: 401,
    })
  }
  await next()
})

// Also apply to the exact /keys path (POST and GET without trailing segment)
keys.use('/keys', async (c, next) => {
  const isValid = await validateAdmin(c.req.header('Authorization'), c.env.ADMIN_TOKEN)
  if (!isValid) {
    throw new FeelrError('ADMIN_AUTH_REQUIRED', {
      message: 'Admin token required. Include Authorization: Bearer <admin-token> header.',
      hint: 'auth',
      status: 401,
    })
  }
  await next()
})

/**
 * POST /keys - Create a new API key.
 *
 * Body: { label?: string }
 * Returns the full key exactly once. After this response, only the hash is stored.
 */
keys.post('/keys', async (c) => {
  // Parse optional label from body
  let label: string | undefined
  try {
    const body = await c.req.json()
    if (body && typeof body === 'object' && 'label' in body) {
      label = typeof body.label === 'string' ? body.label : undefined
    }
  } catch {
    // Empty body is fine -- label is optional
  }

  // Check key count (soft limit of 25)
  const existingKeys = await c.env.AUTH_KV.list({ prefix: 'apikey:' })
  if (existingKeys.keys.length >= MAX_KEYS) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: `Maximum of ${MAX_KEYS} API keys reached. Revoke unused keys before creating new ones.`,
      hint: 'abort',
      status: 400,
    })
  }

  // Generate key (tier defaults to 'free' in generateApiKey)
  const { fullKey, record } = await generateApiKey(c.env.ENVIRONMENT || 'development', label)

  // Store in KV (only the hash, never the full key)
  await c.env.AUTH_KV.put(`apikey:${record.shortToken}`, JSON.stringify(record))

  return c.json({
    ok: true,
    data: {
      key: fullKey,
      short_token: record.shortToken,
      label: record.label ?? null,
      tier: record.tier,
      created_at: record.createdAt,
    },
  }, 201)
})

/**
 * GET /keys - List all API keys with metadata.
 *
 * Returns short token, label, created/last-used timestamps.
 * Does NOT return the full key or hash.
 */
keys.get('/keys', async (c) => {
  const listResult = await c.env.AUTH_KV.list({ prefix: 'apikey:' })

  const records: Array<{
    short_token: string
    label: string | null
    tier: string
    created_at: string
    last_used_at: string | null
  }> = []

  for (const key of listResult.keys) {
    const value = await c.env.AUTH_KV.get(key.name, 'json') as ApiKeyRecord | null
    if (value) {
      records.push({
        short_token: value.shortToken,
        label: value.label ?? null,
        tier: value.tier ?? 'free',  // Backward compat: existing keys default to free
        created_at: value.createdAt,
        last_used_at: value.lastUsedAt ?? null,
      })
    }
  }

  return c.json({
    ok: true,
    data: records,
  })
})

/**
 * DELETE /keys/:id - Revoke an API key by short token.
 *
 * After deletion, subsequent requests with this key will fail with AUTH_INVALID.
 * Note: KV is eventually consistent -- revocation propagates within ~60 seconds.
 */
keys.delete('/keys/:id', async (c) => {
  const shortToken = c.req.param('id')

  // Verify key exists before deleting
  const existing = await c.env.AUTH_KV.get(`apikey:${shortToken}`)
  if (!existing) {
    throw new FeelrError('NOT_FOUND', {
      message: `API key with short token "${shortToken}" not found.`,
      hint: 'abort',
      status: 404,
    })
  }

  await c.env.AUTH_KV.delete(`apikey:${shortToken}`)

  return c.json({
    ok: true,
    data: {
      short_token: shortToken,
      status: 'revoked',
    },
  })
})

export const keyRoutes = keys
