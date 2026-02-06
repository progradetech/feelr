/**
 * Admin credential management routes.
 *
 * Mounted at /admin -- all routes require ADMIN_TOKEN via adminAuthMiddleware.
 * Provides CRUD operations for encrypted connector credentials.
 *
 * Routes:
 *   POST   /credentials/:connector  - Store encrypted credential
 *   GET    /credentials             - List connected connectors (no tokens exposed)
 *   DELETE /credentials/:connector  - Remove credential from KV and DO
 *
 * Security:
 * - Admin token validated with timing-safe comparison (middleware)
 * - Regular API keys (/v1 scope) cannot access these routes
 * - Token values are never returned in responses
 */

import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { FeelrError } from '../lib/errors'
import { adminAuthMiddleware } from '../middleware/admin-auth'
import {
  storeCredential,
  removeCredential,
  listCredentials,
} from '../auth/credentials'
import type { CredentialRecord } from '../auth/types'

const admin = new Hono<AppEnv>()

// Apply admin auth middleware to all credential routes
admin.use('/credentials/*', adminAuthMiddleware)
admin.use('/credentials', adminAuthMiddleware)

/**
 * POST /credentials/:connector - Store an encrypted credential.
 *
 * Body: { access_token: string, refresh_token?: string, expires_at?: number }
 *
 * Encrypts the credential with AES-256-GCM before storing in KV.
 * If refreshable (has refresh_token + expires_at), registers with
 * the DO Token Coordinator for proactive alarm-based refresh.
 */
admin.post('/credentials/:connector', async (c) => {
  const connector = c.req.param('connector')

  // Parse and validate request body
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'Request body must be valid JSON.',
      hint: 'abort',
      status: 400,
    })
  }

  const accessToken = body.access_token
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'access_token is required and must be a non-empty string.',
      hint: 'abort',
      status: 400,
    })
  }

  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : null
  const expiresAt = typeof body.expires_at === 'number' ? body.expires_at : null

  // Build credential record
  const credential: CredentialRecord = {
    accessToken,
    refreshToken,
    expiresAt,
  }

  // Get DO stub for refresh registration (if refreshable)
  let tokenCoordinatorStub: {
    storeCredential(connector: string, accessToken: string, refreshToken: string, expiresAt: number): Promise<void>
    removeCredential(connector: string): Promise<void>
  } | undefined

  if (refreshToken && expiresAt) {
    const id = c.env.TOKEN_COORDINATOR.idFromName('default')
    tokenCoordinatorStub = c.env.TOKEN_COORDINATOR.get(id) as unknown as typeof tokenCoordinatorStub
  }

  await storeCredential(
    connector,
    credential,
    c.env.AUTH_KV,
    c.env.ENCRYPTION_KEY,
    tokenCoordinatorStub
  )

  return c.json({
    ok: true,
    data: {
      connector,
      status: 'stored',
    },
  }, 201)
})

/**
 * GET /credentials - List stored credentials.
 *
 * Returns connector names with connection status.
 * Token values are NEVER exposed -- only connector identifiers.
 */
admin.get('/credentials', async (c) => {
  const connectors = await listCredentials(c.env.AUTH_KV)

  return c.json({
    ok: true,
    data: connectors.map((connector) => ({ connector })),
  })
})

/**
 * DELETE /credentials/:connector - Remove a credential.
 *
 * Removes the encrypted credential from KV and deregisters from the
 * DO Token Coordinator (stops refresh alarms for this connector).
 */
admin.delete('/credentials/:connector', async (c) => {
  const connector = c.req.param('connector')

  // Get DO stub for refresh deregistration
  const id = c.env.TOKEN_COORDINATOR.idFromName('default')
  const tokenCoordinatorStub = c.env.TOKEN_COORDINATOR.get(id) as unknown as {
    storeCredential(connector: string, accessToken: string, refreshToken: string, expiresAt: number): Promise<void>
    removeCredential(connector: string): Promise<void>
  }

  await removeCredential(connector, c.env.AUTH_KV, tokenCoordinatorStub)

  return c.json({
    ok: true,
    data: {
      connector,
      status: 'removed',
    },
  })
})

export const adminRoutes = admin
