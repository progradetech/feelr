import { z } from 'zod'

/**
 * Zod schema for response metadata.
 * Matches the ResponseMeta interface.
 */
export const responseMetaSchema = z.object({
  request_id: z.string(),
  connector: z.string(),
  action: z.string(),
  duration_ms: z.number(),
  cursor: z.string().optional(),
  has_more: z.boolean().optional(),
}).strict()

/**
 * Zod schema for the error object in error responses.
 */
export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.string().optional(),
  hint: z.enum(['retry', 'auth', 'abort']),
  status: z.number(),
}).strict()

/**
 * Zod schema for successful responses.
 * Uses z.unknown() for the generic data field.
 */
export const successResponseSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
  meta: responseMetaSchema,
}).strict()

/**
 * Zod schema for error responses.
 */
export const errorResponseSchema = z.object({
  ok: z.literal(false),
  error: errorSchema,
}).strict()
