/**
 * Non-blocking D1 usage recording middleware.
 *
 * Records API usage data to D1 for dashboard analytics.
 * All errors are silently caught -- usage recording is best-effort
 * and must never fail the parent request.
 */

/**
 * Shape of a single usage row inserted into D1.
 */
export interface UsageRecord {
  api_key_short: string
  connector: string
  action: string
  status_code: number
  duration_ms: number
  timestamp: string
}

/**
 * D1 table schema for the usage table.
 * Exported for reference and migration tooling.
 */
export const USAGE_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_short TEXT NOT NULL,
  connector TEXT NOT NULL,
  action TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_api_key_short ON usage(api_key_short);
CREATE INDEX IF NOT EXISTS idx_usage_connector ON usage(connector);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_key_connector ON usage(api_key_short, connector);
`.trim()

/**
 * Insert a usage record into D1. Best-effort -- all errors are silently caught.
 *
 * Designed to be called via `c.executionCtx.waitUntil(recordUsage(...))` so it
 * never blocks the response to the caller.
 *
 * @param db - D1Database binding (USAGE_DB)
 * @param record - Usage data to record
 */
export async function recordUsage(
  db: D1Database,
  record: UsageRecord
): Promise<void> {
  try {
    await db
      .prepare(
        'INSERT INTO usage (api_key_short, connector, action, status_code, duration_ms, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        record.api_key_short,
        record.connector,
        record.action,
        record.status_code,
        record.duration_ms,
        record.timestamp
      )
      .run()
  } catch {
    // Silently swallow errors -- usage recording is best-effort.
    // Common failure: table not yet created (first deploy before migration).
  }
}
