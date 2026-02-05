/**
 * @feelr/connector-sdk
 *
 * Public API for the Feelr Connector SDK.
 * All connector implementations and the gateway import from this package.
 */

// Connector and action interfaces
export type {
  ConnectorDefinition,
  ActionDefinition,
  ActionContext,
  ActionResult,
  ParamDefinition,
} from './types'

// Response envelope types
export type {
  FeelrResponse,
  FeelrErrorResponse,
  ResponseMeta,
} from './envelope'

// Error types and class
export type { ErrorCode, Hint, FeelrHttpStatus, FeelrErrorOptions } from './errors'
export { FeelrError } from './errors'

// Zod validation schemas
export {
  responseMetaSchema,
  errorSchema,
  successResponseSchema,
  errorResponseSchema,
} from './validation'
