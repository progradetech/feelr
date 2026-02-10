/**
 * Wrangler Binding Isolation Validator
 *
 * Checks that staging and production environments in wrangler.toml do not share
 * Cloudflare resource IDs (KV namespace IDs, D1 database IDs). Sharing resource
 * IDs between environments means both environments read/write the same data store,
 * which can cause data leaks or corruption.
 *
 * Why rate limit namespace_id is excluded:
 *   Rate limit bindings (unsafe.bindings with type "ratelimit") use namespace_id "0"
 *   in both environments intentionally. This is a policy identifier, not a Cloudflare
 *   resource ID -- it does not point to a shared data store.
 *
 * Usage:
 *   node scripts/check-bindings.mjs
 *
 * Exit codes:
 *   0 - All bindings are properly isolated between environments
 *   1 - Shared resource IDs detected, or missing environment configuration
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wranglerPath = resolve(__dirname, "..", "apps", "gateway", "wrangler.toml");

const tomlContent = readFileSync(wranglerPath, "utf-8");
const config = parse(tomlContent);

/**
 * Extract KV namespace IDs and D1 database IDs from an environment config.
 * Intentionally excludes unsafe.bindings (rate limit namespace_id).
 */
function extractIds(envConfig) {
  const ids = new Set();

  // KV namespace IDs
  const kvNamespaces = envConfig.kv_namespaces || [];
  for (const ns of kvNamespaces) {
    if (ns.id) {
      ids.add(ns.id);
    }
  }

  // D1 database IDs
  const d1Databases = envConfig.d1_databases || [];
  for (const db of d1Databases) {
    if (db.database_id) {
      ids.add(db.database_id);
    }
  }

  return ids;
}

/**
 * Format an ID set for display, showing prefix of each ID with its type hint.
 */
function formatIds(envConfig) {
  const parts = [];

  const kvNamespaces = envConfig.kv_namespaces || [];
  for (const ns of kvNamespaces) {
    if (ns.id) {
      parts.push(`KV ${ns.id.slice(0, 8)}...`);
    }
  }

  const d1Databases = envConfig.d1_databases || [];
  for (const db of d1Databases) {
    if (db.database_id) {
      parts.push(`D1 ${db.database_id.slice(0, 8)}...`);
    }
  }

  return parts.join(", ");
}

// Validate environment sections exist
if (!config.env?.staging) {
  console.error("ERROR: Missing [env.staging] section in wrangler.toml");
  process.exit(1);
}

if (!config.env?.production) {
  console.error("ERROR: Missing [env.production] section in wrangler.toml");
  process.exit(1);
}

const stagingIds = extractIds(config.env.staging);
const productionIds = extractIds(config.env.production);

// Compute set intersection
const overlap = new Set([...stagingIds].filter((id) => productionIds.has(id)));

if (overlap.size > 0) {
  console.error(
    "ERROR: Staging and production share Cloudflare resource IDs:"
  );
  for (const id of overlap) {
    console.error(`  - ${id} (found in both staging and production)`);
  }
  console.error("");
  console.error(
    "This means staging and production environments would read/write the same data store."
  );
  console.error(
    "Fix: Ensure each environment has unique KV namespace IDs and D1 database IDs in apps/gateway/wrangler.toml"
  );
  process.exit(1);
}

console.log("Binding validation passed:");
console.log(`  Staging:    ${formatIds(config.env.staging)}`);
console.log(`  Production: ${formatIds(config.env.production)}`);
console.log("  Overlap:    NONE");
