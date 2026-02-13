/**
 * Refresh adapters for OAuth token refresh.
 *
 * Each adapter knows how to exchange a refresh token for a new access token
 * with a specific provider. Used by the DO Token Coordinator during proactive
 * alarm-based token refresh.
 *
 * Only Slack uses OAuth refresh -- GitHub uses PATs (no expiry), Stripe uses
 * API keys (no expiry), Discord uses bot tokens (no expiry).
 */

/** Refresh adapter interface for provider-specific token refresh logic */
export interface RefreshAdapter {
  provider: string
  refresh(
    refreshToken: string,
    env: Record<string, string>
  ): Promise<{
    accessToken: string
    refreshToken: string
    expiresAt: number
  }>
}

/**
 * Slack OAuth refresh adapter.
 *
 * Slack token rotation uses oauth.v2.access with grant_type=refresh_token.
 * Requires SLACK_CLIENT_ID and SLACK_CLIENT_SECRET from env.
 *
 * Note: Slack returns HTTP 200 for all responses -- must check json.ok field.
 */
const slackRefreshAdapter: RefreshAdapter = {
  provider: 'slack',
  async refresh(refreshToken, env) {
    const body = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const json = (await response.json()) as {
      ok: boolean
      access_token?: string
      refresh_token?: string
      expires_in?: number
      error?: string
    }

    if (!json.ok) {
      throw new Error(`Slack token refresh failed: ${json.error ?? 'unknown error'}`)
    }

    if (!json.access_token || !json.refresh_token || !json.expires_in) {
      throw new Error('Slack token refresh response missing required fields')
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    }
  },
}

/** Registry of refresh adapters by provider name */
const adapters = new Map<string, RefreshAdapter>([
  ['slack', slackRefreshAdapter],
])

/**
 * Get the refresh adapter for a provider.
 *
 * Returns null for providers that don't support token refresh
 * (GitHub, Stripe, Discord -- their tokens don't expire).
 *
 * @param provider - Provider name (e.g., 'slack')
 * @returns RefreshAdapter or null if provider doesn't support refresh
 */
export function getRefreshAdapter(provider: string): RefreshAdapter | null {
  return adapters.get(provider) ?? null
}
