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

// Apply admin auth middleware to all credential and OAuth routes
admin.use('/credentials/*', adminAuthMiddleware)
admin.use('/credentials', adminAuthMiddleware)
admin.use('/oauth/*', adminAuthMiddleware)

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

  // Get token coordinator stub for refresh registration (if refreshable)
  let tokenCoordinatorStub: {
    storeCredential(connector: string, accessToken: string, refreshToken: string, expiresAt: number): Promise<void>
    removeCredential(connector: string): Promise<void>
  } | undefined

  if (refreshToken && expiresAt) {
    tokenCoordinatorStub = c.env.TOKEN_COORDINATOR.getStub()
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

  // Get token coordinator stub for refresh deregistration
  const tokenCoordinatorStub = c.env.TOKEN_COORDINATOR.getStub()

  await removeCredential(connector, c.env.AUTH_KV, tokenCoordinatorStub)

  return c.json({
    ok: true,
    data: {
      connector,
      status: 'removed',
    },
  })
})

/**
 * GET /oauth/config/:provider - Return OAuth configuration for CLI auth flow.
 *
 * The CLI uses this to build the OAuth authorization URL and redirect the user
 * to the provider's consent page. Only Slack uses OAuth -- Discord and Stripe
 * use direct tokens/API keys.
 *
 * Returns: client_id, authorize_url, scopes (for OAuth providers)
 * Returns: auth_type, message (for token-based providers)
 */
admin.get('/oauth/config/:provider', (c) => {
  const provider = c.req.param('provider')

  switch (provider) {
    case 'slack':
      return c.json({
        ok: true,
        data: {
          provider: 'slack',
          auth_type: 'oauth2',
          client_id: c.env.SLACK_CLIENT_ID,
          authorize_url: 'https://slack.com/oauth/v2/authorize',
          scopes: 'chat:write,channels:read,search:read,users:read,channels:write.topic',
        },
      })

    case 'discord':
      return c.json({
        ok: true,
        data: {
          provider: 'discord',
          auth_type: 'token',
          message: 'Discord uses bot tokens. Use --token flag or provide bot token directly.',
        },
      })

    case 'stripe':
      return c.json({
        ok: true,
        data: {
          provider: 'stripe',
          auth_type: 'api_key',
          message: 'Stripe uses API keys. Use --token flag or provide your sk_* key directly.',
        },
      })

    default:
      throw new FeelrError('NOT_FOUND', {
        message: `Unknown OAuth provider: "${provider}"`,
        hint: 'abort',
        status: 404,
      })
  }
})

/**
 * POST /oauth/exchange/:provider - Server-side OAuth token exchange.
 *
 * The CLI handles the browser dance (redirect to provider, capture auth code),
 * then sends the auth code here. The gateway exchanges it with the provider
 * using the client secret (which never leaves the server).
 *
 * Body: { code: string, redirect_uri: string }
 *
 * Only supported for Slack (only OAuth provider). Discord/Stripe use
 * direct tokens that are stored via POST /credentials/:connector.
 */
admin.post('/oauth/exchange/:provider', async (c) => {
  const provider = c.req.param('provider')

  if (provider !== 'slack') {
    throw new FeelrError('VALIDATION_ERROR', {
      message: `OAuth exchange is only supported for Slack. ${provider === 'discord' ? 'Discord uses bot tokens.' : provider === 'stripe' ? 'Stripe uses API keys.' : `Unknown provider: "${provider}".`}`,
      hint: 'abort',
      status: 400,
    })
  }

  // Parse request body
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

  const code = body.code
  const redirectUri = body.redirect_uri

  if (typeof code !== 'string' || !code) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'code is required and must be a non-empty string.',
      hint: 'abort',
      status: 400,
    })
  }

  if (typeof redirectUri !== 'string' || !redirectUri) {
    throw new FeelrError('VALIDATION_ERROR', {
      message: 'redirect_uri is required and must be a non-empty string.',
      hint: 'abort',
      status: 400,
    })
  }

  // Exchange auth code with Slack
  const exchangeBody = new URLSearchParams({
    client_id: c.env.SLACK_CLIENT_ID,
    client_secret: c.env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  })

  const slackResponse = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: exchangeBody.toString(),
  })

  const slackData = (await slackResponse.json()) as {
    ok: boolean
    access_token?: string
    refresh_token?: string
    expires_in?: number
    team?: { name: string; id: string }
    error?: string
  }

  if (!slackData.ok) {
    throw new FeelrError('UPSTREAM_ERROR', {
      message: `Slack OAuth exchange failed: ${slackData.error ?? 'unknown error'}`,
      hint: 'retry',
      status: 400,
    })
  }

  if (!slackData.access_token) {
    throw new FeelrError('UPSTREAM_ERROR', {
      message: 'Slack OAuth response missing access_token',
      hint: 'retry',
      status: 502,
    })
  }

  // Determine if token rotation is enabled
  const hasRotation = typeof slackData.expires_in === 'number' && slackData.refresh_token
  const credential: CredentialRecord = {
    accessToken: slackData.access_token,
    refreshToken: hasRotation ? slackData.refresh_token! : null,
    expiresAt: hasRotation ? Date.now() + slackData.expires_in! * 1000 : null,
  }

  // Get token coordinator stub for refresh registration (if token has rotation)
  let tokenCoordinatorStub: {
    storeCredential(connector: string, accessToken: string, refreshToken: string, expiresAt: number): Promise<void>
    removeCredential(connector: string): Promise<void>
  } | undefined

  if (credential.refreshToken && credential.expiresAt) {
    tokenCoordinatorStub = c.env.TOKEN_COORDINATOR.getStub()
  }

  // Store encrypted credential via existing function
  await storeCredential(
    'slack',
    credential,
    c.env.AUTH_KV,
    c.env.ENCRYPTION_KEY,
    tokenCoordinatorStub
  )

  return c.json({
    ok: true,
    data: {
      connector: 'slack',
      status: 'connected',
      team: slackData.team?.name ?? 'unknown',
    },
  }, 201)
})

export const adminRoutes = admin
