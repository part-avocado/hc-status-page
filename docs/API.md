# hcdown API

The `website` worker serves both the human-facing status page and a JSON API.
A short version of this doc is also on the site at [`/docs`](https://status.hackclub.com/docs),
and a machine-readable spec is served live at [`/openapi.yaml`](https://status.hackclub.com/openapi.yaml).

## Public routes (no auth)

### `GET /`
The status page, as HTML.

### `GET /status.json`
Overall status for every non-private endpoint, as JSON. Unauthenticated,
unchanged behavior -- safe for existing consumers.

```bash
curl https://status.hackclub.com/status.json
```

```jsonc
{
  "generatedAt": 1755000000000,
  "overall": "operational", // "operational" | "degraded" | "major_outage" | "unknown"
  "groups": [
    {
      "name": "Core Websites",
      "collapsible": true,
      "collapsed": false,
      "endpoints": [
        {
          "id": "site",
          "name": "hackclub.com",
          "health": "up", // "up" | "degraded" | "down" | "unknown"
          "latencyMs": 123,
          "error": null,
          "checkedAt": 1755000000000,
          "uptime7d": 100,
          "uptime30d": 99.98,
          "uptime90d": 99.95,
          "history": [{ "date": "2026-08-16", "pct": 100 }]
        }
      ]
    }
  ],
  "viewerTimezone": "America/New_York"
}
```

### `GET /service/:id`
HTML detail page for one endpoint (history, latency, uptime windows).
404 for an unknown or private id.

## Authenticated API

These endpoints require an API key, created from the `/admin` page (protected
by Cloudflare Access, same as the rest of admin). Enter a name for the key
and submit -- the plaintext value is shown **once**, immediately after
creation, and never again. Revoke a key any time from the same page.

Send it as a bearer token:

```
Authorization: Bearer <API_KEY>
```

A missing or wrong key returns `401`:

```json
{ "error": "unauthorized" }
```

### `GET /api/status`
Same response shape as `GET /status.json` above, but authenticated.

```bash
curl -H "Authorization: Bearer $API_KEY" https://status.hackclub.com/api/status
```

### `GET /api/service/:id`
A single endpoint's current health, latency, uptime windows, and up to 90
days of per-day history (checks, successful checks, success %, average
latency) -- the same data the `/service/:id` HTML page renders, but as JSON.
This is the only way to get per-endpoint historical/latency data
programmatically.

```bash
curl -H "Authorization: Bearer $API_KEY" https://status.hackclub.com/api/service/hackatime
```

```jsonc
{
  "id": "hackatime",
  "name": "Hackatime",
  "group": "Services",
  "health": "up",
  "latencyMs": 123,
  "error": null,
  "checkedAt": 1755000000000,
  "uptime7d": 100,
  "uptime30d": 99.98,
  "uptime90d": 99.95,
  "days": [
    {
      "date": "2026-05-20",
      "checks": 1440,
      "upChecks": 1440,
      "pct": 100,
      "avgLatencyMs": 118
    }
    // ... up to 90 days, oldest first
  ]
}
```

Errors:
- `401 { "error": "unauthorized" }` -- missing or invalid API key.
- `404 { "error": "not found" }` -- unknown or private endpoint id.

## Machine-readable spec

`GET /openapi.yaml` serves an OpenAPI 3.1 document covering `/status.json`,
`/api/status`, and `/api/service/{id}` -- point Swagger UI, Redoc, or a
codegen tool at it directly. Its source is
[`shared/openapi.ts`](../shared/openapi.ts).
