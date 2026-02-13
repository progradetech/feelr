/**
 * Cloudflare KV adapter.
 *
 * Thin wrapper around KVNamespace that implements the KeyValueStore interface.
 * All methods delegate directly to the underlying KVNamespace binding with
 * zero additional logic.
 */

import type { KeyValueStore } from '../interfaces'

export class CloudflareKvAdapter implements KeyValueStore {
  constructor(private readonly kv: KVNamespace) {}

  get(key: string): Promise<string | null>
  get<T>(key: string, type: 'json'): Promise<T | null>
  get<T>(key: string, type?: 'json'): Promise<string | T | null> {
    if (type === 'json') {
      return this.kv.get<T>(key, 'json')
    }
    return this.kv.get(key)
  }

  put(key: string, value: string): Promise<void> {
    return this.kv.put(key, value)
  }

  delete(key: string): Promise<void> {
    return this.kv.delete(key)
  }

  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    return this.kv.list(options)
  }
}
