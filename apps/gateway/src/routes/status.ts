import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../lib/types'
import { wrapResponse } from '../lib/envelope'
import { apiKeyMiddleware } from '../middleware/api-key'
import { listCredentials, getCredential } from '../auth/credentials'

/**
 * /status health check endpoint.
 *
 * Authenticated via API key (locked decision). Reports gateway health
 * and connector health with rate limit info.
 *
 * Modes:
 * - Shallow (default): Calls GitHub /rate_limit endpoint (free, no quota cost)
 * - Deep (?deep=true): Also validates PAT via /user endpoint
 *
 * Connector status:
 * - healthy: API reachable, rate limit has remaining requests
 * - degraded: API reachable, rate limit exhausted (remaining=0)
 * - unhealthy: API call failed or credential missing/invalid
 */

/** Rate limit info included in connector status */
interface RateLimitInfo {
  remaining: number
  limit: number
  used: number
  resets_at: string
}

/** Per-connector health status */
interface ConnectorStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  rate_limit?: RateLimitInfo
  authenticated_as?: string
  error?: string
}

/** Full status response shape */
interface StatusResponse {
  gateway: {
    status: 'healthy'
    version: string
  }
  connectors: Record<string, ConnectorStatus>
}

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Feelr/1.0',
}

export const statusRoutes = new OpenAPIHono<AppEnv>()

// Apply API key middleware -- /status is authenticated (locked decision)
statusRoutes.use('/status', apiKeyMiddleware)

statusRoutes.get('/status', async (c) => {
  const startTime = Date.now()
  const deep = c.req.query('deep') === 'true'

  // Gateway is always healthy if we're responding
  const response: StatusResponse = {
    gateway: { status: 'healthy', version: '1.0.0' },
    connectors: {},
  }

  // Discover connectors with stored credentials
  const connectorNames = await listCredentials(c.env.AUTH_KV)

  // Check each connector's health
  for (const connectorName of connectorNames) {
    try {
      const credential = await getCredential(
        connectorName,
        c.env.AUTH_KV,
        c.env.ENCRYPTION_KEY
      )

      if (!credential) {
        response.connectors[connectorName] = {
          status: 'unhealthy',
          error: 'Credential not found',
        }
        continue
      }

      // Currently only GitHub has health check logic
      if (connectorName === 'github') {
        response.connectors[connectorName] = await checkGitHub(
          credential.accessToken,
          deep
        )
      } else {
        // For unknown connectors, just report that credentials exist
        response.connectors[connectorName] = { status: 'healthy' }
      }
    } catch (err) {
      // Per-connector try/catch for resilience -- one failing connector
      // doesn't crash the entire status response
      response.connectors[connectorName] = {
        status: 'unhealthy',
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  const durationMs = Date.now() - startTime

  return c.json(
    wrapResponse({
      data: response,
      meta: {
        request_id: c.get('requestId'),
        connector: 'gateway',
        action: 'status',
        duration_ms: durationMs,
      },
    })
  )
})

/**
 * Check GitHub API health via /rate_limit (shallow) and optionally /user (deep).
 *
 * Shallow check: GET /rate_limit -- free, doesn't consume quota.
 * Deep check: Also GET /user to validate PAT and get authenticated identity.
 */
async function checkGitHub(
  accessToken: string,
  deep: boolean
): Promise<ConnectorStatus> {
  const authHeaders = {
    ...GITHUB_HEADERS,
    'Authorization': `Bearer ${accessToken}`,
  }

  // Shallow check: /rate_limit (free, no quota cost)
  const rateLimitResponse = await fetch(`${GITHUB_API_BASE}/rate_limit`, {
    headers: authHeaders,
  })

  if (!rateLimitResponse.ok) {
    return {
      status: 'unhealthy',
      error: `GitHub /rate_limit returned ${rateLimitResponse.status}`,
    }
  }

  const rateLimitBody = (await rateLimitResponse.json()) as {
    resources: {
      core: { remaining: number; limit: number; used: number; reset: number }
    }
  }

  const core = rateLimitBody.resources.core
  const rateLimit: RateLimitInfo = {
    remaining: core.remaining,
    limit: core.limit,
    used: core.used,
    resets_at: new Date(core.reset * 1000).toISOString(),
  }

  // Determine status based on remaining rate limit
  const status: ConnectorStatus['status'] =
    core.remaining === 0 ? 'degraded' : 'healthy'

  const result: ConnectorStatus = { status, rate_limit: rateLimit }

  // Deep check: /user to validate PAT
  if (deep) {
    try {
      const userResponse = await fetch(`${GITHUB_API_BASE}/user`, {
        headers: authHeaders,
      })

      if (userResponse.ok) {
        const userBody = (await userResponse.json()) as { login: string }
        result.authenticated_as = userBody.login
      } else {
        // PAT is invalid or lacks scope -- mark unhealthy
        result.status = 'unhealthy'
        result.error = `GitHub /user returned ${userResponse.status}`
      }
    } catch (err) {
      result.status = 'unhealthy'
      result.error = err instanceof Error ? err.message : 'User check failed'
    }
  }

  return result
}
