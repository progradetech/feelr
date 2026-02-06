/**
 * Durable Object Token Coordinator.
 *
 * Serializes token refresh operations for a single user using SQLite storage
 * and alarm-based proactive refresh scheduling. Each user gets their own DO
 * instance (DO name = user identifier), preventing cross-user bottlenecks.
 *
 * Pattern:
 * - Workers read credentials from KV for fast global reads
 * - All refresh writes go through this DO (single-writer guarantee)
 * - Alarms fire 5 minutes before token expiry for proactive refresh
 * - 3-retry exponential backoff on refresh failure, then status = 'failed'
 * - Refresh logic is stubbed pending connector implementation (Phase 3/5)
 */

import { DurableObject } from 'cloudflare:workers'
import type { TokenState } from '../auth/types'

/** Env bindings available to the Durable Object */
interface Env {
  AUTH_KV: KVNamespace
  ENCRYPTION_KEY: string
}

/** Row shape returned from the tokens SQLite table */
type TokenRow = {
  [key: string]: SqlStorageValue
  connector: string
  access_token: string
  refresh_token: string
  expires_at: number
  status: string
  retry_count: number
  last_refresh_at: number | null
  created_at: number
  updated_at: number
}

/** Buffer before expiry to trigger proactive refresh (5 minutes in ms) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Maximum retry attempts before marking token as 'failed' */
const MAX_RETRIES = 3

/** Minimum alarm scheduling delay (1 second) */
const MIN_ALARM_DELAY_MS = 1000

