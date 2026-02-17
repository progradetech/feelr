/**
 * Discord Connector SDK Contract Tests
 *
 * Validates the connector definition against Feelr SDK interface rules.
 * These auto-generated tests catch structural issues like missing fields,
 * invalid action definitions, or incorrect param types.
 */

import { validateConnector } from '@feelr/connector-test-utils'

import { discordConnector } from '../index'

validateConnector(discordConnector)
