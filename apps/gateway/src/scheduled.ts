/**
 * Cron Trigger handler for data retention.
 *
 * Runs daily at 3am UTC to clean up usage and rate limit event data older
 * than 90 days from the USAGE_DB D1 database.
 *
 * Retention policy:
 * - usage rows with timestamp < (now - 90 days) are deleted
 * - rate_limit_events rows with timestamp < (now - 90 days) are deleted
 *
 * Errors are caught gracefully -- a partial failure in one table does not
 * prevent cleanup of the other.
 */
import type { AppEnv } from './lib/types'

/** Number of days to retain usage and rate limit event data. */
const RETENTION_DAYS = 90

export async function handleScheduled(
  _event: ScheduledEvent,
  env: AppEnv['Bindings'],
  _ctx: ExecutionContext
): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  console.log(`Retention cleanup: deleting data older than ${RETENTION_DAYS} days (cutoff: ${cutoff})`)

  // Delete old usage rows
  try {
    const usageResult = await env.USAGE_DB
      .prepare('DELETE FROM usage WHERE timestamp < ?')
      .bind(cutoff)
      .run()
    console.log(`Retention: deleted ${usageResult.meta.changes ?? 0} usage rows`)
  } catch (err) {
    // Table may not exist yet (pre-migration) or other D1 error -- log and continue
    console.error('Retention: failed to clean usage table:', err)
  }

  // Delete old rate limit event rows
  try {
    const rleResult = await env.USAGE_DB
      .prepare('DELETE FROM rate_limit_events WHERE timestamp < ?')
      .bind(cutoff)
      .run()
    console.log(`Retention: deleted ${rleResult.meta.changes ?? 0} rate_limit_events rows`)
  } catch (err) {
    // Table may not exist yet or other D1 error -- log and continue
    console.error('Retention: failed to clean rate_limit_events table:', err)
  }

  console.log('Retention cleanup complete')
}
