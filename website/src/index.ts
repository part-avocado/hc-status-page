import { gatherEndpointDetail, gatherStatus, renderEndpointDetail, renderHtml, renderText, type Env } from "./render";

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    // Geolocated from the request's IP by Cloudflare -- no lookup needed.
    // Storage stays UTC; this only affects how timestamps are displayed.
    const tz = req.cf?.timezone ?? "UTC";

    if (pathname === "/") {
      const data = await gatherStatus(env);
      return new Response(renderHtml(data, tz), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/status.txt") {
      const data = await gatherStatus(env);
      return new Response(renderText(data, tz), { headers: { "content-type": "text/plain; charset=utf-8" } });
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

    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
} satisfies ExportedHandler<Env>;
