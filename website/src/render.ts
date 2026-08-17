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

// A service is "degraded" once today's ping success rate drops below this,
// and "down" once it drops below the lower threshold -- rather than judging
// health off a single latest check.
const DEGRADED_BELOW_PCT = 90;
const DOWN_BELOW_PCT = 70;

// Classifies live health off today's running success rate (checks that
// returned within their configured timeout vs. total checks so far today).
// Falls back to the single latest check when today has no samples yet (e.g.
// just after UTC midnight, before the next ping has run).
function classifyHealth(cur: CurrentStatusRow | null | undefined, todayStats: DailyStatsRow | undefined): Health {
  if (!cur) return "unknown";
  if (!todayStats || todayStats.checks === 0) return cur.ok ? "up" : "down";
  const pct = (todayStats.up_checks / todayStats.checks) * 100;
  if (pct < DOWN_BELOW_PCT) return "down";
  if (pct < DEGRADED_BELOW_PCT) return "degraded";
  return "up";
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

    const health = classifyHealth(cur, dailyMap.get(isoDate(now)));

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

  const health = classifyHealth(cur, dailyMap.get(isoDate(now)));

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

// "·" (middle dot) rather than "." -- periods sit low/narrow in a monospace
// cell and read as unevenly spaced at small sizes; the middle dot is
// vertically centered and holds a consistent rhythm across a run (same
// reasoning as the no-data glyph in historyChar below).
const FILL_CHAR = "·";

// The fill run needs to know the latency string it's leading up to, not just
// a fixed column width -- otherwise the dots stop at COL_SERVICE and the
// latency's own right-alignment padding leaves a second, dot-less gap
// between the last dot and the number. Sizing the fill against COL_SERVICE +
// COL_NUM - latencyStr.length instead makes the dots run straight up to the
// number, while the combined name+fill+latency segment still totals exactly
// COL_SERVICE + COL_NUM characters -- so the 7D/30D/90D columns after it
// stay aligned exactly as before.
function fillWidth(nameLen: number, latencyLen: number): number {
  return Math.max(1, COL_SERVICE + COL_NUM - nameLen - latencyLen - 2);
}

function padDots(s: string, latencyStr: string): string {
  return s + " " + FILL_CHAR.repeat(fillWidth(s.length, latencyStr.length)) + " " + latencyStr;
}

// Same padding as padDots, but returns just the fill-plus-latency tail --
// for HTML, where the name itself becomes a link and the fill stays plain
// text.
function padDotsTail(s: string, latencyStr: string): string {
  return " " + FILL_CHAR.repeat(fillWidth(s.length, latencyStr.length)) + " " + latencyStr;
}

// A decorative "=" divider line, wrapped so it can be styled to stop at the
// viewport edge on narrow screens instead of word-wrapping onto a second
// line (see .rule in shared/theme.ts).
function ruleLine(width: number): string {
  return `<span class="rule">${"=".repeat(width)}</span>`;
}

function serviceHref(id: string): string {
  return `/service/${encodeURIComponent(id)}`;
}

// Thresholds for the per-day history glyph (#, +, x): degraded once a day's
// ping success rate drops below 95%, broken once it drops below 80%.
const DAY_DEGRADED_BELOW_PCT = 95;
const DAY_DOWN_BELOW_PCT = 80;

function historyChar(pct: number | null): { ch: string; cls: "up" | "warn" | "down" | "none" } {
  // "·" (middle dot) instead of a period so the no-data glyph sits
  // vertically centered like the other marks, not baseline/bottom.
  if (pct == null) return { ch: "·", cls: "none" };
  if (pct < DAY_DOWN_BELOW_PCT) return { ch: "x", cls: "down" };
  if (pct < DAY_DEGRADED_BELOW_PCT) return { ch: "+", cls: "warn" };
  return { ch: "#", cls: "up" };
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

function footerHtml(): string {
  return `<pre class="dim footer">made by <a href="https://hackclub.enterprise.slack.com/team/U0A06EPFV45">@partavocado</a> :3 &middot; <a href="/docs">API docs</a></pre>`;
}

function bannerLine(overall: Overall): string {
  switch (overall) {
    case "operational":
      return "it's working";
    case "degraded":
      return "it's slowed";
    case "major_outage":
      return "it's gone";
    case "unknown":
      return "don't ask me gng";
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
  // service already has the latency folded into its tail (see padDots) --
  // there's no separate .latency field to concatenate after it.
  return {
    status: HEALTH_TAG[ep.health].padEnd(COL_STATUS),
    service: padDots(ep.name, fmtLatency(ep.latencyMs)),
    u7: fmtPct(ep.uptime7d).padStart(COL_NUM),
    u30: fmtPct(ep.uptime30d).padStart(COL_NUM),
    u90: fmtPct(ep.uptime90d).padStart(COL_NUM),
  };
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
    const service = `<a href="${serviceHref(ep.id)}">${escapeHtml(ep.name)}</a>${padDotsTail(ep.name, fmtLatency(ep.latencyMs))}`;
    const hist = ep.history.map(historyDaySpan).join("");
    lines.push(`${tag}${service}${r.u7}${r.u30}${r.u90}`);
    lines.push(`${" ".repeat(COL_STATUS)}<span class="hist-row">${hist}</span>`);
    if (ep.error) lines.push(`${" ".repeat(COL_STATUS)}<span class="dim">${escapeHtml(ep.error)}</span>`);
    lines.push("");
  }
  return `<pre class="mono-table">${lines.join("\n")}</pre>`;
}

// Restores each collapsible group's open/closed state from localStorage
// (overriding the server-rendered default) and keeps it saved on toggle --
// so it survives the page's 120s meta-refresh reload.
const PAGE_SCRIPT = `(function () {
  var KEY = "hcstatus:groupOpen";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  document.querySelectorAll("details.group[data-group]").forEach(function (d) {
    var key = d.getAttribute("data-group");
    if (Object.prototype.hasOwnProperty.call(state, key)) d.open = state[key];
    d.addEventListener("toggle", function () {
      state[key] = d.open;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    });
  });
})();`;

export function renderHtml(data: StatusData, tz: string): string {
  const intro: string[] = [];
  intro.push("# hackclub status");
  intro.push(`# updated ${fmtTimestampTz(data.generatedAt, tz)}`);
  intro.push("");
  intro.push(`! Timestamps above are shown in your local time (detected: ${escapeHtml(tz)}). Day buckets below are UTC calendar days.`);
  intro.push("");
  intro.push(ruleLine(TABLE_WIDTH));
  intro.push(`  <span class="banner banner-${data.overall}">${bannerLine(data.overall)}</span>`);
  intro.push(ruleLine(TABLE_WIDTH));

  const sections = data.groups.map((group) => {
    const name = escapeHtml(group.name.toUpperCase());
    const table = groupTableHtml(group);
    if (group.collapsible) {
      return `<details class="group" data-group="${escapeHtml(group.name)}"${group.collapsed ? "" : " open"}><summary class="group-name">${name}</summary>${table}</details>`;
    }
    return `<pre class="group-name">${name}</pre>${table}`;
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="120">
<title>hackclub status</title>
<style>${CSS}</style>
</head>
<body>
<div class="doc">
<pre>${intro.join("\n")}</pre>
${sections.join("\n")}
${footerHtml()}
</div>
<script>${PAGE_SCRIPT}</script>
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
  lines.push("");
  lines.push(`<span class="dim">${escapeHtml(detailHeaderRow())}</span>`);
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
<pre class="detail-table mono-table">${lines.join("\n")}</pre>
${footerHtml()}
</div>
</body>
</html>
`;
}
