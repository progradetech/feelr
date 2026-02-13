/**
 * Credential storage and retrieval with AES-256-GCM encryption.
 *
 * Handles encrypted credential lifecycle in KV:
 *   cred:<connector> -> encrypted JSON CredentialRecord
 *
 * For refreshable tokens (has refreshToken + expiresAt), also registers
 * with the DO Token Coordinator for proactive alarm-based refresh.
 *
 * Key design:
 * - Request-path reads go directly to KV (fast, global)
 * - Refresh coordination goes through DO (single-writer guarantee)
 * - Tokens are encrypted before any KV write
 */

import { encrypt, decrypt } from './crypto'
import type { CredentialRecord } from './types'
import type { KeyValueStore } from '../runtime/interfaces'

/** KV key prefix for credential records */
const CRED_PREFIX = 'cred:'

/**
 * RPC interface for the TokenCoordinator Durable Object.
 *
 * Defined locally to avoid importing the full DO class (which depends
 * on cloudflare:workers). The actual DO implements these methods via
 * RpcTarget (DurableObject extends RpcTarget).
 */
interface TokenCoordinatorRpc {
  storeCredential(
    connector: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): Promise<void>
  removeCredential(connector: string): Promise<void>
}

/**
 * Store an encrypted credential in KV and optionally register with DO.
 *
 * The entire CredentialRecord is serialized to JSON, then encrypted with
 * AES-256-GCM before writing to KV. If the credential is refreshable
 * (has refreshToken and expiresAt), it is also registered with the DO
 * Token Coordinator for proactive alarm-based refresh.
 *
 * @param connector - Connector identifier (e.g., "github", "slack")
 * @param credential - The credential record to store
 * @param kv - KeyValueStore binding
 * @param encryptionKey - Master encryption key (Worker Secret)
 * @param tokenCoordinator - Optional DO stub for refresh registration
 */
export async function storeCredential(
  connector: string,
  credential: CredentialRecord,
  kv: KeyValueStore,
  encryptionKey: string,
  tokenCoordinator?: TokenCoordinatorRpc
): Promise<void> {
  // Encrypt the entire credential record as JSON
  const plaintext = JSON.stringify(credential)
  const encrypted = await encrypt(plaintext, encryptionKey)

  // Store encrypted blob in KV
  await kv.put(`${CRED_PREFIX}${connector}`, encrypted)

  // If refreshable, register with DO coordinator for proactive refresh
  if (tokenCoordinator && credential.refreshToken && credential.expiresAt) {
    await tokenCoordinator.storeCredential(
      connector,
      credential.accessToken,
      credential.refreshToken,
      credential.expiresAt
    )
  }
}

/**
 * Retrieve and decrypt a credential from KV.
 *
 * Reads the encrypted blob from KV, decrypts with AES-256-GCM, and
 * deserializes back to a CredentialRecord.
 *
 * @param connector - Connector identifier
 * @param kv - KeyValueStore binding
 * @param encryptionKey - Master encryption key (Worker Secret)
 * @returns Decrypted CredentialRecord or null if not found
 */
export async function getCredential(
  connector: string,
  kv: KeyValueStore,
  encryptionKey: string
): Promise<CredentialRecord | null> {
  const encrypted = await kv.get(`${CRED_PREFIX}${connector}`)
  if (!encrypted) return null

  const plaintext = await decrypt(encrypted, encryptionKey)
  return JSON.parse(plaintext) as CredentialRecord
}

/**
 * Remove a credential from KV and optionally from DO.
 *
 * Deletes the encrypted credential from KV. If a DO stub is provided,
 * also removes the credential from the Token Coordinator (stops refresh alarms).
 *
 * @param connector - Connector identifier
 * @param kv - KeyValueStore binding
 * @param tokenCoordinator - Optional DO stub for refresh deregistration
 */
export async function removeCredential(
  connector: string,
  kv: KeyValueStore,
  tokenCoordinator?: TokenCoordinatorRpc
): Promise<void> {
  // Delete from KV
  await kv.delete(`${CRED_PREFIX}${connector}`)

  // Remove from DO coordinator (stops refresh alarms)
  if (tokenCoordinator) {
    await tokenCoordinator.removeCredential(connector)
  }
}

/**
 * List all stored credential connector names.
 *
 * Returns only connector names -- no tokens, no encrypted data.
 * Uses KV list with prefix scan. Safe to expose to admin dashboards.
 *
 * @param kv - KeyValueStore binding
 * @returns Array of connector names that have stored credentials
 */
export async function listCredentials(
  kv: KeyValueStore
): Promise<string[]> {
  const listResult = await kv.list({ prefix: CRED_PREFIX })

  return listResult.keys.map((key) => key.name.slice(CRED_PREFIX.length))
}
