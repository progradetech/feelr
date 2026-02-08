#!/command/with-contenv sh
# Feelr startup initialization script
#
# Runs once during container startup (before services start).
# Creates required directories and logs startup configuration.
#
# Durable Object migrations happen inside the DOs themselves via
# blockConcurrencyWhile() -- this script only handles filesystem setup.

set -e

echo "=== Feelr Self-Hosted Startup ==="

# ---------- Create data directories ----------
# These directories are needed for workerd Durable Object disk storage.
# The /data/feelr volume is mounted from Docker; subdirs may not exist yet.
mkdir -p /data/feelr/do
echo "Data directories ready: /data/feelr/do"

# ---------- Check FEELR_AUTO_MIGRATE ----------
# When enabled (default), DOs will auto-run schema migrations on first access.
# When disabled, the operator is responsible for migration timing.
FEELR_AUTO_MIGRATE="${FEELR_AUTO_MIGRATE:-true}"
if [ "$FEELR_AUTO_MIGRATE" = "true" ]; then
    echo "Auto-migration: enabled (DOs will migrate on first access)"
else
    echo "Auto-migration: disabled (FEELR_AUTO_MIGRATE=false)"
fi

# ---------- Convert YAML config to JSON ----------
# workerd reads FEELR_CONFIG as a JSON string from the environment.
# If feelr.yaml exists and FEELR_CONFIG is not already set, convert it.
if [ -z "$FEELR_CONFIG" ] && [ -f /etc/feelr/feelr.yaml ]; then
    # Simple YAML-to-JSON conversion using a Node.js one-liner if available,
    # otherwise fall back to a basic awk-based approach for flat YAML.
    if command -v node >/dev/null 2>&1; then
        FEELR_CONFIG=$(node -e "
            const fs = require('fs');
            const lines = fs.readFileSync('/etc/feelr/feelr.yaml', 'utf8').split('\n');
            const result = {};
            let section = null;
            for (const line of lines) {
                const trimmed = line.replace(/#.*$/, '').trim();
                if (!trimmed) continue;
                if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed.endsWith(':')) {
                    section = trimmed.slice(0, -1);
                    result[section] = {};
                } else if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed.includes(': ')) {
                    const [k, ...v] = trimmed.split(': ');
                    result[k] = v.join(': ');
                } else if (section && trimmed.includes(': ')) {
                    const indent = line.search(/\S/);
                    const [k, ...v] = trimmed.split(': ');
                    let val = v.join(': ');
                    if (val === 'true') val = true;
                    else if (val === 'false') val = false;
                    else if (/^\d+$/.test(val)) val = parseInt(val, 10);
                    if (indent <= 2) {
                        result[section][k] = val;
                    } else {
                        // Nested subsection -- find parent key
                        const parentLine = lines.slice(0, lines.indexOf(line)).reverse()
                            .find(l => l.search(/\S/) < indent && l.trim().endsWith(':'));
                        if (parentLine) {
                            const parentKey = parentLine.trim().slice(0, -1);
                            if (typeof result[section][parentKey] !== 'object') {
                                result[section][parentKey] = {};
                            }
                            result[section][parentKey][k] = val;
                        }
                    }
                }
            }
            console.log(JSON.stringify(result));
        ")
        export FEELR_CONFIG
        echo "Converted feelr.yaml to FEELR_CONFIG JSON"
    else
        echo "WARNING: node not found, FEELR_CONFIG not set from YAML"
        echo "Set FEELR_CONFIG environment variable manually or install Node.js"
    fi
fi

# ---------- Log startup status ----------
echo "Runtime: self-hosted"
echo "Port: ${FEELR_PORT:-8080}"
echo "Data dir: /data/feelr"
echo "=== Startup initialization complete ==="
