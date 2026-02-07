// API Key types (matching gateway /admin/keys response)
export interface ApiKey {
  short_token: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

// Connector status types
export interface ConnectorStatus {
  name: string;
  status: 'connected' | 'needs_reauth' | 'not_connected';
}

// Usage types
export interface UsageBucket {
  time_bucket: string;
  total_requests: number;
  error_count: number;
  avg_duration_ms: number;
}

export interface UsageResponse {
  window: string;
  buckets: UsageBucket[];
  filters: { key?: string; connector?: string };
}

// Overview types
export interface OverviewData {
  total_keys: number;
  connected_services: number;
  recent_usage: {
    total_24h: number;
    hourly: Array<{ hour: string; count: number }>;
  };
}

// Gateway envelope
export interface GatewayResponse<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint: string };
}
