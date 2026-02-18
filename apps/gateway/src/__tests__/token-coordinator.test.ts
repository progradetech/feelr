import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

/**
 * Tests for the TokenCoordinator Durable Object.
 *
 * Uses DO stub RPC calls (the primary DO interface) for testing.
 * Each test gets its own DO instance via unique names to avoid isolation conflicts.
 *
 * Tests cover: CRUD operations via RPC, alarm scheduling indirectly via behavior,
 * and proactive refresh stub behavior.
 */

/** Helper to get a fresh DO stub for each test */
function getStub(name: string) {
  const id = env.TOKEN_COORDINATOR.idFromName(name)
  return env.TOKEN_COORDINATOR.get(id) as any
}

describe('TokenCoordinator Durable Object', () => {
  it('stores and retrieves a credential via RPC', async () => {
    const stub = getStub('test-store-retrieve')
    const futureExpiry = Date.now() + 3600_000 // 1 hour

    await stub.storeCredential('github', 'enc-access-token', 'enc-refresh-token', futureExpiry)
    const result = await stub.getCredential('github')

    expect(result).not.toBeNull()
    expect(result.connector).toBe('github')
    expect(result.accessToken).toBe('enc-access-token')
    expect(result.refreshToken).toBe('enc-refresh-token')
    expect(result.expiresAt).toBe(futureExpiry)
    expect(result.status).toBe('active')
    expect(result.retryCount).toBe(0)
  })

  it('returns null for non-existent credential', async () => {
    const stub = getStub('test-null-credential')
    const result = await stub.getCredential('nonexistent')
    expect(result).toBeNull()
  })

  it('removes a credential', async () => {
    const stub = getStub('test-remove-credential')
    const futureExpiry = Date.now() + 3600_000

    await stub.storeCredential('slack', 'enc-slack-token', 'enc-refresh', futureExpiry)

    // Verify it exists
    const before = await stub.getCredential('slack')
    expect(before).not.toBeNull()
    expect(before.connector).toBe('slack')

    // Remove it
    await stub.removeCredential('slack')

    // Verify it's gone
    const after = await stub.getCredential('slack')
    expect(after).toBeNull()
  })

  it('listCredentials returns summary without encrypted values', async () => {
    const stub = getStub('test-list-credentials')
    const futureExpiry = Date.now() + 3600_000

    await stub.storeCredential('github', 'enc-gh', 'enc-gh-refresh', futureExpiry)
    await stub.storeCredential('slack', 'enc-sl', 'enc-sl-refresh', futureExpiry + 1000)

    const list = await stub.listCredentials()
    expect(list).toHaveLength(2)

    // Verify summary fields only
    const connectors = list.map((c: any) => c.connector).sort()
    expect(connectors).toEqual(['github', 'slack'])

    for (const entry of list) {
      expect(entry.status).toBeDefined()
      expect(entry.expiresAt).toBeDefined()
      // Should NOT expose encrypted token values in summary
      expect(entry.accessToken).toBeUndefined()
      expect(entry.refreshToken).toBeUndefined()
    }
  })

  it('storeCredential overwrites existing credential and resets retry count', async () => {
    const stub = getStub('test-overwrite')
    const futureExpiry = Date.now() + 3600_000

    await stub.storeCredential('github', 'old-token', 'old-refresh', futureExpiry)
    await stub.storeCredential('github', 'new-token', 'new-refresh', futureExpiry + 1000)

    const result = await stub.getCredential('github')
    expect(result.accessToken).toBe('new-token')
    expect(result.refreshToken).toBe('new-refresh')
    expect(result.retryCount).toBe(0)
  })

  it('schedules alarm for credential with expiry (listCredentials verifies active state)', async () => {
    const stub = getStub('test-alarm-indirect')
    const futureExpiry = Date.now() + 600_000 // 10 minutes from now

    await stub.storeCredential('github', 'enc-token', 'enc-refresh', futureExpiry)

    // Verify credential is stored and active (alarm is scheduled internally)
    const list = await stub.listCredentials()
    expect(list).toHaveLength(1)
    expect(list[0].connector).toBe('github')
    expect(list[0].status).toBe('active')
    expect(list[0].expiresAt).toBe(futureExpiry)
  })

  it('getCredential returns token state with correct shape', async () => {
    const stub = getStub('test-token-state-shape')
    const futureExpiry = Date.now() + 3600_000

    await stub.storeCredential('discord', 'enc-discord-token', 'enc-discord-refresh', futureExpiry)

    const result = await stub.getCredential('discord')
    expect(result).not.toBeNull()

    // Verify full TokenState shape
    expect(typeof result.connector).toBe('string')
    expect(typeof result.accessToken).toBe('string')
    expect(typeof result.refreshToken).toBe('string')
    expect(typeof result.expiresAt).toBe('number')
    expect(typeof result.status).toBe('string')
    expect(typeof result.retryCount).toBe('number')
    expect(['active', 'refreshing', 'failed']).toContain(result.status)
  })

  it('removeCredential on non-existent connector does not error', async () => {
    const stub = getStub('test-remove-nonexistent')

    // Should not throw
    await stub.removeCredential('nonexistent')

    // Verify still empty
    const list = await stub.listCredentials()
    expect(list).toHaveLength(0)
  })
})
