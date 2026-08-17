// Config for a normal (non-sensitive) endpoint. Sensitive endpoints aren't
// declared here at all -- they're full rows in the D1 `secret_endpoints`
// table, managed entirely from /admin. Both kinds get merged into one list
// at runtime by pinger and website.
export interface EndpointConfig {
  /** Stable slug. Used as the D1 key for status/history — don't rename once deployed. Must not collide with any id created in /admin. */
  id: string;
  /** Display name shown on the status page. */
  name: string;
  /** Section heading the endpoint is grouped under. */
  group?: string;
  /** HTTP method to check with. Default "GET". */
  method?: "GET" | "HEAD" | "POST";
  /** Inclusive [min, max] status code range considered healthy. Default [200, 299]. */
  expectedStatus?: [number, number];
  /** Request timeout in ms before the check counts as down. Default 10_000. */
  timeoutMs?: number;
  /** If the response takes longer than this, show "degraded" instead of "up". */
  degradedLatencyMs?: number;
  url: string;
}

// A sensitive endpoint's full row from the D1 `secret_endpoints` table
// (added/edited/removed via /admin, not shared/endpoints.ts).
export interface SecretEndpointRow {
  id: string;
  name: string;
  group_name: string | null;
  url: string;
  method: string | null;
  expected_status_lo: number | null;
  expected_status_hi: number | null;
  timeout_ms: number | null;
  degraded_latency_ms: number | null;
}

export interface GroupConfig {
  /** Must match the `group` string used on one or more endpoints. */
  name: string;
  /** Render this section as a collapsible <details> block on the website. Default false. */
  collapsible?: boolean;
  /** Only meaningful when `collapsible` is true: start the section collapsed. Default false. */
  collapsed?: boolean;
}
