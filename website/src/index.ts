import { checkApiKey, unauthorized } from "../../shared/apiAuth";
import { OPENAPI_YAML } from "../../shared/openapi";
import { renderApiDocsHtml } from "./docs";
import { gatherEndpointDetail, gatherStatus, renderEndpointDetail, renderHtml, type Env } from "./render";

export default {
  async fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    // Geolocated from the request's IP by Cloudflare -- no lookup needed.
    // Storage stays UTC; this only affects how timestamps are displayed.
    const tz = req.cf?.timezone ?? "UTC";

    if (pathname === "/") {
      const data = await gatherStatus(env);
      return new Response(renderHtml(data, tz), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/status.json") {
      const data = await gatherStatus(env);
      return Response.json({ ...data, viewerTimezone: tz });
    }
    if (pathname.startsWith("/service/")) {
      const id = decodeURIComponent(pathname.slice("/service/".length));
      const detail = await gatherEndpointDetail(env, id);
      if (!detail) return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      return new Response(renderEndpointDetail(detail, tz), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/docs") {
      return new Response(renderApiDocsHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/openapi.yaml") {
      return new Response(OPENAPI_YAML, { headers: { "content-type": "application/yaml; charset=utf-8" } });
    }

    // Authenticated JSON API -- see docs/API.md.
    if (pathname === "/api/status") {
      if (!(await checkApiKey(req, env, ctx))) return unauthorized();
      const data = await gatherStatus(env);
      return Response.json({ ...data, viewerTimezone: tz });
    }
    if (pathname.startsWith("/api/service/")) {
      if (!(await checkApiKey(req, env, ctx))) return unauthorized();
      const id = decodeURIComponent(pathname.slice("/api/service/".length));
      const detail = await gatherEndpointDetail(env, id);
      if (!detail) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(detail);
    }

    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
} satisfies ExportedHandler<Env>;
