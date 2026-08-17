import type { EndpointConfig, SecretEndpointRow } from "./types";

// Turns a D1 secret_endpoints row into the same shape as a static
// EndpointConfig, so pinger can check both kinds through one code path.
export function secretRowToEndpointConfig(row: SecretEndpointRow): EndpointConfig {
  const method = row.method === "GET" || row.method === "HEAD" || row.method === "POST" ? row.method : undefined;
  const expectedStatus: [number, number] | undefined =
    row.expected_status_lo != null && row.expected_status_hi != null ? [row.expected_status_lo, row.expected_status_hi] : undefined;

  return {
    id: row.id,
    name: row.name,
    group: row.group_name ?? undefined,
    method,
    expectedStatus,
    timeoutMs: row.timeout_ms ?? undefined,
    degradedLatencyMs: row.degraded_latency_ms ?? undefined,
    url: row.url,
  };
}
