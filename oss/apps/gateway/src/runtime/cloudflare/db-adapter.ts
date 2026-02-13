/**
 * Cloudflare D1 database adapter.
 *
 * Thin wrapper around D1Database that implements the UsageDatabase interface.
 * PreparedStatement and BoundStatement wrappers delegate directly to D1
 * with zero additional logic.
 */

import type { UsageDatabase, PreparedStatement, BoundStatement } from '../interfaces'

class CloudflareBoundStatement implements BoundStatement {
  constructor(private readonly stmt: D1PreparedStatement) {}

  all<T>(): Promise<{ results: T[] }> {
    return this.stmt.all<T>()
  }

  first<T>(): Promise<T | null> {
    return this.stmt.first<T>()
  }

  run(): Promise<{ meta: { changes?: number } }> {
    return this.stmt.run()
  }
}

class CloudflarePreparedStatement implements PreparedStatement {
  constructor(private readonly stmt: D1PreparedStatement) {}

  bind(...values: unknown[]): BoundStatement {
    return new CloudflareBoundStatement(this.stmt.bind(...values))
  }

  all<T>(): Promise<{ results: T[] }> {
    return this.stmt.all<T>()
  }

  first<T>(): Promise<T | null> {
    return this.stmt.first<T>()
  }

  run(): Promise<{ meta: { changes?: number } }> {
    return this.stmt.run()
  }
}

export class CloudflareDbAdapter implements UsageDatabase {
  constructor(private readonly db: D1Database) {}

  prepare(sql: string): PreparedStatement {
    return new CloudflarePreparedStatement(this.db.prepare(sql))
  }
}
