import { endpoints } from "../../shared/endpoints";
import { secretRowToEndpointConfig } from "../../shared/secretEndpoints";
import type { EndpointConfig, SecretEndpointRow } from "../../shared/types";

interface Env {
  DB: D1Database;
}

/** Daily rollups older than this are pruned. */
const RETENTION_DAYS = 90;

// Cloudflare Cron Triggers only support minute-level granularity, so the
// scheduled handler fires every minute but skips runs until this much time
// has actually elapsed since the last check -- approximating a 90s interval
// (real spacing alternates ~60s/~120s rather than landing exactly on 90s).
const MIN_CHECK_INTERVAL_MS = 90_000;

interface CheckResult {
  id: string;
  ok: 0 | 1;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
}

async function allEndpoints(db: D1Database): Promise<EndpointConfig[]> {
  const secretRows = await db.prepare("SELECT * FROM secret_endpoints").all<SecretEndpointRow>();
  return [...endpoints, ...secretRows.results.map(secretRowToEndpointConfig)];
}

async function checkEndpoint(ep: EndpointConfig, url: string): Promise<CheckResult> {
  const timeoutMs = ep.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: ep.method ?? "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    const latencyMs = Date.now() - start;
    const [lo, hi] = ep.expectedStatus ?? [200, 299];
    const ok = res.status >= lo && res.status <= hi;
    return {
      id: ep.id,
      ok: ok ? 1 : 0,
      statusCode: res.status,
      latencyMs,
      error: ok ? null : `unexpected status ${res.status}`,
    };
  } catch (err) {
    return {
      id: ep.id,
      ok: 0,
      statusCode: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runChecks(env: Env): Promise<CheckResult[]> {
  const toCheck = await allEndpoints(env.DB);
  const results = await Promise.all(toCheck.map((ep) => checkEndpoint(ep, ep.url)));

  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  const statements = results.flatMap((r) => [
    env.DB.prepare(
      `INSERT INTO current_status (endpoint_id, ok, status_code, latency_ms, error, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint_id) DO UPDATE SET
         ok = excluded.ok,
         status_code = excluded.status_code,
         latency_ms = excluded.latency_ms,
         error = excluded.error,
         checked_at = excluded.checked_at`,
    ).bind(r.id, r.ok, r.statusCode, r.latencyMs, r.error, now),
    env.DB.prepare(
      `INSERT INTO daily_stats (endpoint_id, date, checks, up_checks, avg_latency_ms)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(endpoint_id, date) DO UPDATE SET
         checks = checks + 1,
         up_checks = up_checks + excluded.up_checks,
         avg_latency_ms = CASE
           WHEN ? IS NULL THEN avg_latency_ms
           ELSE ((avg_latency_ms * checks) + ?) / (checks + 1)
         END`,
    ).bind(r.id, today, r.ok, r.latencyMs ?? 0, r.latencyMs, r.latencyMs),
  ]);

  await env.DB.batch(statements);

  if (new Date(now).getUTCMinutes() === 0) {
    const cutoff = new Date(now - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
    await env.DB.prepare("DELETE FROM daily_stats WHERE date < ?").bind(cutoff).run();
  }

  return results;
}

async function dueForCheck(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT MAX(checked_at) AS last FROM current_status").first<{ last: number | null }>();
  return row?.last == null || Date.now() - row.last >= MIN_CHECK_INTERVAL_MS;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        if (await dueForCheck(env.DB)) await runChecks(env);
      })(),
    );
  },
  async fetch(_req, env) {
    const results = await runChecks(env);
    return new Response(
      results.map((r) => `${r.ok ? "UP  " : "DOWN"} ${r.id} ${r.latencyMs ?? "--"}ms ${r.error ?? ""}`).join("\n") + "\n",
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  },
} satisfies ExportedHandler<Env>;
