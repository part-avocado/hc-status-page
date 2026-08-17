import { endpoints, groups as groupConfigs } from "../../shared/endpoints";
import { BASE_CSS } from "../../shared/theme";

const PRIVATE_PREFIX = "!PRIVATE.";
function isPrivate(id: string): boolean {
  return id.startsWith(PRIVATE_PREFIX);
}

export interface Env {
  DB: D1Database;
}

interface CurrentStatusRow {
  endpoint_id: string;
  ok: number;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  checked_at: number;
}

interface DailyStatsRow {
  endpoint_id: string;
  date: string;
  checks: number;
  up_checks: number;
  avg_latency_ms: number;
}

// Non-sensitive metadata for a secret_endpoints row -- deliberately excludes
// url, method, expected_status, and timeout_ms, none of which the website
// needs or should ever see.
interface SecretEndpointMetaRow {
  id: string;
  name: string;
  group_name: string | null;
  degraded_latency_ms: number | null;
}

interface EndpointMeta {
  id: string;
  name: string;
  group?: string;
  degradedLatencyMs?: number;
}

export type Health = "up" | "degraded" | "down" | "unknown";
export type Overall = "operational" | "degraded" | "major_outage" | "unknown";

export interface DayBucket {
  date: string;
  pct: number | null;
}

export interface EndpointStatus {
  id: string;
  name: string;
  health: Health;
  latencyMs: number | null;
  error: string | null;
  checkedAt: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  uptime90d: number | null;
  history: DayBucket[];
}

export interface StatusGroup {
  name: string;
  collapsible: boolean;
  collapsed: boolean;
  endpoints: EndpointStatus[];
}

export interface StatusData {
  generatedAt: number;
  overall: Overall;
  groups: StatusGroup[];
}

// How many days of daily_stats to fetch/keep for uptime-window math (also the
// cap on the per-service detail page's history table).
const UPTIME_DAYS = 90;
// How many of the most recent days the compact inline bar on the main table
// shows -- kept shorter than UPTIME_DAYS so a row fits on one line.
const BAR_DAYS = 60;
const DAY_MS = 86_400_000;

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function uptimeOver(daily: Map<string, DailyStatsRow>, days: number, now: number): number | null {
  let checks = 0;
  let up = 0;
  for (let i = 0; i < days; i++) {
    const row = daily.get(isoDate(now - i * DAY_MS));
    if (!row) continue;
    checks += row.checks;
    up += row.up_checks;
  }
  return checks === 0 ? null : (up / checks) * 100;
}

