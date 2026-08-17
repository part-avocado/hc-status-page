// Auth for the authenticated /api/* JSON routes on the website worker.
// Keys are created/revoked from /admin (see admin/src/index.ts) -- only
// their SHA-256 hash is ever stored, so a leaked D1 export doesn't leak
// usable keys. Sent as `Authorization: Bearer <key>`.

export interface ApiKeyEnv {
  DB: D1Database;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// "hcdown_" prefix makes keys recognizable (and greppable in logs/secret
// scanners) the same way GitHub's ghp_/gho_ prefixes do.
export function generateApiKey(): string {
  return `hcdown_${randomHex(24)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkApiKey(req: Request, env: ApiKeyEnv, ctx: ExecutionContext): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;

  const hash = await sha256Hex(match[1]);
  const row = await env.DB.prepare("SELECT id FROM api_keys WHERE key_hash = ?").bind(hash).first<{ id: string }>();
  if (!row) return false;

  // Doesn't block the response on this -- last_used_at is informational,
  // not part of the auth decision.
  ctx.waitUntil(env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(Date.now(), row.id).run());
  return true;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
