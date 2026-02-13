/**
 * Feelr Gateway -- Self-hosted workerd entry point.
 *
 * Separate Worker entry point for self-hosted mode that:
 * 1. Creates self-hosted adapters from DO stubs
 * 2. Creates singleton InMemoryRateLimiters from config
 * 3. Wraps TOKEN_COORDINATOR as TokenCoordinatorClient
 * 4. Builds adapted env and passes to Hono app.fetch()
 * 5. Falls back to dashboard static files on 404
 *
 * Rate limiters are singletons (created once per worker isolate, survive
 * across requests). DO stubs are created per-request (cheap ID lookup).
 *
 * Exports DO classes so workerd can instantiate them from the same module.
 */

import app from './app'
import { handleScheduled } from './scheduled'
import { loadConfigFromObject } from './runtime/config'
import type { FeelrYamlConfig } from './runtime/config'
import { SelfHostedKvAdapter } from './runtime/self-hosted/kv-adapter-wrapper'
import { SelfHostedDbAdapter } from './runtime/self-hosted/db-adapter-wrapper'
import { InMemoryRateLimiter } from './runtime/self-hosted/rate-limiter'
import type { AppEnv } from './lib/types'
import type { TokenCoordinatorClient, TokenCoordinatorStub, FeelrConfig } from './runtime/interfaces'

// Re-export DO classes for workerd to instantiate
export { TokenCoordinator } from './durable-objects/token-coordinator'
export { KvStoreDO } from './runtime/self-hosted/kv-store-do'
export { UsageDbDO } from './runtime/self-hosted/usage-db-do'

/**
 * Raw environment bindings provided by workerd capnp config.
 *
 * These are the bindings defined in config.capnp, not yet wrapped
 * in adapter classes.
 */
interface SelfHostedRawEnv {
  /** RUNTIME = "self-hosted" text binding */
  RUNTIME: string
  /** FEELR_CONFIG -- JSON string of parsed feelr.yaml */
  FEELR_CONFIG?: string
  /** DurableObjectNamespace for KvStoreDO */
  KV_STORE: DurableObjectNamespace
  /** DurableObjectNamespace for UsageDbDO */
  USAGE_DB_DO: DurableObjectNamespace
  /** DurableObjectNamespace for TokenCoordinator */
  TOKEN_COORDINATOR: DurableObjectNamespace
  /** Service binding for dashboard static files */
  DASHBOARD?: { fetch(request: Request): Promise<Response> }
  /** Worker secrets / text bindings */
  ENCRYPTION_KEY: string
  ADMIN_TOKEN: string
  SLACK_CLIENT_ID: string
  SLACK_CLIENT_SECRET: string
  /** Environment variable overrides */
  FEELR_AUTO_MIGRATE?: string
  FEELR_PORT?: string
  ENVIRONMENT?: string
}

// ---------------------------------------------------------------------------
// Singleton rate limiters (survive across requests within the same isolate)
// ---------------------------------------------------------------------------

let rateLimiters: {
  free: InMemoryRateLimiter
  pro: InMemoryRateLimiter
  enterprise: InMemoryRateLimiter
  ip: InMemoryRateLimiter
} | null = null

/**
 * Get or create singleton rate limiters from config.
 * Created once per worker isolate lifetime.
 */
function getRateLimiters(config: FeelrYamlConfig) {
  if (rateLimiters) return rateLimiters

  rateLimiters = {
    free: new InMemoryRateLimiter(config.rate_limits.free.requests_per_minute, 60),
    pro: new InMemoryRateLimiter(config.rate_limits.pro.requests_per_minute, 60),
    enterprise: new InMemoryRateLimiter(config.rate_limits.enterprise.requests_per_minute, 60),
    ip: new InMemoryRateLimiter(config.rate_limits.ip.requests_per_10s, 10),
  }

  return rateLimiters
}

/**
 * Create a TokenCoordinatorClient from a DurableObjectNamespace.
 *
 * Abstracts the idFromName('default') + get(id) pattern into a
 * single getStub() call matching the TokenCoordinatorClient interface.
 */
function createTokenCoordinatorClient(ns: DurableObjectNamespace): TokenCoordinatorClient {
  return {
    getStub(): TokenCoordinatorStub {
      const id = ns.idFromName('default')
      return ns.get(id) as unknown as TokenCoordinatorStub
    },
  }
}

/**
 * Build adapted env from raw self-hosted bindings.
 *
 * Creates DO stubs, wraps them in adapter classes, and assembles
 * the complete AppEnv['Bindings'] object expected by the Hono app.
 */
