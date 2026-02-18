/**
 * Internal routes for dashboard data aggregation.
 *
 * All routes require admin authentication (Bearer token).
 * These endpoints power the dashboard UI with:
 * - /overview: Key counts, connected services, recent usage sparkline
 * - /usage: Time-bucketed usage data with filtering
 * - /rate-limits: Per-key rate limit status (tier, limit, usage, throttle count)
 *
 * Data sources: AUTH_KV (keys/credentials), USAGE_DB D1 (usage analytics).
 */

import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { adminAuthMiddleware } from '../middleware/admin-auth'
import { listCredentials } from '../auth/credentials'
import type { ApiKeyRecord } from '../auth/types'
import { TIER_LIMITS } from '../auth/types'
import type { UsageDatabase } from '../runtime/interfaces'

const internal = new Hono<AppEnv>()

// All internal routes require admin auth
internal.use('*', adminAuthMiddleware)

/**
 * GET /overview
 *
 * Returns aggregated overview data for the dashboard home:
 * - total_keys: Number of registered API keys
 * - connected_services: Number of connectors with stored credentials
 * - recent_usage: Total requests in last 24h + hourly breakdown for sparkline
 */
internal.get('/overview', async (c) => {
  const [keysResult, connectedServices, usageData] = await Promise.all([
    // Count total API keys
    c.env.AUTH_KV.list({ prefix: 'apikey:' }),

    // Count connected services (connectors with stored credentials)
    listCredentials(c.env.AUTH_KV),

    // Query recent usage from D1 (last 24h hourly breakdown)
    getRecentUsage(c.env.USAGE_DB),
  ])

  return c.json({
    ok: true,
    data: {
      total_keys: keysResult.keys.length,
      connected_services: connectedServices.length,
      recent_usage: usageData,
    },
  })
})

/**
 * GET /usage
 *
 * Returns time-bucketed usage data filterable by:
 * - key: API key short token filter
 * - connector: Connector name filter
 * - window: Time bucket size (hour|day|month), default 'day'
 * - from: Start of time range (ISO timestamp)
 * - to: End of time range (ISO timestamp)
 *
 * Returns bucketed data with total_requests, error_count, avg_duration_ms.
 */
internal.get('/usage', async (c) => {
  const key = c.req.query('key')
  const connector = c.req.query('connector')
  const window = c.req.query('window') ?? 'day'
  const from = c.req.query('from')
  const to = c.req.query('to')

  // Validate window parameter
  if (!['hour', 'day', 'month'].includes(window)) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: 'window must be one of: hour, day, month',
        },
      },
      400
    )
  }

  const buckets = await getUsageBuckets(c.env.USAGE_DB, {
    key,
    connector,
    window: window as 'hour' | 'day' | 'month',
    from,
    to,
  })

  return c.json({
    ok: true,
    data: {
      window,
      buckets,
      filters: {
        key: key ?? null,
        connector: connector ?? null,
      },
    },
  })
})

/**
 * GET /rate-limits
 *
 * Returns per-key rate limit status for the dashboard:
 * - tier: The key's rate limit tier (free/pro/enterprise)
 * - limit: Requests-per-minute for that tier
 * - usage_1m: Number of requests in the last 60 seconds
 * - throttle_24h: Number of rate limit events in the last 24 hours
 *
 * Optional ?key= filter to get data for a single API key.
 */
internal.get('/rate-limits', async (c) => {
  const keyFilter = c.req.query('key')

  // List all API keys from KV
  const keysList = await c.env.AUTH_KV.list({ prefix: 'apikey:' })

  // Build rate limit data for each key
  const data: Array<{
    api_key_short: string
    label: string | null
    tier: string
    limit: number
    usage_1m: number
    throttle_24h: number
  }> = []

  for (const kvKey of keysList.keys) {
    const shortToken = kvKey.name.replace('apikey:', '')

    // Apply optional filter
    if (keyFilter && shortToken !== keyFilter) {
      continue
    }

    // Read key record to get tier
    const raw = await c.env.AUTH_KV.get(kvKey.name)
    if (!raw) continue

    let record: ApiKeyRecord
    try {
      record = JSON.parse(raw) as ApiKeyRecord
    } catch {
      continue
    }

    const tier = record.tier ?? 'free'
    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free

    // Query usage in last 60 seconds from D1
    const usage1m = await getUsageCount(c.env.USAGE_DB, shortToken, '-60 seconds')

    // Query throttle events in last 24 hours from D1
    const throttle24h = await getThrottleCount(c.env.USAGE_DB, shortToken, '-24 hours')

    data.push({
      api_key_short: shortToken,
      label: record.label ?? null,
      tier,
      limit,
      usage_1m: usage1m,
      throttle_24h: throttle24h,
    })
  }

  return c.json({
    ok: true,
    data,
  })
})

