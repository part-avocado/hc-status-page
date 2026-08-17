import { endpoints } from "../../shared/endpoints";
import { BASE_CSS } from "../../shared/theme";

interface Env {
  DB: D1Database;
}

interface SecretEndpointRow {
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CSS =
  BASE_CSS +
  `
.row { margin: 1em 0; padding: 0.75em; border: 1px solid var(--dim); border-radius: 4px; }
.rowhead { margin-bottom: 0.5em; }
.field { display: block; margin: 0.3em 0; }
.field label { display: inline-block; width: 140px; }
.field input {
  font-family: inherit;
  font-size: inherit;
  width: 320px;
  max-width: 60vw;
  padding: 0.3em 0.5em;
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--dim);
  border-radius: 3px;
}
.field input.narrow { width: 100px; }
button {
  font-family: inherit;
  font-size: inherit;
  padding: 0.3em 0.8em;
  margin-top: 0.5em;
  margin-right: 0.4em;
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--dim);
  border-radius: 3px;
  cursor: pointer;
}
button:hover { border-color: var(--fg); }
button.danger:hover { border-color: var(--down); color: var(--down); }
.msg { color: var(--up); font-weight: bold; }
.err { color: var(--down); font-weight: bold; }
`;

function page(bodyHtml: string, email: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hcdown admin</title>
<style>${CSS}</style>
</head>
<body>
<div class="doc">
<pre># hcdown admin
logged in as ${escapeHtml(email)} -- <a href="/cdn-cgi/access/logout">sign out</a></pre>
${bodyHtml}
</div>
</body>
</html>
`;
}

function fieldsHtml(row: Partial<SecretEndpointRow>): string {
  const v = (x: unknown) => (x == null ? "" : escapeHtml(String(x)));
  return `
  <div class="field"><label>name</label><input type="text" name="name" value="${v(row.name)}" required></div>
  <div class="field"><label>url</label><input type="text" name="url" value="${v(row.url)}" placeholder="https://..." required style="width:480px"></div>
  <div class="field"><label>method</label><input type="text" name="method" value="${v(row.method)}" placeholder="GET" class="narrow"></div>
  <div class="field"><label>expected status</label><input type="text" name="expectedLo" value="${v(row.expected_status_lo)}" placeholder="200" class="narrow"> to <input type="text" name="expectedHi" value="${v(row.expected_status_hi)}" placeholder="299" class="narrow"></div>
  <div class="field"><label>timeout (ms)</label><input type="text" name="timeoutMs" value="${v(row.timeout_ms)}" placeholder="10000" class="narrow"></div>
  <div class="field"><label>degraded above (ms)</label><input type="text" name="degradedLatencyMs" value="${v(row.degraded_latency_ms)}" placeholder="(none)" class="narrow"></div>`;
}

async function renderList(env: Env, message?: string, error?: string): Promise<string> {
  const rows = await env.DB.prepare("SELECT * FROM secret_endpoints ORDER BY id").all<SecretEndpointRow>();

  const parts: string[] = [];
  if (message) parts.push(`<p class="msg">${escapeHtml(message)}</p>`);
  if (error) parts.push(`<p class="err">${escapeHtml(error)}</p>`);

  parts.push(`<pre>ADD A SENSITIVE ENDPOINT
=========================
Fully self-contained: pings start as soon as you save. Not visible on the public
site/status.txt/status.json unless you also give it an id (below) prefixed
"!PRIVATE." -- otherwise its name/status/uptime are public, only the URL is hidden.
id must not collide with any id in shared/endpoints.ts or another row here.</pre>
<form method="post" action="/admin/endpoints" class="row">
  <label class="field"><label>id</label><input type="text" name="id" placeholder="my-new-endpoint" required></label>
  ${fieldsHtml({})}
  <div><button type="submit">add</button></div>
</form>`);

  parts.push(`<pre>SENSITIVE ENDPOINTS (${rows.results.length})
=========================</pre>`);

  if (rows.results.length === 0) {
    parts.push(`<pre class="dim">none yet</pre>`);
  }

  for (const row of rows.results) {
    parts.push(`
<form method="post" action="/admin/endpoints/${encodeURIComponent(row.id)}" class="row">
  <div class="rowhead"><b>${escapeHtml(row.name)}</b> <span class="dim">(id: ${escapeHtml(row.id)})</span></div>
  ${fieldsHtml(row)}
  <div>
    <button type="submit">save</button>
    <button type="submit" formaction="/admin/endpoints/${encodeURIComponent(row.id)}/delete" class="danger">delete</button>
  </div>
</form>`);
  }

  return parts.join("\n");
}

interface ParsedFields {
  name: string;
  url: string;
  method: string | null;
  expectedLo: number | null;
  expectedHi: number | null;
  timeoutMs: number | null;
  degradedLatencyMs: number | null;
}

function parseFields(form: FormData): ParsedFields | { error: string } {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const name = str("name");
  const url = str("url");
  const method = str("method").toUpperCase();
  const expectedLoStr = str("expectedLo");
  const expectedHiStr = str("expectedHi");
  const timeoutMsStr = str("timeoutMs");
  const degradedStr = str("degradedLatencyMs");

  if (!name) return { error: "name is required" };
  if (!url) return { error: "url is required" };
  try {
    new URL(url);
  } catch {
    return { error: `"${url}" is not a valid URL` };
  }
  if (method && !["GET", "HEAD", "POST"].includes(method)) return { error: "method must be GET, HEAD, or POST" };

  const numErrors: string[] = [];
  const num = (s: string, field: string): number | null => {
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) {
      numErrors.push(`${field} must be a number`);
      return null;
    }
    return n;
  };
  const expectedLo = num(expectedLoStr, "expected status (low)");
  const expectedHi = num(expectedHiStr, "expected status (high)");
  const timeoutMs = num(timeoutMsStr, "timeout");
  const degradedLatencyMs = num(degradedStr, "degraded-above latency");
  if (numErrors.length > 0) return { error: numErrors.join("; ") };
  if ((expectedLoStr === "") !== (expectedHiStr === "")) return { error: "expected status needs both a low and high value, or neither" };
  if (expectedLo != null && expectedHi != null && expectedLo > expectedHi) return { error: "expected status low must be <= high" };

  return {
    name,
    url,
    method: method || null,
    expectedLo,
    expectedHi,
    timeoutMs,
    degradedLatencyMs,
  };
}

export default {
  async fetch(req, env, ctx) {
    // Fail closed: if Cloudflare Access hasn't been enabled on this Worker
    // yet, refuse to serve anything rather than exposing the admin UI.
    if (!ctx.access) {
      return new Response(
        "Cloudflare Access is not enabled on this Worker yet.\nEnable it in the dashboard: this Worker -> Access tab -> Protect this Worker behind Access.\n",
        { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    const identity = await ctx.access.getIdentity();
    const email = identity?.email ?? "unknown";

    const url = new URL(req.url);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/admin")) {
      const debug = `<details><summary class="dim">debug: your identity claims</summary><pre class="dim">${escapeHtml(
        JSON.stringify(identity, null, 2),
      )}</pre></details>`;
      return new Response(page(debug + (await renderList(env)), email), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Add a new sensitive endpoint.
    if (req.method === "POST" && url.pathname === "/admin/endpoints") {
      const form = await req.formData();
      const id = String(form.get("id") ?? "").trim();
      if (!id || !/^[A-Za-z0-9._!-]+$/.test(id)) {
        return new Response(page(await renderList(env, undefined, "id is required and may only contain letters, numbers, . _ ! -"), email), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (endpoints.some((e) => e.id === id)) {
        return new Response(page(await renderList(env, undefined, `id "${id}" is already used by a normal endpoint in shared/endpoints.ts`), email), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      const existing = await env.DB.prepare("SELECT 1 FROM secret_endpoints WHERE id = ?").bind(id).first();
      if (existing) {
        return new Response(page(await renderList(env, undefined, `id "${id}" already exists -- edit it below instead`), email), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      const parsed = parseFields(form);
      if ("error" in parsed) {
        return new Response(page(await renderList(env, undefined, parsed.error), email), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      await env.DB.prepare(
        `INSERT INTO secret_endpoints (id, name, url, method, expected_status_lo, expected_status_hi, timeout_ms, degraded_latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, parsed.name, parsed.url, parsed.method, parsed.expectedLo, parsed.expectedHi, parsed.timeoutMs, parsed.degradedLatencyMs)
        .run();
      return new Response(page(await renderList(env, `added ${id}`), email), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const editMatch = url.pathname.match(/^\/admin\/endpoints\/([^/]+)$/);
    if (req.method === "POST" && editMatch) {
      const id = decodeURIComponent(editMatch[1]);
      const form = await req.formData();
      const parsed = parseFields(form);
      if ("error" in parsed) {
        return new Response(page(await renderList(env, undefined, parsed.error), email), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      const result = await env.DB.prepare(
        `UPDATE secret_endpoints SET name = ?, url = ?, method = ?, expected_status_lo = ?, expected_status_hi = ?, timeout_ms = ?, degraded_latency_ms = ?
         WHERE id = ?`,
      )
        .bind(parsed.name, parsed.url, parsed.method, parsed.expectedLo, parsed.expectedHi, parsed.timeoutMs, parsed.degradedLatencyMs, id)
        .run();
      const message = result.meta.changes > 0 ? `saved ${id}` : undefined;
      const error = result.meta.changes > 0 ? undefined : `id "${id}" not found`;
      return new Response(page(await renderList(env, message, error), email), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const deleteMatch = url.pathname.match(/^\/admin\/endpoints\/([^/]+)\/delete$/);
    if (req.method === "POST" && deleteMatch) {
      const id = decodeURIComponent(deleteMatch[1]);
      await env.DB.prepare("DELETE FROM secret_endpoints WHERE id = ?").bind(id).run();
      return new Response(page(await renderList(env, `deleted ${id}`), email), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
} satisfies ExportedHandler<Env>;