function buildAdaptedEnv(rawEnv: SelfHostedRawEnv, config: FeelrYamlConfig): AppEnv['Bindings'] {
  // Create DO stubs (per-request, cheap ID lookup)
  const kvStoreId = rawEnv.KV_STORE.idFromName('default')
  const kvStoreStub = rawEnv.KV_STORE.get(kvStoreId)

  const usageDbId = rawEnv.USAGE_DB_DO.idFromName('default')
  const usageDbStub = rawEnv.USAGE_DB_DO.get(usageDbId)

  // Get singleton rate limiters
  const limiters = getRateLimiters(config)

  // Build FeelrConfig for runtime feature toggles
  const feelrConfig: FeelrConfig = {
    runtime: 'self-hosted',
    billing: { enabled: config.billing.enabled },
    encryption: { enabled: config.encryption.enabled },
  }

  return {
    ENVIRONMENT: rawEnv.ENVIRONMENT ?? 'self-hosted',
    // DO stubs expose RPC methods matching the structural interfaces
    // used by SelfHostedKvAdapter and SelfHostedDbAdapter constructors
    AUTH_KV: new SelfHostedKvAdapter(kvStoreStub as never),
    TOKEN_COORDINATOR: createTokenCoordinatorClient(rawEnv.TOKEN_COORDINATOR),
    ENCRYPTION_KEY: rawEnv.ENCRYPTION_KEY,
    ADMIN_TOKEN: rawEnv.ADMIN_TOKEN,
    SLACK_CLIENT_ID: rawEnv.SLACK_CLIENT_ID ?? '',
    SLACK_CLIENT_SECRET: rawEnv.SLACK_CLIENT_SECRET ?? '',
    USAGE_DB: new SelfHostedDbAdapter(usageDbStub as never),
    RATE_LIMIT_FREE: limiters.free,
    RATE_LIMIT_PRO: limiters.pro,
    RATE_LIMIT_ENTERPRISE: limiters.enterprise,
    RATE_LIMIT_IP: limiters.ip,
    FEELR_CONFIG: feelrConfig,
  }
}

/** Content-type map for static assets */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
}

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf('.'))
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * Serve dashboard static files with proper content types.
 * Strategy:
 * 1. Try exact path match (for /_next/*, static assets with extensions)
 * 2. Try path + .html (Next.js static export: /keys -> keys.html)
 * 3. Fall back to /index.html (SPA client-side routing)
 */
async function serveDashboard(
  dashboard: { fetch(request: Request): Promise<Response> },
  request: Request,
  url: URL,
): Promise<Response> {
  const hasExtension = url.pathname.includes('.') && !url.pathname.endsWith('/')

  if (hasExtension) {
    // Static asset request (/_next/static/..., /favicon.ico, etc.)
    const res = await dashboard.fetch(request)
    if (res.status !== 404) {
      return new Response(res.body, {
        status: res.status,
        headers: { 'Content-Type': getContentType(url.pathname) },
      })
    }
  } else {
    // Page route: try appending .html (Next.js static export pattern)
    const htmlPath = url.pathname === '/' ? '/index.html' : `${url.pathname.replace(/\/$/, '')}.html`
    const htmlRequest = new Request(new URL(htmlPath, request.url).toString())
    const res = await dashboard.fetch(htmlRequest)
    if (res.status !== 404) {
      return new Response(res.body, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
  }

  // Final fallback: serve index.html for SPA routing
  const indexRequest = new Request(new URL('/index.html', request.url).toString())
  const res = await dashboard.fetch(indexRequest)
  return new Response(res.body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export default {
  async fetch(request: Request, rawEnv: SelfHostedRawEnv, ctx: ExecutionContext): Promise<Response> {
    // Load config from FEELR_CONFIG JSON binding (converted from YAML by Docker entrypoint)
    const configObj = rawEnv.FEELR_CONFIG ? JSON.parse(rawEnv.FEELR_CONFIG) : {}
    const config = loadConfigFromObject(configObj, {
      FEELR_AUTO_MIGRATE: rawEnv.FEELR_AUTO_MIGRATE,
      FEELR_PORT: rawEnv.FEELR_PORT,
    })

    const adaptedEnv = buildAdaptedEnv(rawEnv, config)

    // Delegate to Hono app with adapted bindings
    const response = await app.fetch(request, adaptedEnv, ctx)

    // 404 fallback to dashboard static files (SPA routing)
    if (response.status === 404 && rawEnv.DASHBOARD) {
      const url = new URL(request.url)
      // Only fallback for non-API routes
      if (
        !url.pathname.startsWith('/v1/') &&
        !url.pathname.startsWith('/admin/') &&
        !url.pathname.startsWith('/internal/')
      ) {
        return serveDashboard(rawEnv.DASHBOARD, request, url)
      }
    }

    return response
  },

  async scheduled(event: ScheduledEvent, rawEnv: SelfHostedRawEnv, ctx: ExecutionContext): Promise<void> {
    const configObj = rawEnv.FEELR_CONFIG ? JSON.parse(rawEnv.FEELR_CONFIG) : {}
    const config = loadConfigFromObject(configObj)

    const adaptedEnv = buildAdaptedEnv(rawEnv, config)
    await handleScheduled(event, adaptedEnv, ctx)
  },
}
