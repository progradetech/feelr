/**
 * SDK Contract Tests
 *
 * Validates that a ConnectorDefinition conforms to the Feelr Connector SDK
 * interface rules. These tests are auto-generated from the connector definition
 * and verify naming conventions, type correctness, and structural completeness.
 *
 * Usage in a connector's test file:
 *
 *   import { validateConnector } from '@feelr/connector-test-utils'
 *   import { myConnector } from '../index'
 *   validateConnector(myConnector)
 */

import { describe, it, expect } from 'vitest'
import type { ConnectorDefinition, ActionDefinition } from '@feelr/connector-sdk'

const VALID_NAME_PATTERN = /^[a-z][a-z0-9-]*$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+/
const VALID_AUTH_TYPES = new Set(['api_key', 'oauth2', 'bearer_token', 'none'])
const VALID_PARAM_TYPES = new Set(['string', 'number', 'boolean'])

/**
 * Generates and runs SDK contract tests for a ConnectorDefinition.
 *
 * Call this function at the top level of a test file -- it registers
 * Vitest `describe`/`it` blocks that validate the connector against
 * all SDK interface rules.
 */
export function runContractTests(connector: ConnectorDefinition): void {
  describe(`SDK Contract: ${connector.name}`, () => {
    it('has a valid name (lowercase alphanumeric + hyphens)', () => {
      expect(connector.name).toMatch(VALID_NAME_PATTERN)
    })

    it('has a non-empty display_name', () => {
      expect(typeof connector.display_name).toBe('string')
      expect(connector.display_name.length).toBeGreaterThan(0)
    })

    it('has a valid semver version', () => {
      expect(connector.version).toMatch(SEMVER_PATTERN)
    })

    it('has a valid auth_type', () => {
      expect(VALID_AUTH_TYPES.has(connector.auth_type)).toBe(true)
    })

    it('has at least one action registered', () => {
      const actionKeys = Object.keys(connector.actions)
      expect(actionKeys.length).toBeGreaterThan(0)
    })

    describe('actions', () => {
      const entries = Object.entries(connector.actions)

      for (const [actionKey, action] of entries) {
        describe(actionKey, () => {
          validateAction(action, actionKey)
        })
      }
    })
  })
}

/**
 * Validates a single ActionDefinition against SDK rules.
 */
function validateAction(action: ActionDefinition, key: string): void {
  it('uses dot notation in name', () => {
    expect(action.name).toContain('.')
  })

  it('has a name matching its registration key', () => {
    expect(action.name).toBe(key)
  })

  it('has a description between 10 and 300 characters', () => {
    expect(typeof action.description).toBe('string')
    expect(action.description.length).toBeGreaterThanOrEqual(10)
    expect(action.description.length).toBeLessThanOrEqual(300)
  })

  it('has a valid returns type (list or single)', () => {
    expect(['list', 'single']).toContain(action.returns)
  })

  it('has a handler function', () => {
    expect(typeof action.handler).toBe('function')
  })

  describe('params', () => {
    it('has a params array', () => {
      expect(Array.isArray(action.params)).toBe(true)
    })

    for (const param of action.params) {
      describe(`param: ${param.name}`, () => {
        it('has a non-empty name', () => {
          expect(typeof param.name).toBe('string')
          expect(param.name.length).toBeGreaterThan(0)
        })

        it('has a valid type (string, number, or boolean)', () => {
          expect(VALID_PARAM_TYPES.has(param.type)).toBe(true)
        })

        it('has a boolean required field', () => {
          expect(typeof param.required).toBe('boolean')
        })

        it('has a non-empty description', () => {
          expect(typeof param.description).toBe('string')
          expect(param.description.length).toBeGreaterThan(0)
        })
      })
    }
  })
}
