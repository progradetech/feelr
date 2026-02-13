/**
 * Self-hosted Usage Database Durable Object.
 *
 * Replaces Cloudflare D1 for self-hosted mode using workerd's native
 * Durable Object SQL storage (SQLite). Provides SQL query execution
 * via RPC methods that the adapter wrapper (created in Plan 05's factory)
 * translates from the UsageDatabase prepare/bind/all/first/run pattern.
 *
 * On construction, auto-creates the `usage` and `rate_limit_events` tables
 * with the same schemas used by the Cloudflare D1 migration, ensuring
 * the self-hosted deployment is immediately ready for analytics recording.
 *
 * Storage pattern: Same as TokenCoordinator -- extends DurableObject,
 * uses this.ctx.storage.sql.exec() for queries.
 */

import { DurableObject } from 'cloudflare:workers'

/**
 * UsageDbDO provides SQL database functionality backed by DO SQLite.
 *
 * Tables created on first instantiation:
 * - usage: API usage records (api_key_short, connector, action, etc.)
 * - rate_limit_events: 429 throttle events for dashboard analytics
 *
 * Indexes match the Cloudflare D1 schema for query performance parity.
 */
export class UsageDbDO extends DurableObject<Record<string, never>> {
  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env)

    // Initialize schema on first instantiation.
    // blockConcurrencyWhile ensures tables exist before any RPC method runs.
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_key_short TEXT NOT NULL,
          connector TEXT NOT NULL,
          action TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          timestamp TEXT NOT NULL
        )
      `)
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_usage_api_key_short ON usage(api_key_short)'
      )
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_usage_connector ON usage(connector)'
      )
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp)'
      )
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_usage_key_connector ON usage(api_key_short, connector)'
      )

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS rate_limit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_key_short TEXT NOT NULL,
          tier TEXT NOT NULL,
          ip TEXT NOT NULL,
          timestamp TEXT NOT NULL
        )
      `)
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_rle_api_key_short ON rate_limit_events(api_key_short)'
      )
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_rle_timestamp ON rate_limit_events(timestamp)'
      )
    })
  }

  /**
   * Execute a SQL query and return all matching rows.
   *
   * Maps to the D1 pattern: db.prepare(sql).bind(...).all()
   * Returns { results: T[] } matching D1's response shape.
   */
  async query<T>(sql: string, ...binds: unknown[]): Promise<{ results: T[] }> {
    const rows = this.ctx.storage.sql
      .exec<T & Record<string, SqlStorageValue>>(sql, ...binds)
      .toArray()

    return { results: rows as T[] }
  }

  /**
   * Execute a SQL query and return the first row or null.
   *
   * Maps to the D1 pattern: db.prepare(sql).bind(...).first()
   */
  async queryFirst<T>(sql: string, ...binds: unknown[]): Promise<T | null> {
    const rows = this.ctx.storage.sql
      .exec<T & Record<string, SqlStorageValue>>(sql, ...binds)
      .toArray()

    if (rows.length === 0) return null
    return rows[0] as T
  }

  /**
   * Execute a SQL statement (INSERT/UPDATE/DELETE) and return metadata.
   *
   * Maps to the D1 pattern: db.prepare(sql).bind(...).run()
   * Returns { meta: { changes?: number } } matching D1's response shape.
   */
  async execute(sql: string, ...binds: unknown[]): Promise<{ meta: { changes?: number } }> {
    this.ctx.storage.sql.exec(sql, ...binds)

    const changesRow = this.ctx.storage.sql
      .exec<{ c: number }>('SELECT changes() as c')
      .one()

    return { meta: { changes: changesRow.c } }
  }
}
