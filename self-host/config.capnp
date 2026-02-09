# Feelr Gateway -- workerd standalone configuration for self-hosted mode.
#
# This config defines all services, Durable Object namespaces, and bindings
# needed to run the Feelr gateway as a standalone workerd process.
#
# Usage:
#   workerd serve config.capnp
#
# Prerequisites:
#   1. Build gateway: cd apps/gateway && npm run build:self-hosted
#   2. Copy dist/self-hosted-entry.js to the path referenced below
#   3. Create /data/feelr/do directory for Durable Object storage
#   4. Set environment variables or update text bindings below
#   5. (Optional) Place dashboard static files in /opt/feelr/dashboard/

using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    # ---------- Gateway Worker ----------
    (
      name = "gateway",
      worker = .gatewayWorker,
    ),

    # ---------- Dashboard static file server ----------
    (
      name = "dashboard",
      disk = "/opt/feelr/dashboard",
    ),

    # ---------- Durable Object local disk storage ----------
    (
      name = "do-storage",
      disk = (path = "/data/feelr/do", writable = true),
    ),
  ],

  sockets = [
    # Listen on all interfaces, port 8080
    (
      name = "http",
      address = "*:8080",
      http = (),
      service = "gateway",
    ),
  ],
);

const gatewayWorker :Workerd.Worker = (
  modules = [
    (
      name = "worker",
      esModule = embed "./dist/self-hosted-entry.js",
    ),
  ],

  compatibilityDate = "2026-02-05",

  # ---------- Durable Object namespaces ----------
  durableObjectNamespaces = [
    (
      className = "TokenCoordinator",
      uniqueKey = "feelr-token-coordinator",
    ),
    (
      className = "KvStoreDO",
      uniqueKey = "feelr-kv-store",
    ),
    (
      className = "UsageDbDO",
      uniqueKey = "feelr-usage-db",
    ),
  ],

  # Durable Object storage on local disk
  durableObjectStorage = (localDisk = "do-storage"),

  bindings = [
    # ---------- Runtime mode ----------
    (
      name = "RUNTIME",
      text = "self-hosted",
    ),

    # ---------- DO namespace bindings ----------
    (
      name = "TOKEN_COORDINATOR",
      durableObjectNamespace = "TokenCoordinator",
    ),
    (
      name = "KV_STORE",
      durableObjectNamespace = "KvStoreDO",
    ),
    (
      name = "USAGE_DB_DO",
      durableObjectNamespace = "UsageDbDO",
    ),

    # ---------- Dashboard service binding ----------
    (
      name = "DASHBOARD",
      service = "dashboard",
    ),

    # ---------- Secrets (set via environment variables) ----------
    # These read from the process environment at startup.
    # Set them in your .env file or container environment.
    (
      name = "ENCRYPTION_KEY",
      fromEnvironment = "FEELR_ENCRYPTION_KEY",
    ),
    (
      name = "ADMIN_TOKEN",
      fromEnvironment = "FEELR_ADMIN_TOKEN",
    ),
    (
      name = "SLACK_CLIENT_ID",
      fromEnvironment = "FEELR_SLACK_CLIENT_ID",
    ),
    (
      name = "SLACK_CLIENT_SECRET",
      fromEnvironment = "FEELR_SLACK_CLIENT_SECRET",
    ),

    # ---------- Configuration ----------
    # FEELR_CONFIG is a JSON string of the parsed feelr.yaml.
    # The Docker entrypoint converts YAML to JSON and injects it here.
    # For manual deployment, convert with: yq -o json feelr.yaml
    (
      name = "FEELR_CONFIG",
      fromEnvironment = "FEELR_CONFIG",
    ),

    # ---------- Environment overrides ----------
    (
      name = "FEELR_AUTO_MIGRATE",
      fromEnvironment = "FEELR_AUTO_MIGRATE",
    ),
    (
      name = "FEELR_PORT",
      fromEnvironment = "FEELR_PORT",
    ),
    (
      name = "ENVIRONMENT",
      text = "self-hosted",
    ),
  ],
);
