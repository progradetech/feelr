#!/usr/bin/env node

/**
 * Feelr Connector Scaffolding Script
 *
 * Generates a new connector from the _template directory.
 *
 * Usage:
 *   pnpm create-connector <name> [--auth <type>]
 *
 * Examples:
 *   pnpm create-connector todoist
 *   pnpm create-connector todoist --auth api_key
 *   pnpm create-connector my-service --auth oauth2
 *
 * Auth types: api_key, oauth2, bearer_token (default), none
 */

import { existsSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const TEMPLATE_DIR = join(ROOT, 'connectors', '_template')
const CONNECTORS_DIR = join(ROOT, 'connectors')

const VALID_NAME = /^[a-z][a-z0-9-]*$/
const VALID_AUTH_TYPES = new Set(['api_key', 'oauth2', 'bearer_token', 'none'])
const REPLACEABLE_EXTENSIONS = new Set(['.ts', '.json', '.md'])
const SKIP_DIRS = new Set(['node_modules', '.turbo'])

// --- Helpers ---

function toPascalCase(str) {
  return str
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('')
}

function toCamelCase(str) {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function parseArgs(args) {
  const name = args[0]
  let authType = 'bearer_token'

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--auth' && args[i + 1]) {
      authType = args[i + 1]
      i++
    }
  }

  return { name, authType }
}

function walkDir(dir, callback) {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) {
        continue
      }
      walkDir(fullPath, callback)
    } else if (stat.isFile()) {
      const ext = extname(entry)
      if (REPLACEABLE_EXTENSIONS.has(ext)) {
        callback(fullPath)
      }
    }
  }
}

// --- Main ---

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: pnpm create-connector <name> [--auth <type>]

Arguments:
  name          Connector name (lowercase, alphanumeric, hyphens allowed)

Options:
  --auth <type> Auth type: api_key, oauth2, bearer_token (default), none

Examples:
  pnpm create-connector todoist
  pnpm create-connector todoist --auth api_key
  pnpm create-connector my-service --auth oauth2
`)
  process.exit(0)
}

const { name, authType } = parseArgs(args)

// Validate name
if (!name || !VALID_NAME.test(name)) {
  console.error(`Error: Invalid connector name "${name}".`)
  console.error('Name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.')
  process.exit(1)
}

if (name === '_template') {
  console.error('Error: Cannot use "_template" as a connector name.')
  process.exit(1)
}

// Validate auth type
if (!VALID_AUTH_TYPES.has(authType)) {
  console.error(`Error: Invalid auth type "${authType}".`)
  console.error(`Valid types: ${[...VALID_AUTH_TYPES].join(', ')}`)
  process.exit(1)
}

// Check target does not already exist
const targetDir = join(CONNECTORS_DIR, name)
if (existsSync(targetDir)) {
  console.error(`Error: Connector directory already exists: connectors/${name}/`)
  process.exit(1)
}

// Check template exists
if (!existsSync(TEMPLATE_DIR)) {
  console.error('Error: Template directory not found: connectors/_template/')
  process.exit(1)
}

// Copy template
console.log(`Creating connector: ${name}`)
console.log(`  Auth type: ${authType}`)
console.log(`  Directory: connectors/${name}/`)
console.log()

cpSync(TEMPLATE_DIR, targetDir, {
  recursive: true,
  filter: (src) => {
    const baseName = src.split('/').pop()
    return !SKIP_DIRS.has(baseName)
  },
})

// Prepare replacement values
const camelName = toCamelCase(name)
const pascalName = toPascalCase(name)

const replacements = [
  ['@feelr/connector-template', `@feelr/connector-${name}`],
  ['templateConnector', `${camelName}Connector`],
  ['Template Connector', `${pascalName} Connector`],
  ["name: 'template'", `name: '${name}'`],
]

// Only replace auth_type if different from default
if (authType !== 'bearer_token') {
  replacements.push(["auth_type: 'bearer_token'", `auth_type: '${authType}'`])
}

// Apply replacements to all .ts, .json, .md files
let filesModified = 0

walkDir(targetDir, (filePath) => {
  let content = readFileSync(filePath, 'utf8')
  let modified = false

  for (const [search, replace] of replacements) {
    if (content.includes(search)) {
      content = content.replaceAll(search, replace)
      modified = true
    }
  }

  if (modified) {
    writeFileSync(filePath, content, 'utf8')
    filesModified++
  }
})

console.log(`  Replaced strings in ${filesModified} files`)

// Run pnpm install to register workspace package
console.log('  Running pnpm install...')
try {
  execSync('pnpm install', { cwd: ROOT, stdio: 'pipe' })
  console.log('  Workspace package registered')
} catch (err) {
  console.error('  Warning: pnpm install failed. Run it manually from the monorepo root.')
}

console.log()
console.log('Done! Next steps:')
console.log()
console.log(`  1. cd connectors/${name}`)
console.log('  2. Edit src/actions/ to implement your connector actions')
console.log('  3. Update src/index.ts with your action imports and definitions')
console.log(`  4. Run tests: pnpm --filter @feelr/connector-${name} test`)
console.log('  5. Register in apps/gateway/src/routes/v1.ts')
console.log()
