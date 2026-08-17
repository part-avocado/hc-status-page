-- hcdown D1 schema. Shared by pinger (writes) and website (reads).

-- Sensitive endpoints: full declarations, not just URLs, so they can be
-- added/edited/removed entirely from /admin with no code change or redeploy.
-- Normal (non-sensitive) endpoints still live in shared/endpoints.ts.
-- id must not collide with any id in shared/endpoints.ts -- admin enforces this on write.
CREATE TABLE IF NOT EXISTS secret_endpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_name TEXT,
  url TEXT NOT NULL,
  method TEXT,
  expected_status_lo INTEGER,
  expected_status_hi INTEGER,
  timeout_ms INTEGER,
  degraded_latency_ms INTEGER
);

-- Latest known status per endpoint, upserted on every ping. Drives the live list.
CREATE TABLE IF NOT EXISTS current_status (
  endpoint_id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at INTEGER NOT NULL
);

-- One row per endpoint per UTC day, incremented on every ping.
-- Drives uptime % windows and the day-by-day history bar.
CREATE TABLE IF NOT EXISTS daily_stats (
  endpoint_id TEXT NOT NULL,
  date TEXT NOT NULL,
  checks INTEGER NOT NULL,
  up_checks INTEGER NOT NULL,
  avg_latency_ms INTEGER NOT NULL,
  PRIMARY KEY (endpoint_id, date)
);
