/**
 * Self-hosted KV Store Durable Object.
 *
 * Replaces Cloudflare KV for self-hosted mode using workerd's native
 * Durable Object SQL storage (SQLite). Each method is exposed as an
 * RPC call that the adapter wrapper (created in Plan 05's factory)
 * translates from the KeyValueStore interface.
 *
 * Method names are prefixed with `kv` to avoid conflicts with
 * DurableObject base class methods (e.g., `fetch`, `alarm`).
 *
 * Storage pattern: Same as TokenCoordinator -- extends DurableObject,
 * uses this.ctx.storage.sql.exec() for queries.
 */

import { DurableObject } from 'cloudflare:workers'

/**
 * KvStoreDO provides key-value storage backed by DO SQLite.
 *
 * Schema: Single `kv` table with TEXT key (primary) and TEXT value.
 * All values are stored as strings; JSON serialization/deserialization
 * is handled at the RPC method level (kvGetJson).
 */
export class KvStoreDO extends DurableObject<Record<string, never>> {
  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env)

    // Initialize schema on first instantiation.
    // blockConcurrencyWhile ensures table exists before any RPC method runs.
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)
    })
  }

  /**
   * Get a string value by key.
   * Returns null if key does not exist.
   */
  async kvGet(key: string): Promise<string | null> {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)
      .toArray()

    if (rows.length === 0) return null
    return rows[0].value
  }

  /**
   * Get a JSON-parsed value by key.
   * Returns null if key does not exist.
   */
  async kvGetJson<T>(key: string): Promise<T | null> {
    const raw = await this.kvGet(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  }

  /**
   * Put a string value by key. Inserts or replaces existing value.
   */
  async kvPut(key: string, value: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      key,
      value
    )
  }

  /**
   * Delete a key-value pair.
   */
  async kvDelete(key: string): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM kv WHERE key = ?', key)
  }

  /**
   * List keys, optionally filtered by prefix.
   *
   * Returns { keys: Array<{ name: string }> } matching the
   * KVNamespace.list() response shape used throughout the gateway.
   */
  async kvList(prefix?: string): Promise<{ keys: Array<{ name: string }> }> {
    const rows = prefix
      ? this.ctx.storage.sql
          .exec<{ key: string }>(
            "SELECT key FROM kv WHERE key LIKE ? ORDER BY key",
            `${prefix}%`
          )
          .toArray()
      : this.ctx.storage.sql
          .exec<{ key: string }>('SELECT key FROM kv ORDER BY key')
          .toArray()

    return {
      keys: rows.map((row) => ({ name: row.key })),
    }
  }
}
