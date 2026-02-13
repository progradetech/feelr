/**
 * Self-hosted KV adapter wrapper.
 *
 * Wraps a KvStoreDO stub to implement the KeyValueStore interface.
 * The KvStoreDO exposes RPC methods (kvGet, kvPut, kvDelete, kvList),
 * but the gateway expects the KeyValueStore interface (get, put, delete, list).
 * This wrapper translates between the two naming conventions.
 *
 * In self-hosted mode, a single KvStoreDO instance (accessed via DO namespace)
 * replaces Cloudflare KV. The wrapper is created per-request with a fresh
 * stub obtained from the DO namespace.
 */

import type { KeyValueStore } from '../interfaces'

/**
 * Structural type for the KvStoreDO stub's RPC methods.
 *
 * Declared locally to avoid importing the DO class (which requires
 * cloudflare:workers runtime). Matches the methods exposed by KvStoreDO.
 */
interface KvStoreStub {
  kvGet(key: string): Promise<string | null>
  kvGetJson<T>(key: string): Promise<T | null>
  kvPut(key: string, value: string): Promise<void>
  kvDelete(key: string): Promise<void>
  kvList(prefix?: string): Promise<{ keys: Array<{ name: string }> }>
}

export class SelfHostedKvAdapter implements KeyValueStore {
  constructor(private readonly stub: KvStoreStub) {}

  get(key: string): Promise<string | null>
  get<T>(key: string, type: 'json'): Promise<T | null>
  get<T>(key: string, type?: 'json'): Promise<string | T | null> {
    if (type === 'json') {
      return this.stub.kvGetJson<T>(key)
    }
    return this.stub.kvGet(key)
  }

  put(key: string, value: string): Promise<void> {
    return this.stub.kvPut(key, value)
  }

  delete(key: string): Promise<void> {
    return this.stub.kvDelete(key)
  }

  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    return this.stub.kvList(options?.prefix)
  }
}
