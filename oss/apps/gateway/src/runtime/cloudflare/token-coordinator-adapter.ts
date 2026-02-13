/**
 * Cloudflare Durable Object Token Coordinator adapter.
 *
 * Thin wrapper around DurableObjectNamespace that implements the
 * TokenCoordinatorClient interface. The real TokenCoordinator DO
 * already exposes the RPC methods matching TokenCoordinatorStub,
 * so the adapter simply obtains the stub and casts it.
 */

import type { TokenCoordinatorClient, TokenCoordinatorStub } from '../interfaces'

export class CloudflareTokenCoordinatorAdapter implements TokenCoordinatorClient {
  constructor(private readonly ns: DurableObjectNamespace) {}

  getStub(): TokenCoordinatorStub {
    const id = this.ns.idFromName('default')
    return this.ns.get(id) as unknown as TokenCoordinatorStub
  }
}
