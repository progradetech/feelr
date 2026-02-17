#!/usr/bin/env node

/**
 * Connector Validation Script
 *
 * Validates all connectors (or only changed ones) against SDK compliance rules.
 * Runs locally and in CI to catch non-compliant connector PRs early.
 *
 * Usage:
 *   node scripts/validate-connectors.mjs          # validates all connectors
 *   node scripts/validate-connectors.mjs --all    # validates all connectors
 *   node scripts/validate-connectors.mjs --changed # validates only changed connectors (CI mode)
 *
 * Checks:
 *   1. package.json exists and is valid JSON
 *   2. Only @feelr/connector-sdk allowed as runtime dependency
 *   3. src/index.ts entry point exists
 *   4. No node: or @cloudflare/ imports in src/ .ts files
 *   5. At least one .test.ts file in src/__tests__/
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CONNECTORS_DIR = join(ROOT, 'connectors')

/**
 * Get list of connector directories to validate.
 * Excludes directories starting with '_' (e.g., _template).
 */
function getAllConnectors() {
  return readdirSync(CONNECTORS_DIR)
    .filter((name) => {
      if (name.startsWith('_')) return false
      const fullPath = join(CONNECTORS_DIR, name)
      return statSync(fullPath).isDirectory()
    })
    .sort()
}

/**
 * Get connectors that have changes compared to origin/main.
 * Uses git diff to detect changed files under connectors/.
 */
function getChangedConnectors() {
  try {
    const output = execSync('git diff --name-only origin/main...HEAD', {
      encoding: 'utf-8',
      cwd: ROOT,
    }).trim()

    if (!output) return []

    const changedFiles = output.split('\n')
    const connectorNames = new Set()

    for (const file of changedFiles) {
      const match = file.match(/^connectors\/([^/]+)\//)
      if (match && !match[1].startsWith('_')) {
        connectorNames.add(match[1])
      }
    }

    return [...connectorNames].sort()
  } catch {
    // If git diff fails (e.g., no origin/main), fall back to all
    console.warn('Warning: git diff failed, falling back to --all mode')
    return getAllConnectors()
  }
}

/**
 * Recursively find all .ts files in a directory.
 */
function findTsFiles(dir) {
  const results = []
  if (!existsSync(dir)) return results

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findTsFiles(fullPath))
    } else if (entry.name.endsWith('.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * Find all .test.ts files under src/__tests__/.
 */
function findTestFiles(connectorDir) {
  const testsDir = join(connectorDir, 'src', '__tests__')
  if (!existsSync(testsDir)) return []

  return readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => join(testsDir, name))
}

/**
 * Validate a single connector directory.
 * Returns an array of error messages (empty = pass).
 */
function validateConnector(name) {
  const connectorDir = join(CONNECTORS_DIR, name)
  const errors = []

  // Check 1: package.json exists and is valid JSON
  const pkgPath = join(connectorDir, 'package.json')
  if (!existsSync(pkgPath)) {
    errors.push(`Missing package.json in connectors/${name}/`)
    // Can't continue other checks without package.json
    return errors
  }

  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  } catch {
    errors.push(`Invalid JSON in connectors/${name}/package.json`)
    return errors
  }

  // Check 2: Only @feelr/connector-sdk allowed as runtime dependency
  const deps = pkg.dependencies || {}
  const depNames = Object.keys(deps)
  const disallowed = depNames.filter((d) => d !== '@feelr/connector-sdk')
  if (disallowed.length > 0) {
    errors.push(
      `Disallowed runtime dependencies: ${disallowed.join(', ')}. Only @feelr/connector-sdk is allowed as a runtime dependency.`
    )
  }

  // Check 3: src/index.ts must exist
  const indexPath = join(connectorDir, 'src', 'index.ts')
  if (!existsSync(indexPath)) {
    errors.push('Missing src/index.ts -- connector must have an entry point')
  }

  // Check 4: No node: or @cloudflare/ imports in src/ .ts files
  const srcDir = join(connectorDir, 'src')
  const tsFiles = findTsFiles(srcDir)
  const nodeImportRegex = /from\s+['"]node:/
  const cfImportRegex = /from\s+['"]@cloudflare\//

  for (const filePath of tsFiles) {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const relativePath = filePath.replace(connectorDir + '/', '')

    for (const line of lines) {
      const nodeMatch = line.match(nodeImportRegex)
      if (nodeMatch) {
        const importMatch = line.match(/from\s+['"](node:[^'"]+)['"]/)
        const importName = importMatch ? importMatch[1] : 'node:*'
        errors.push(
          `Disallowed import in ${relativePath}: from '${importName}'. Connectors must use Web Standard APIs only.`
        )
      }

      const cfMatch = line.match(cfImportRegex)
      if (cfMatch) {
        const importMatch = line.match(/from\s+['"](@cloudflare\/[^'"]+)['"]/)
        const importName = importMatch ? importMatch[1] : '@cloudflare/*'
        errors.push(
          `Disallowed import in ${relativePath}: from '${importName}'. Connectors must use Web Standard APIs only.`
        )
      }
    }
  }

  // Check 5: At least one .test.ts file in src/__tests__/
  const testFiles = findTestFiles(connectorDir)
  if (testFiles.length === 0) {
    errors.push(
      'No test files found in src/__tests__/. At least one .test.ts file is required.'
    )
  }

  return errors
}

// --- Main ---

const args = process.argv.slice(2)
const mode = args.includes('--changed') ? 'changed' : 'all'

let connectors

if (mode === 'changed') {
  connectors = getChangedConnectors()
  if (connectors.length === 0) {
    console.log('No connector changes detected.')
    process.exit(0)
  }
} else {
  connectors = getAllConnectors()
}

console.log('Validating connectors...\n')

let failCount = 0

for (const name of connectors) {
  const errors = validateConnector(name)
  if (errors.length === 0) {
    console.log(`connectors/${name}: PASS`)
  } else {
    console.log(`connectors/${name}: FAIL`)
    errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`)
    })
    failCount++
  }
}

console.log()

if (failCount > 0) {
  console.log(
    `${failCount} of ${connectors.length} connector${connectors.length === 1 ? '' : 's'} failed validation.`
  )
  process.exit(1)
} else {
  console.log(
    `All ${connectors.length} connector${connectors.length === 1 ? '' : 's'} passed validation.`
  )
  process.exit(0)
}
