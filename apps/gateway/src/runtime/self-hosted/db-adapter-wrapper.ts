/**
 * Self-hosted database adapter wrapper.
 *
 * Wraps a UsageDbDO stub to implement the UsageDatabase interface.
 * The UsageDbDO exposes RPC methods (query, queryFirst, execute),
 * but the gateway expects the D1-style prepare/bind/all/first/run pattern.
 * This wrapper translates between the two patterns.
 *
 * Pattern translation:
 *   D1: db.prepare(sql).bind(...values).all()
 *   DO: stub.query(sql, ...values)
 *
 * The PreparedStatement and BoundStatement classes defer execution
 * until all/first/run is called, at which point they pass the SQL
 * and bound values to the appropriate DO RPC method.
 */

import type { UsageDatabase, PreparedStatement, BoundStatement } from '../interfaces'

/**
 * Structural type for the UsageDbDO stub's RPC methods.
 *
 * Declared locally to avoid importing the DO class (which requires
 * cloudflare:workers runtime). Matches the methods exposed by UsageDbDO.
 */
interface UsageDbStub {
  query<T>(sql: string, ...binds: unknown[]): Promise<{ results: T[] }>
  queryFirst<T>(sql: string, ...binds: unknown[]): Promise<T | null>
  execute(sql: string, ...binds: unknown[]): Promise<{ meta: { changes?: number } }>
}

/**
 * Bound statement that holds SQL + bound values, executing via DO RPC.
 */
class SelfHostedBoundStatement implements BoundStatement {
  constructor(
    private readonly stub: UsageDbStub,
    private readonly sql: string,
    private readonly values: unknown[]
  ) {}

  all<T>(): Promise<{ results: T[] }> {
    return this.stub.query<T>(this.sql, ...this.values)
  }

  first<T>(): Promise<T | null> {
    return this.stub.queryFirst<T>(this.sql, ...this.values)
  }

  run(): Promise<{ meta: { changes?: number } }> {
    return this.stub.execute(this.sql, ...this.values)
  }
}

/**
 * Prepared statement that holds SQL, producing bound statements on bind().
 *
 * Also supports direct execution (all/first/run without bind) for
 * queries with no parameters.
 */
class SelfHostedPreparedStatement implements PreparedStatement {
  constructor(
    private readonly stub: UsageDbStub,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]): BoundStatement {
    return new SelfHostedBoundStatement(this.stub, this.sql, values)
  }

  all<T>(): Promise<{ results: T[] }> {
    return this.stub.query<T>(this.sql)
  }

  first<T>(): Promise<T | null> {
    return this.stub.queryFirst<T>(this.sql)
  }

  run(): Promise<{ meta: { changes?: number } }> {
    return this.stub.execute(this.sql)
  }
}

export class SelfHostedDbAdapter implements UsageDatabase {
  constructor(private readonly stub: UsageDbStub) {}

  prepare(sql: string): PreparedStatement {
    return new SelfHostedPreparedStatement(this.stub, sql)
  }
}
