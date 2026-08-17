import { BASE_CSS } from "../../shared/theme";

// On-site API reference, in the same plaintext-in-<pre> style as the rest
// of hcdown. This is a short companion to the full reference in
// docs/API.md (linked below) -- not a duplicate of it.
export function renderApiDocsHtml(): string {
  const body = `# hcdown API
<a href="/">&lt;- back to status</a>

Full reference (schemas, error shapes, more examples): <a href="https://github.com/part-avocado/hc-status-page/blob/main/docs/API.md">docs/API.md</a>
Machine-readable spec: <a href="/openapi.yaml">/openapi.yaml</a>

====================================================================
  PUBLIC (no auth)
====================================================================

GET /status.json
  Same data as the homepage, as JSON.

  curl https://status.hackclub.com/status.json

GET /service/:id
  HTML detail page for one endpoint (history, latency, uptime).


====================================================================
  AUTHENTICATED API (requires an API key)
====================================================================

Send your key as a bearer token:

  Authorization: Bearer &lt;API_KEY&gt;

Missing or wrong key -> 401 {"error": "unauthorized"}

GET /api/status
  Same shape as /status.json.

  curl -H "Authorization: Bearer $API_KEY" \\
    https://status.hackclub.com/api/status

GET /api/service/:id
  A single endpoint's health, latency, uptime (7d/30d/90d), and up to 90
  days of per-day history -- the same data behind /service/:id, as JSON.
  404 {"error": "not found"} for an unknown or private id.

  curl -H "Authorization: Bearer $API_KEY" \\
    https://status.hackclub.com/api/service/hackatime
`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hcdown API docs</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="doc">
<pre>${body}</pre>
<pre class="dim footer"><a href="/">&lt;- back to status</a></pre>
</div>
</body>
</html>
`;
}