export async function gatherStatus(env: Env): Promise<StatusData> {
  const now = Date.now();
  const cutoff = isoDate(now - UPTIME_DAYS * DAY_MS);

  const [current, daily, secretMeta] = await Promise.all([
    env.DB.prepare("SELECT * FROM current_status").all<CurrentStatusRow>(),
    env.DB.prepare("SELECT * FROM daily_stats WHERE date >= ?").bind(cutoff).all<DailyStatsRow>(),
    env.DB.prepare("SELECT id, name, group_name, degraded_latency_ms FROM secret_endpoints").all<SecretEndpointMetaRow>(),
  ]);

  const currentById = new Map(current.results.map((r) => [r.endpoint_id, r]));
  const dailyByEndpoint = new Map<string, Map<string, DailyStatsRow>>();
  for (const row of daily.results) {
    let m = dailyByEndpoint.get(row.endpoint_id);
    if (!m) {
      m = new Map();
      dailyByEndpoint.set(row.endpoint_id, m);
    }
    m.set(row.date, row);
  }

  const allMeta: EndpointMeta[] = [
    ...endpoints,
    ...secretMeta.results.map((r) => ({
      id: r.id,
      name: r.name,
      group: r.group_name ?? undefined,
      degradedLatencyMs: r.degraded_latency_ms ?? undefined,
    })),
  ];

  const groupOrder: string[] = [];
  const groupMap = new Map<string, EndpointStatus[]>();

  for (const ep of allMeta) {
    if (isPrivate(ep.id)) continue;

    const groupName = ep.group ?? "Other";
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, []);
      groupOrder.push(groupName);
    }

    const cur = currentById.get(ep.id);
    const dailyMap = dailyByEndpoint.get(ep.id) ?? new Map<string, DailyStatsRow>();

    let health: Health = "unknown";
    if (cur) {
      if (!cur.ok) health = "down";
      else if (ep.degradedLatencyMs != null && cur.latency_ms != null && cur.latency_ms > ep.degradedLatencyMs)
        health = "degraded";
      else health = "up";
    }

    const history: DayBucket[] = [];
    for (let i = BAR_DAYS - 1; i >= 0; i--) {
      const date = isoDate(now - i * DAY_MS);
      const row = dailyMap.get(date);
      history.push({ date, pct: row ? (row.up_checks / row.checks) * 100 : null });
    }

    groupMap.get(groupName)!.push({
      id: ep.id,
      name: ep.name,
      health,
      latencyMs: cur?.latency_ms ?? null,
      error: cur?.error ?? null,
      checkedAt: cur?.checked_at ?? null,
      uptime7d: uptimeOver(dailyMap, 7, now),
      uptime30d: uptimeOver(dailyMap, 30, now),
      uptime90d: uptimeOver(dailyMap, 90, now),
      history,
    });
  }

  const groupConfigByName = new Map(groupConfigs.map((g) => [g.name, g]));
  const groups: StatusGroup[] = groupOrder.map((name) => {
    const cfg = groupConfigByName.get(name);
    return {
      name,
      collapsible: cfg?.collapsible ?? false,
      collapsed: cfg?.collapsed ?? false,
      endpoints: groupMap.get(name)!,
    };
  });

  const known = groups.flatMap((g) => g.endpoints).filter((e) => e.health !== "unknown");
  const downCount = known.filter((e) => e.health === "down").length;
  const degradedCount = known.filter((e) => e.health === "degraded").length;

  let overall: Overall;
  if (known.length === 0) overall = "unknown";
  else if (downCount === 0 && degradedCount === 0) overall = "operational";
  else if (downCount > 0 && downCount >= Math.ceil(known.length / 2)) overall = "major_outage";
  else overall = "degraded";

  return { generatedAt: now, overall, groups };
}

export interface DayDetail {
  date: string;
  checks: number;
  upChecks: number;
  pct: number | null;
  avgLatencyMs: number | null;
}

export interface EndpointDetail {
  id: string;
  name: string;
  group: string;
  health: Health;
  latencyMs: number | null;
  error: string | null;
  checkedAt: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  uptime90d: number | null;
  days: DayDetail[];
}

export async function gatherEndpointDetail(env: Env, id: string): Promise<EndpointDetail | null> {
  if (isPrivate(id)) return null;

  let ep: EndpointMeta | undefined = endpoints.find((e) => e.id === id);
  if (!ep) {
    const row = await env.DB.prepare("SELECT id, name, group_name, degraded_latency_ms FROM secret_endpoints WHERE id = ?")
      .bind(id)
      .first<SecretEndpointMetaRow>();
    if (row) ep = { id: row.id, name: row.name, group: row.group_name ?? undefined, degradedLatencyMs: row.degraded_latency_ms ?? undefined };
  }
  if (!ep) return null;

  const now = Date.now();
  const cutoff = isoDate(now - UPTIME_DAYS * DAY_MS);

  const [cur, daily] = await Promise.all([
    env.DB.prepare("SELECT * FROM current_status WHERE endpoint_id = ?").bind(id).first<CurrentStatusRow>(),
    env.DB.prepare("SELECT * FROM daily_stats WHERE endpoint_id = ? AND date >= ?").bind(id, cutoff).all<DailyStatsRow>(),
  ]);

  const dailyMap = new Map(daily.results.map((r) => [r.date, r]));

  let health: Health = "unknown";
  if (cur) {
    if (!cur.ok) health = "down";
    else if (ep.degradedLatencyMs != null && cur.latency_ms != null && cur.latency_ms > ep.degradedLatencyMs) health = "degraded";
    else health = "up";
  }

  const days: DayDetail[] = [];
  for (let i = UPTIME_DAYS - 1; i >= 0; i--) {
    const date = isoDate(now - i * DAY_MS);
    const row = dailyMap.get(date);
    days.push({
      date,
      checks: row?.checks ?? 0,
      upChecks: row?.up_checks ?? 0,
      pct: row ? (row.up_checks / row.checks) * 100 : null,
      avgLatencyMs: row?.avg_latency_ms ?? null,
    });
  }

  return {
    id: ep.id,
    name: ep.name,
    group: ep.group ?? "Other",
    health,
    latencyMs: cur?.latency_ms ?? null,
    error: cur?.error ?? null,
    checkedAt: cur?.checked_at ?? null,
    uptime7d: uptimeOver(dailyMap, 7, now),
    uptime30d: uptimeOver(dailyMap, 30, now),
    uptime90d: uptimeOver(dailyMap, 90, now),
    days,
  };
}

