/**
 * Gateway error utilities.
 * Re-exports FeelrError and related types from @feelr/connector-sdk
 * so gateway modules import from one place.
 */
export { FeelrError } from '@feelr/connector-sdk'
export type { ErrorCode, Hint, FeelrHttpStatus, FeelrErrorOptions } from '@feelr/connector-sdk'