// --- Internal helpers ---

/**
 * Query D1 for recent usage summary (last 24 hours, hourly buckets).
 * Returns empty data if table doesn't exist yet.
 */
async function getRecentUsage(
  db: UsageDatabase
): Promise<{ total_24h: number; hourly: Array<{ hour: string; count: number }> }> {
  try {
    const result = await db
      .prepare(
        `SELECT strftime('%Y-%m-%dT%H:00:00Z', timestamp) as hour, COUNT(*) as count
         FROM usage
         WHERE timestamp >= datetime('now', '-24 hours')
         GROUP BY hour
         ORDER BY hour`
      )
      .all<{ hour: string; count: number }>()

    const hourly = result.results ?? []
    const total_24h = hourly.reduce((sum, row) => sum + row.count, 0)

    return { total_24h, hourly }
  } catch {
    // Table may not exist yet (first deploy before migration)
    return { total_24h: 0, hourly: [] }
  }
}

interface UsageQueryOptions {
  key?: string
  connector?: string
  window: 'hour' | 'day' | 'month'
  from?: string
  to?: string
}

interface UsageBucket {
  time_bucket: string
  total_requests: number
  error_count: number
  avg_duration_ms: number
}

/**
 * Query D1 for time-bucketed usage data with optional filters.
 * Returns empty array if table doesn't exist yet.
 */
async function getUsageBuckets(
  db: UsageDatabase,
  options: UsageQueryOptions
): Promise<UsageBucket[]> {
  try {
    // Determine strftime format based on window
    const formatMap: Record<string, string> = {
      hour: '%Y-%m-%dT%H:00:00Z',
      day: '%Y-%m-%d',
      month: '%Y-%m',
    }
    const timeFormat = formatMap[options.window]

    // Determine default time range
    const defaultRangeMap: Record<string, string> = {
      hour: '-24 hours',
      day: '-30 days',
      month: '-12 months',
    }

    // Build WHERE clauses dynamically
    const conditions: string[] = []
    const binds: (string | number)[] = []

    if (options.from) {
      conditions.push('timestamp >= ?')
      binds.push(options.from)
    } else {
      conditions.push(`timestamp >= datetime('now', '${defaultRangeMap[options.window]}')`)
    }

    if (options.to) {
      conditions.push('timestamp <= ?')
      binds.push(options.to)
    }

    if (options.key) {
      conditions.push('api_key_short = ?')
      binds.push(options.key)
    }

    if (options.connector) {
      conditions.push('connector = ?')
      binds.push(options.connector)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const sql = `
      SELECT
        strftime('${timeFormat}', timestamp) as time_bucket,
        COUNT(*) as total_requests,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
        CAST(AVG(duration_ms) AS INTEGER) as avg_duration_ms
      FROM usage
      ${whereClause}
      GROUP BY time_bucket
      ORDER BY time_bucket
    `

    const stmt = db.prepare(sql)
    const result =
      binds.length > 0
        ? await stmt.bind(...binds).all<UsageBucket>()
        : await stmt.all<UsageBucket>()

    return result.results ?? []
  } catch {
    // Table may not exist yet (first deploy before migration)
    return []
  }
}

/**
 * Count usage records for a specific API key within a time window.
 * Returns 0 if table doesn't exist yet.
 */
async function getUsageCount(
  db: UsageDatabase,
  apiKeyShort: string,
  windowOffset: string
): Promise<number> {
  try {
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count FROM usage
         WHERE api_key_short = ? AND timestamp >= datetime('now', ?)`
      )
      .bind(apiKeyShort, windowOffset)
      .first<{ count: number }>()
    return result?.count ?? 0
  } catch {
    return 0
  }
}

/**
 * Count rate limit (throttle) events for a specific API key within a time window.
 * Returns 0 if table doesn't exist yet.
 */
async function getThrottleCount(
  db: UsageDatabase,
  apiKeyShort: string,
  windowOffset: string
): Promise<number> {
  try {
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count FROM rate_limit_events
         WHERE api_key_short = ? AND timestamp >= datetime('now', ?)`
      )
      .bind(apiKeyShort, windowOffset)
      .first<{ count: number }>()
    return result?.count ?? 0
  } catch {
    return 0
  }
}

export const internalRoutes = internal