const HEALTH_TAG: Record<Health, string> = {
  up: "[UP]",
  degraded: "[WARN]",
  down: "[DOWN]",
  unknown: "[????]",
};

// Fixed column widths, shared by the header row and every data row, so
// columns line up regardless of name/value length.
const COL_STATUS = 8;
const COL_SERVICE = 34;
const COL_NUM = 10;

function fmtLatency(ms: number | null): string {
  // avg_latency_ms is a running average and rarely lands on a whole number.
  return ms == null ? "--" : `${Math.round(ms)}ms`;
}

function fmtPct(p: number | null): string {
  return p == null ? "--" : `${p.toFixed(2)}%`;
}

function padDots(s: string, width: number): string {
  if (s.length >= width) return s + " ";
  return s + " " + ".".repeat(Math.max(1, width - s.length - 1)) + " ";
}

// Same padding as padDots, but returns just the ". . . " tail -- for HTML,
// where the name itself becomes a link and the dots stay plain text.
function padDotsTail(s: string, width: number): string {
  if (s.length >= width) return " ";
  return " " + ".".repeat(Math.max(1, width - s.length - 1)) + " ";
}

function serviceHref(id: string): string {
  return `/service/${encodeURIComponent(id)}`;
}

function historyChar(pct: number | null): { ch: string; cls: "up" | "warn" | "down" | "none" } {
  // "·" (middle dot) instead of a period so the no-data glyph sits
  // vertically centered like the other marks, not baseline/bottom.
  if (pct == null) return { ch: "·", cls: "none" };
  if (pct >= 99.9) return { ch: "#", cls: "up" };
  if (pct >= 95) return { ch: "+", cls: "warn" };
  return { ch: "x", cls: "down" };
}

function historyLabel(cls: "up" | "warn" | "down" | "none"): string {
  switch (cls) {
    case "up":
      return "UP";
    case "warn":
      return "PARTIAL";
    case "down":
      return "DOWN";
    case "none":
      return "NO DATA";
  }
}

// A single day's glyph plus a CSS-only floating tooltip (no JS, no native
// title attribute -- that has a slow default delay and doesn't work on touch).
function historyDaySpan(d: DayBucket): string {
  const { ch, cls } = historyChar(d.pct);
  const detail = d.pct == null ? escapeHtml(d.date) : `${escapeHtml(d.date)} &middot; ${d.pct.toFixed(2)}%`;
  return `<span class="hday hist-${cls}">${ch}<span class="tt"><b class="hist-${cls}">${historyLabel(cls)}</b>${detail}</span></span>`;
}

function bannerLine(overall: Overall): string {
  switch (overall) {
    case "operational":
      return "ALL SYSTEMS OPERATIONAL";
    case "degraded":
      return "DEGRADED PERFORMANCE";
    case "major_outage":
      return "MAJOR OUTAGE";
    case "unknown":
      return "STATUS UNKNOWN (no data yet)";
  }
}

