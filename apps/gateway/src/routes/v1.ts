import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../lib/types'

/**
 * Stub for v1 routes. Replaced in Task 2.
 */
const v1 = new OpenAPIHono<AppEnv>()

export const v1Routes = v1
