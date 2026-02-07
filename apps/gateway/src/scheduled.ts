/**
 * Cron Trigger handler for data retention.
 * Runs daily at 3am UTC to clean up usage and rate limit event data older than 90 days.
 * Actual retention logic added in Plan 07-04.
 */
import type { AppEnv } from './lib/types'

export async function handleScheduled(
  _event: ScheduledEvent,
  env: AppEnv['Bindings'],
  _ctx: ExecutionContext
): Promise<void> {
  // Retention cleanup -- implemented in Plan 07-04
  console.log('Scheduled retention cleanup triggered')
}
