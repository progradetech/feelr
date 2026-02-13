/**
 * Configuration types and loader for Feelr self-hosted deployments.
 *
 * The configuration system uses two sources:
 * - `feelr.yaml` for structured settings (rate limits, billing, storage, etc.)
 * - `.env` for secrets (admin token, encryption key, connector credentials)
 *
 * The YAML is parsed outside workerd (init script or Docker entrypoint converts
 * to JSON), then loaded here via `loadConfig()`. Environment variable overrides
 * are applied from workerd bindings (not process.env).
 *
 * @see self-host/feelr.yaml.template for the full commented configuration reference.
 */

// ---------------------------------------------------------------------------
// FeelrYamlConfig -- typed representation of feelr.yaml
// ---------------------------------------------------------------------------

/**
 * Complete configuration for a Feelr deployment.
 *
 * Every field corresponds 1:1 to a YAML key in `feelr.yaml.template`.
 * The types enforce valid values at compile time.
 */
export interface FeelrYamlConfig {
  runtime: 'cloud' | 'self-hosted'
  gateway: { port: number }
  billing: { enabled: boolean }
  encryption: { enabled: boolean }
  rate_limits: {
    free: { requests_per_minute: number }
    pro: { requests_per_minute: number }
    enterprise: { requests_per_minute: number }
    ip: { requests_per_10s: number }
  }
  storage: {
    data_dir: string
    auto_migrate: boolean
  }
  retention: { days: number }
  logging: { level: 'debug' | 'info' | 'warn' | 'error' }
}

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG -- sensible defaults matching feelr.yaml.template
// ---------------------------------------------------------------------------

/**
 * Default configuration values.
 *
 * These match the defaults in `self-host/feelr.yaml.template` exactly.
 * When a user omits a field from their config, the default is used.
 */
export const DEFAULT_CONFIG: FeelrYamlConfig = {
  runtime: 'self-hosted',
  gateway: { port: 8080 },
  billing: { enabled: false },
  encryption: { enabled: true },
  rate_limits: {
    free: { requests_per_minute: 30 },
    pro: { requests_per_minute: 300 },
    enterprise: { requests_per_minute: 3000 },
    ip: { requests_per_10s: 100 },
  },
  storage: { data_dir: '/data/feelr', auto_migrate: true },
  retention: { days: 90 },
  logging: { level: 'info' },
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

/**
 * Deep-merges a partial config object into a base config.
 *
 * For each key in `partial`, if both base and partial values are plain objects,
 * recurse. Otherwise, the partial value overwrites the base value.
 * Only plain objects ({}) are recursed into -- arrays, dates, etc. are replaced.
 */
function deepMerge(
  base: Record<string, unknown>,
  partial: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const key of Object.keys(partial)) {
    const baseVal = base[key]
    const partialVal = partial[key]

    if (
      baseVal !== null &&
      partialVal !== null &&
      typeof baseVal === 'object' &&
      typeof partialVal === 'object' &&
      !Array.isArray(baseVal) &&
      !Array.isArray(partialVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        partialVal as Record<string, unknown>
      )
    } else if (partialVal !== undefined) {
      result[key] = partialVal
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Simple YAML parser
// ---------------------------------------------------------------------------

/**
 * Minimal YAML parser for the feelr.yaml structure.
 *
 * Handles the subset of YAML used in feelr.yaml.template:
 * - Comments (lines starting with #, inline # comments)
 * - Nested keys via 2-space indentation
 * - String, number, and boolean values
 * - No anchors, aliases, arrays, multi-line strings, or complex types
 *
 * This avoids a dependency on js-yaml since this runs in workerd where
 * Node.js modules are not available.
 */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  // Stack of [indent, object] pairs for tracking nesting
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [
    { indent: -1, obj: root },
  ]

  const lines = text.split('\n')

  for (const rawLine of lines) {
    // Skip empty lines and full-line comments
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) {
      continue
    }

    // Determine indentation (number of leading spaces)
    const indent = rawLine.length - rawLine.trimStart().length

    // Strip inline comments (but not inside quoted strings)
    let line = rawLine.trim()
    const commentIdx = line.indexOf('  #')
    if (commentIdx > 0) {
      line = line.substring(0, commentIdx).trim()
    }

    // Parse key: value
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.substring(0, colonIdx).trim()
    const rawValue = line.substring(colonIdx + 1).trim()

    // Pop stack entries that are at the same level or deeper
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const parent = stack[stack.length - 1].obj

    if (rawValue === '' || rawValue.startsWith('#')) {
      // This key introduces a nested object
      const nested: Record<string, unknown> = {}
      parent[key] = nested
      stack.push({ indent, obj: nested })
    } else {
      // Parse the value
      parent[key] = parseYamlValue(rawValue)
    }
  }

  return root
}

/**
 * Parses a YAML scalar value into a JavaScript primitive.
 */
function parseYamlValue(raw: string): string | number | boolean {
  // Boolean
  if (raw === 'true') return true
  if (raw === 'false') return false

  // Number (integer or float)
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw)
  }

  // Quoted string -- strip quotes
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1)
  }

  // Unquoted string
  return raw
}