export class TokenCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    // Initialize SQLite schema on first instantiation.
    // blockConcurrencyWhile ensures schema is ready before any RPC method runs.
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
          connector TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_refresh_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `)
    })
  }

  /**
   * Store credentials for a connector.
   *
   * Tokens are expected to already be encrypted when passed in.
   * Resets status to 'active' and retry_count to 0.
   * Schedules alarm for proactive refresh.
   */
  async storeCredential(
    connector: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): Promise<void> {
    const now = Date.now()
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO tokens
        (connector, access_token, refresh_token, expires_at, status, retry_count, updated_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?)`,
      connector,
      accessToken,
      refreshToken,
      expiresAt,
      now
    )

    await this.scheduleNextRefresh()
  }

  /**
   * Get credentials for a connector.
   *
   * Returns null if no credentials exist for the connector.
   * If the token is within the 5-minute expiry buffer and active,
   * schedules a near-immediate alarm for proactive refresh.
   */
  async getCredential(connector: string): Promise<TokenState | null> {
    const rows = this.ctx.storage.sql
      .exec<TokenRow>('SELECT * FROM tokens WHERE connector = ?', connector)
      .toArray()

    if (rows.length === 0) return null

    const row = rows[0]

    // If within 5-minute buffer and active, trigger proactive refresh
    if (row.expires_at - Date.now() < REFRESH_BUFFER_MS && row.status === 'active') {
      await this.scheduleRefresh(connector)
    }

    return this.rowToTokenState(row)
  }

  /**
   * Remove credentials for a connector.
   *
   * Deletes the token record and reschedules alarm for remaining tokens.
   */
  async removeCredential(connector: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'DELETE FROM tokens WHERE connector = ?',
      connector
    )

    await this.scheduleNextRefresh()
  }

  /**
   * List all stored credentials (summary only, no encrypted values).
   */
  async listCredentials(): Promise<Array<{ connector: string; status: string; expiresAt: number }>> {
    const rows = this.ctx.storage.sql
      .exec<{ connector: string; status: string; expires_at: number }>(
        'SELECT connector, status, expires_at FROM tokens'
      )
      .toArray()

    return rows.map(row => ({
      connector: row.connector,
      status: row.status,
      expiresAt: row.expires_at,
    }))
  }

  /**
   * Alarm handler: proactive refresh of tokens approaching expiry.
   *
   * Finds all active tokens within the 5-minute expiry buffer
   * and attempts to refresh each one. Reschedules alarm for remaining tokens.
   */
  async alarm(): Promise<void> {
    const now = Date.now()
    const rows = this.ctx.storage.sql
      .exec<TokenRow>(
        `SELECT * FROM tokens
         WHERE status = 'active'
           AND expires_at <= ?
           AND refresh_token IS NOT NULL`,
        now + REFRESH_BUFFER_MS
      )
      .toArray()

    for (const row of rows) {
      await this.performRefresh(row)
    }

    await this.scheduleNextRefresh()
  }

  /**
   * Schedule alarm for the earliest expiring active token.
   *
   * Sets alarm for 5 minutes before the earliest expiry.
   * Clamps to at least 1 second from now.
   * If no tokens need refresh, deletes existing alarm.
   */
  private async scheduleNextRefresh(): Promise<void> {
    const result = this.ctx.storage.sql
      .exec<{ earliest: number | null }>(
        `SELECT MIN(expires_at) as earliest FROM tokens
         WHERE status = 'active' AND refresh_token IS NOT NULL`
      )
      .one()

    if (result.earliest !== null) {
      const refreshAt = result.earliest - REFRESH_BUFFER_MS
      const alarmTime = Math.max(refreshAt, Date.now() + MIN_ALARM_DELAY_MS)
      await this.ctx.storage.setAlarm(alarmTime)
    } else {
      // No tokens need refresh -- clear any existing alarm
      await this.ctx.storage.deleteAlarm()
    }
  }

  /**
   * Schedule a near-immediate alarm for refreshing a specific connector.
   *
   * Used when getCredential detects a token within the expiry buffer.
   * Sets alarm 100ms from now to trigger refresh without blocking the read.
   */
  private async scheduleRefresh(_connector: string): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + 100)
  }

  /**
   * Attempt to refresh a single token.
   *
   * After 3 failed retries, marks token status as 'failed' (not deleted).
   * On success (stubbed for Phase 2), marks token as 'active'.
   *
   * STUB: Actual OAuth refresh will be implemented in Phase 3/5 when
   * connectors provide their refresh logic. For now, logs intent and
   * sets status back to 'active'.
   */
  private async performRefresh(token: TokenRow): Promise<void> {
    const now = Date.now()

    if (token.retry_count >= MAX_RETRIES) {
      // Mark as failed after exhausting retries
      this.ctx.storage.sql.exec(
        `UPDATE tokens SET status = 'failed', updated_at = ? WHERE connector = ?`,
        now,
        token.connector
      )
      console.log(
        JSON.stringify({
          event: 'token_refresh_failed',
          connector: token.connector,
          retryCount: token.retry_count,
          timestamp: new Date(now).toISOString(),
        })
      )
      return
    }

    // Set status to 'refreshing'
    this.ctx.storage.sql.exec(
      `UPDATE tokens SET status = 'refreshing', updated_at = ? WHERE connector = ?`,
      now,
      token.connector
    )

    try {
      // STUB: Actual OAuth refresh comes in Phase 3/5.
      // Connector-specific refresh adapters will be injected here.
      // For Phase 2: log refresh intent and reset to active.
      console.log(
        JSON.stringify({
          event: 'token_refresh_stub',
          connector: token.connector,
          message: 'Refresh logic pending connector implementation',
          timestamp: new Date(now).toISOString(),
        })
      )

      // Stub success: set back to active
      this.ctx.storage.sql.exec(
        `UPDATE tokens SET status = 'active', last_refresh_at = ?, updated_at = ?
         WHERE connector = ?`,
        now,
        now,
        token.connector
      )
    } catch (err) {
      // Increment retry count with exponential backoff scheduling
      const nextRetryDelay = Math.pow(2, token.retry_count) * 1000 // 1s, 2s, 4s
      this.ctx.storage.sql.exec(
        `UPDATE tokens SET status = 'active', retry_count = retry_count + 1, updated_at = ?
         WHERE connector = ?`,
        now,
        token.connector
      )

      console.log(
        JSON.stringify({
          event: 'token_refresh_error',
          connector: token.connector,
          retryCount: token.retry_count + 1,
          nextRetryMs: nextRetryDelay,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date(now).toISOString(),
        })
      )

      // Schedule retry with exponential backoff
      await this.ctx.storage.setAlarm(now + nextRetryDelay)
    }
  }

  /**
   * Convert a SQLite row to a TokenState object.
   */
  private rowToTokenState(row: TokenRow): TokenState {
    return {
      connector: row.connector,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at,
      status: row.status as TokenState['status'],
      retryCount: row.retry_count,
      lastRefreshAt: row.last_refresh_at ?? undefined,
    }
  }
}
