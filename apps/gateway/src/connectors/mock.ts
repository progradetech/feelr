import type { ConnectorDefinition, ActionContext, ActionResult } from '@feelr/connector-sdk'
import { FeelrError } from '../lib/errors'

/**
 * Mock connector for end-to-end pipeline testing.
 * Validates routing, param extraction, response wrapping, and error handling.
 */
export const mockConnector: ConnectorDefinition = {
  name: 'mock',
  display_name: 'Mock Connector',
  version: '1.0.0',
  auth_type: 'none',
  actions: {
    'echo': {
      name: 'echo',
      description:
        'Returns the provided message with a timestamp. Use for testing connectivity and response format. Accepts an optional "message" param (string, defaults to "hello"). Returns { message, timestamp } as a single object.',
      params: [
        {
          name: 'message',
          type: 'string',
          required: false,
          description: 'Message to echo back',
          default: 'hello',
        },
      ],
      returns: 'single',
      handler: async (ctx: ActionContext): Promise<ActionResult> => {
        const message = (ctx.params.message as string) ?? 'hello'
        return {
          data: {
            message,
            timestamp: new Date().toISOString(),
          },
          raw: {
            original_params: ctx.params,
          },
        }
      },
    },

    'items.list': {
      name: 'items.list',
      description:
        'Returns a generated list of mock items with pagination support. Accepts optional "count" (number, default 10) and "cursor" (string) params. Returns an array of { id, name, created_at } objects with cursor-based pagination metadata.',
      params: [
        {
          name: 'count',
          type: 'number',
          required: false,
          description: 'Number of items to return',
          default: 10,
        },
        {
          name: 'cursor',
          type: 'string',
          required: false,
          description: 'Pagination cursor from a previous response',
        },
      ],
      returns: 'list',
      handler: async (ctx: ActionContext): Promise<ActionResult> => {
        const count = Number(ctx.params.count ?? 10)
        const items = Array.from({ length: count }, (_, i) => ({
          id: `item_${i + 1}`,
          name: `Mock Item ${i + 1}`,
          created_at: new Date().toISOString(),
        }))

        return {
          data: items,
          meta: {
            has_more: true,
            cursor: 'mock_cursor_next',
          },
          raw: {
            generated_count: count,
            params: ctx.params,
          },
        }
      },
    },

    'error.throw': {
      name: 'error.throw',
      description:
        'Throws a simulated error for testing the error handling pipeline. Accepts optional "code" (string, default "UPSTREAM_ERROR") and "status" (number, default 502) params. Always throws a FeelrError -- useful for verifying error envelope format.',
      params: [
        {
          name: 'code',
          type: 'string',
          required: false,
          description: 'Error code to throw',
          default: 'UPSTREAM_ERROR',
        },
        {
          name: 'status',
          type: 'number',
          required: false,
          description: 'HTTP status code for the error',
          default: 502,
        },
      ],
      returns: 'single',
      handler: async (ctx: ActionContext): Promise<ActionResult> => {
        const code = (ctx.params.code as string) ?? 'UPSTREAM_ERROR'
        const status = Number(ctx.params.status ?? 502)

        throw new FeelrError(code as any, {
          message: `Simulated ${code} error`,
          hint: 'retry',
          status: status as any,
          detail: 'Simulated upstream error',
        })
      },
    },
  },
}
