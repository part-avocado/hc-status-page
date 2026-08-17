// Auth for the authenticated /api/* JSON routes on the website worker.
// A single shared secret (set via `wrangler secret put API_KEY`), sent as
// `Authorization: Bearer <key>` -- no per-user keys, no framework, matching
// the rest of this codebase's minimal inline-guard style (see admin's
// ctx.access check).

export function checkApiKey(req: Request, env: { API_KEY?: string }): boolean {
  if (!env.API_KEY) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;
  return match[1] === env.API_KEY;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
