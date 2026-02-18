/**
 * @feelr/connector-test-utils
 *
 * Reusable SDK contract tests for Feelr connectors.
 * Import `validateConnector` in your connector's test file
 * to auto-generate compliance tests against the SDK interface.
 *
 * @example
 *   import { validateConnector } from '@feelr/connector-test-utils'
 *   import { myConnector } from '../index'
 *   validateConnector(myConnector)
 */

export { runContractTests as validateConnector } from './contract-tests'
