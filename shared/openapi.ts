// OpenAPI spec for hcdown's JSON API, served live at GET /openapi.yaml by
// the website worker (see website/src/index.ts). This is the single source
// of truth -- there is no separate static openapi.yaml file to drift out of
// sync with it. Keep in sync with the TS interfaces in
// website/src/render.ts (StatusData, EndpointStatus, DayBucket,
// EndpointDetail, DayDetail) and with docs/API.md.
export const OPENAPI_YAML = `
openapi: 3.1.0
info:
  title: hcdown API
  description: >
    JSON API for the Hack Club status page. /status.json is public and
    unauthenticated (unchanged, kept for backwards compatibility). The
    /api/* routes require an API key and add per-endpoint history/latency
    detail that isn't available anywhere else. See docs/API.md for the full
    human-readable reference.
  version: "1.0"
servers:
  - url: /
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >
        Send as \`Authorization: Bearer <API_KEY>\`. Keys are created and
        revoked from /admin, shown once at creation time.
  schemas:
    Health:
      type: string
      enum: [up, degraded, down, unknown]
    Overall:
      type: string
      enum: [operational, degraded, major_outage, unknown]
    DayBucket:
      type: object
      properties:
        date: { type: string, format: date, description: "UTC calendar day, YYYY-MM-DD" }
        pct: { type: [number, "null"], description: "That day's ping success rate, 0-100. null if no data." }
      required: [date, pct]
    EndpointStatus:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        health: { $ref: "#/components/schemas/Health" }
        latencyMs: { type: [integer, "null"] }
        error: { type: [string, "null"] }
        checkedAt: { type: [integer, "null"], description: "Unix ms of the last check." }
        uptime7d: { type: [number, "null"] }
        uptime30d: { type: [number, "null"] }
        uptime90d: { type: [number, "null"] }
        history:
          type: array
          items: { $ref: "#/components/schemas/DayBucket" }
      required: [id, name, health, latencyMs, error, checkedAt, uptime7d, uptime30d, uptime90d, history]
    StatusGroup:
      type: object
      properties:
        name: { type: string }
        collapsible: { type: boolean }
        collapsed: { type: boolean }
        endpoints:
          type: array
          items: { $ref: "#/components/schemas/EndpointStatus" }
      required: [name, collapsible, collapsed, endpoints]
    StatusData:
      type: object
      properties:
        generatedAt: { type: integer, description: "Unix ms this response was generated." }
        overall: { $ref: "#/components/schemas/Overall" }
        groups:
          type: array
          items: { $ref: "#/components/schemas/StatusGroup" }
        viewerTimezone: { type: string, description: "IANA tz name detected from the caller's IP." }
      required: [generatedAt, overall, groups]
    DayDetail:
      type: object
      properties:
        date: { type: string, format: date }
        checks: { type: integer }
        upChecks: { type: integer }
        pct: { type: [number, "null"] }
        avgLatencyMs: { type: [number, "null"] }
      required: [date, checks, upChecks, pct, avgLatencyMs]
    EndpointDetail:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        group: { type: string }
        health: { $ref: "#/components/schemas/Health" }
        latencyMs: { type: [integer, "null"] }
        error: { type: [string, "null"] }
        checkedAt: { type: [integer, "null"] }
        uptime7d: { type: [number, "null"] }
        uptime30d: { type: [number, "null"] }
        uptime90d: { type: [number, "null"] }
        days:
          type: array
          description: Up to 90 days, oldest first.
          items: { $ref: "#/components/schemas/DayDetail" }
      required: [id, name, group, health, latencyMs, error, checkedAt, uptime7d, uptime30d, uptime90d, days]
    Error:
      type: object
      properties:
        error: { type: string }
      required: [error]
paths:
  /status.json:
    get:
      summary: Overall status (public)
      description: Unauthenticated. Same data the homepage renders.
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/StatusData" }
  /api/status:
    get:
      summary: Overall status (authenticated)
      security: [{ bearerAuth: [] }]
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/StatusData" }
        "401":
          description: Missing or invalid API key
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
  /api/service/{id}:
    get:
      summary: Single endpoint's history, latency, and uptime
      security: [{ bearerAuth: [] }]
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/EndpointDetail" }
        "401":
          description: Missing or invalid API key
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
        "404":
          description: Unknown or private endpoint id
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
`.trim();
