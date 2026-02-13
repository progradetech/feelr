-- Feelr Gateway D1 Schema
-- Tables: usage (API call tracking), rate_limit_events (throttle tracking)

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_short TEXT NOT NULL,
  connector TEXT NOT NULL,
  action TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_api_key_short ON usage(api_key_short);
CREATE INDEX IF NOT EXISTS idx_usage_connector ON usage(connector);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_key_connector ON usage(api_key_short, connector);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_short TEXT NOT NULL,
  tier TEXT NOT NULL,
  ip TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rle_api_key_short ON rate_limit_events(api_key_short);
CREATE INDEX IF NOT EXISTS idx_rle_timestamp ON rate_limit_events(timestamp);