// Renders an absolute instant in the viewer's local timezone (detected from
// their IP via request.cf.timezone -- see index.ts). Falls back to UTC if tz
// is invalid/unavailable. Storage stays UTC throughout; only display changes.
function fmtTimestampTz(ms: number, tz: string): string {
  try {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(new Date(ms))
      .replace(",", "");
    const tzName =
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date(ms))
        .find((p) => p.type === "timeZoneName")?.value ?? tz;
    return `${date} ${tzName}`;
  } catch {
    return `${new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "")} UTC`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function headerRow(): string {
  return (
    "NOW".padEnd(COL_STATUS) +
    "SERVICE".padEnd(COL_SERVICE) +
    "LATENCY".padStart(COL_NUM) +
    "7D".padStart(COL_NUM) +
    "30D".padStart(COL_NUM) +
    "90D".padStart(COL_NUM)
  );
}

// The rule width used for every divider on the page, derived from the
// header itself so it can never drift out of sync with the columns.
const TABLE_WIDTH = headerRow().length;

function dataRow(ep: EndpointStatus) {
  return {
    status: HEALTH_TAG[ep.health].padEnd(COL_STATUS),
    service: padDots(ep.name, COL_SERVICE),
    latency: fmtLatency(ep.latencyMs).padStart(COL_NUM),
    u7: fmtPct(ep.uptime7d).padStart(COL_NUM),
    u30: fmtPct(ep.uptime30d).padStart(COL_NUM),
    u90: fmtPct(ep.uptime90d).padStart(COL_NUM),
  };
}

export function renderText(data: StatusData, tz: string): string {
  const lines: string[] = [];
  lines.push("# hackclub status");
  lines.push(`# updated ${fmtTimestampTz(data.generatedAt, tz)}`);
  lines.push("");
  lines.push(`# Timestamps above are shown in your local time (detected: ${tz}). Day buckets below are formatted in UTC.`);
  lines.push("");
  lines.push("=".repeat(TABLE_WIDTH));
  lines.push(`  ${bannerLine(data.overall)}`);
  lines.push("=".repeat(TABLE_WIDTH));
  for (const group of data.groups) {
    lines.push("");
    lines.push("");
    lines.push(group.name.toUpperCase());
    lines.push("=".repeat(TABLE_WIDTH));
    lines.push(headerRow());
    lines.push("-".repeat(TABLE_WIDTH));
    for (const ep of group.endpoints) {
      const r = dataRow(ep);
      const hist = ep.history.map((d) => historyChar(d.pct).ch).join("");
      lines.push(`${r.status}${r.service}${r.latency}${r.u7}${r.u30}${r.u90}`);
      lines.push(`${" ".repeat(COL_STATUS)}${hist}`);
      if (ep.error) lines.push(`${" ".repeat(COL_STATUS)}${ep.error}`);
      lines.push("");
    }
  }
  lines.push("");
  return lines.join("\n");
}

const CSS = BASE_CSS;

function groupTableHtml(group: StatusGroup): string {
  const lines: string[] = [];
  lines.push("=".repeat(TABLE_WIDTH));
  lines.push(`<span class="dim">${escapeHtml(headerRow())}</span>`);
  lines.push("-".repeat(TABLE_WIDTH));
  for (const ep of group.endpoints) {
    const r = dataRow(ep);
    const tag = `<span class="st-${ep.health}">${r.status}</span>`;
    const service = `<a href="${serviceHref(ep.id)}">${escapeHtml(ep.name)}</a>${padDotsTail(ep.name, COL_SERVICE)}`;
    const hist = ep.history.map(historyDaySpan).join("");
    lines.push(`${tag}${service}${r.latency}${r.u7}${r.u30}${r.u90}`);
    lines.push(`${" ".repeat(COL_STATUS)}<span class="hist-row">${hist}</span>`);
    if (ep.error) lines.push(`${" ".repeat(COL_STATUS)}<span class="dim">${escapeHtml(ep.error)}</span>`);
    lines.push("");
  }
  return `<pre>${lines.join("\n")}</pre>`;
}

export function renderHtml(data: StatusData, tz: string): string {
  const intro: string[] = [];
  intro.push("# hackclub status");
  intro.push(`# updated ${fmtTimestampTz(data.generatedAt, tz)}`);
  intro.push("");
  intro.push(`! Timestamps above are shown in your local time (detected: ${escapeHtml(tz)}). Day buckets below are UTC calendar days.`);
  intro.push("");
  intro.push("=".repeat(TABLE_WIDTH));
  intro.push(`  <span class="banner banner-${data.overall}">${bannerLine(data.overall)}</span>`);
  intro.push("=".repeat(TABLE_WIDTH));

  const sections = data.groups.map((group) => {
    const name = escapeHtml(group.name.toUpperCase());
    const table = groupTableHtml(group);
    if (group.collapsible) {
      return `<details class="group"${group.collapsed ? "" : " open"}><summary class="group-name">${name}</summary>${table}</details>`;
    }
    return `<pre class="group-name">${name}</pre>${table}`;
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>hackclub status</title>
<style>${CSS}</style>
</head>
<body>
<div class="doc">
<pre>${intro.join("\n")}</pre>
${sections.join("\n")}
</div>
</body>
</html>
`;
}

const DCOL_DATE = 14;
const DCOL_TAG = 9;
const DCOL_PCT = 10;
const DCOL_LAT = 14;
const DCOL_CHECKS = 9;

function detailHeaderRow(): string {
  return (
    "DATE".padEnd(DCOL_DATE) +
    "DAY".padStart(DCOL_TAG) +
    "UPTIME".padStart(DCOL_PCT) +
    "AVG LATENCY".padStart(DCOL_LAT) +
    "CHECKS".padStart(DCOL_CHECKS)
  );
}

const DETAIL_TABLE_WIDTH = detailHeaderRow().length;

export function renderEndpointDetail(detail: EndpointDetail, tz: string): string {
  const lines: string[] = [];
  lines.push(`# hackclub status - ${detail.name}`);
  lines.push(`<a href="/">&lt;- back to status</a>`);
  lines.push("");
  lines.push("=".repeat(DETAIL_TABLE_WIDTH));
  const tag = `<span class="st-${detail.health}">${HEALTH_TAG[detail.health]}</span>`;
  lines.push(`  ${tag}  <span class="group-name">${escapeHtml(detail.name)}</span> <span class="dim">(${escapeHtml(detail.group)})</span>`);
  lines.push("=".repeat(DETAIL_TABLE_WIDTH));
  lines.push("");
  const checkedAt = detail.checkedAt == null ? "" : `  <span class="dim">(checked ${fmtTimestampTz(detail.checkedAt, tz)})</span>`;
  lines.push(`now: ${fmtLatency(detail.latencyMs)}${checkedAt}`);
  lines.push(`7d: ${fmtPct(detail.uptime7d)}    30d: ${fmtPct(detail.uptime30d)}    90d: ${fmtPct(detail.uptime90d)}`);
  if (detail.error) lines.push(`<span class="dim">${escapeHtml(detail.error)}</span>`);
  lines.push("");
  lines.push(`<span class="dim">The following is in UTC.</span>`);
  lines.push(`<span class="dim">${escapeHtml(detailHeaderRow())}</span>`);
  lines.push("");
  lines.push("-".repeat(DETAIL_TABLE_WIDTH));
  for (const d of [...detail.days].reverse()) {
    const { ch, cls } = historyChar(d.pct);
    const row =
      d.date.padEnd(DCOL_DATE) +
      ch.padStart(DCOL_TAG) +
      fmtPct(d.pct).padStart(DCOL_PCT) +
      fmtLatency(d.avgLatencyMs).padStart(DCOL_LAT) +
      String(d.checks).padStart(DCOL_CHECKS);
    lines.push(`<span class="hist-${cls}">${escapeHtml(row)}</span>`);
  }
  lines.push("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hackclub status -- ${escapeHtml(detail.name)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="doc">
<pre class="detail-table">${lines.join("\n")}</pre>
</div>
</body>
</html>
`;
}