// ---------------------------------------------------------------------------
// Environment variable overrides
// ---------------------------------------------------------------------------

/**
 * Bindings that can override config values.
 *
 * These correspond to workerd `fromEnvironment` bindings, not process.env.
 * The workerd capnp config maps environment variables to binding names.
 */
interface EnvOverrides {
  FEELR_AUTO_MIGRATE?: string
  FEELR_PORT?: string
}

/**
 * Applies environment variable overrides to a config object.
 *
 * Supported overrides:
 * - FEELR_AUTO_MIGRATE: "true" or "false" -> storage.auto_migrate
 * - FEELR_PORT: number string -> gateway.port
 */
function applyEnvOverrides(
  config: FeelrYamlConfig,
  env: EnvOverrides
): FeelrYamlConfig {
  const result = { ...config }

  if (env.FEELR_AUTO_MIGRATE !== undefined) {
    result.storage = {
      ...result.storage,
      auto_migrate: env.FEELR_AUTO_MIGRATE !== 'false',
    }
  }

  if (env.FEELR_PORT !== undefined) {
    const port = parseInt(env.FEELR_PORT, 10)
    if (!isNaN(port) && port > 0 && port <= 65535) {
      result.gateway = { ...result.gateway, port }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads configuration from YAML text, merging with defaults.
 *
 * Parses the YAML text using a built-in parser (no external dependencies),
 * deep-merges with DEFAULT_CONFIG, and applies environment variable overrides.
 *
 * @param yamlText - Raw YAML string from feelr.yaml
 * @param env - Optional workerd bindings for environment variable overrides
 * @returns Fully resolved FeelrYamlConfig with all defaults applied
 *
 * @example
 * ```ts
 * const yaml = await Bun.file('/etc/feelr/feelr.yaml').text()
 * const config = loadConfig(yaml, { FEELR_PORT: '3000' })
 * ```
 */
export function loadConfig(
  yamlText: string,
  env: EnvOverrides = {}
): FeelrYamlConfig {
  const parsed = parseSimpleYaml(yamlText)
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    parsed
  ) as unknown as FeelrYamlConfig
  return applyEnvOverrides(merged, env)
}

/**
 * Loads configuration from a pre-parsed JSON object, merging with defaults.
 *
 * Use this when YAML-to-JSON conversion happens outside workerd (e.g., in
 * the Docker entrypoint or init script). Avoids the need for YAML parsing
 * inside the worker.
 *
 * @param obj - Parsed configuration object (e.g., from JSON.parse)
 * @param env - Optional workerd bindings for environment variable overrides
 * @returns Fully resolved FeelrYamlConfig with all defaults applied
 *
 * @example
 * ```ts
 * const configJson = env.FEELR_CONFIG // injected as text binding
 * const config = loadConfigFromObject(JSON.parse(configJson))
 * ```
 */
export function loadConfigFromObject(
  obj: Record<string, unknown>,
  env: EnvOverrides = {}
): FeelrYamlConfig {
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    obj
  ) as unknown as FeelrYamlConfig
  return applyEnvOverrides(merged, env)
}
