import type { ConnectorDefinition } from '@feelr/connector-sdk'

/**
 * Connector registry.
 * Stores connector definitions by name for lookup during request dispatch.
 */
const connectors = new Map<string, ConnectorDefinition>()

/**
 * Register a connector definition.
 * @param connector - The connector to register
 */
export function registerConnector(connector: ConnectorDefinition): void {
  connectors.set(connector.name, connector)
}

/**
 * Look up a connector by name.
 * @param name - The connector name (e.g., "github", "mock")
 * @returns The connector definition, or undefined if not found
 */
export function getConnector(name: string): ConnectorDefinition | undefined {
  return connectors.get(name)
}

/**
 * List all registered connectors.
 * @returns Array of all registered connector definitions
 */
export function listConnectors(): ConnectorDefinition[] {
  return Array.from(connectors.values())
}
