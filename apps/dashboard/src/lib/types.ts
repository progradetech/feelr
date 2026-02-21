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

// Chain history types (derived from gateway ChainExecutionResult)
export interface ChainHistoryEntry {
  id: string;
  chain_name: string;
  success: boolean;
  steps_executed: number;
  steps_total: number;
  total_duration_ms: number;
  executed_at: string;
  steps: Array<{
    step_id: string;
    skipped: boolean;
    error: string | null;
    duration_ms: number;
  }>;
}

// Billing status types (from /internal/billing)
export interface BillingData {
  mode: 'cloud' | 'self-hosted';
  plan: string | null;
  quota_limit: number | null;
  stripe_customer_id: string | null;
}

// Billing status types (from /admin/billing/status — Phase 36)
export interface BillingStatusData {
  plan: 'hatchling' | 'lobster' | 'leviathan';
  usage: number;
  limit: number;
  billing_cycle_start: string;
  billing_cycle_end: string;
  stripe_customer_id: string | null;
  payment_failed: boolean;
}

// Gateway envelope
export interface GatewayResponse<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint: string };
}
