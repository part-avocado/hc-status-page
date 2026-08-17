# hcdown

Internal HackClub status page. Three Cloudflare Workers sharing one D1 database:

- `pinger/` — cron-triggered worker that pings every configured endpoint once a minute and writes results to D1.
- `website/` — worker that reads D1 and serves the status page at `/` (HTML), `/status.txt` (plain text), `/status.json`, and `/service/<id>` (per-service history). Public, no login.
- `admin/` — worker that lets you set/edit/clear D1 `secrets` values for endpoints marked `secret: true`. Gated by Cloudflare Access (see below) — fails closed (401 on everything) until Access is enabled on it.
- `shared/endpoints.ts` — the single file for adding/configuring endpoints.
- `shared/theme.ts` — the shared txt-file CSS theme used by `website` and `admin`.

The public site needs no login (intentional — it must stay usable if auth itself is down). `admin/` is the opposite: it's the one place secret values are set, so it's the one place that must require sign-in.

## Adding an endpoint

Edit `shared/endpoints.ts`:

- Normal endpoint: add an entry with a `url`.
- Sensitive endpoint (internal URL that shouldn't be in git): add an entry with `secret: true` and no `url`, redeploy `pinger` + `website`, then set its real URL either via `admin/` (once Access is set up, see below) or directly:

  ```bash
  wrangler d1 execute hcdown --command \
    "INSERT INTO secrets (endpoint_id, url) VALUES ('my-id', 'https://...')"
  ```

No redeploy is needed for the secret value itself — the pinger looks it up from D1 on every check.

## Setting up `admin/` (Cloudflare Access)

`admin/` is deployed like any other Worker, but it's useless until you protect it — until then it returns 401 to every request by design. One-time setup, in the Cloudflare dashboard:

1. **Workers & Pages** → select `hcdown-admin` → **Access** tab → **Protect this Worker behind Access**.
2. Choose **All traffic**.
3. Under **Authentication policy**, configure who's allowed to sign in (e.g. an email domain like `@hackclub.com`, or a specific list of emails).
4. **Apply Access**.

After that, visiting the worker's URL requires signing in via Cloudflare's login page first; the Worker reads the verified identity via `ctx.access.getIdentity()` (no JWT handling in app code).

To simulate a signed-in identity in local dev, edit the `[access.dev]` block already present in `admin/wrangler.toml`.

### Restricting to specific Slack IDs (Hack Club Auth via OIDC)

Enforced entirely at the edge via the Access policy on the `hcdown-admin` Access application: an Include rule of type **OIDC Claim** (available once Hack Club Auth is added as a generic OIDC identity provider under Zero Trust → Integrations → Identity providers), matching the claim that carries the Slack ID against each allowed value — repeat the rule per allowed person, since Access ORs multiple Include rules. **Login Methods** on the app is also restricted to just Hack Club Auth so no other configured IdP can be used to sign in.

The "debug: your identity claims" section on the `/admin` page (dumps whatever `ctx.access.getIdentity()` returns) is still there and still useful for troubleshooting who's signed in or confirming a claim's exact name/value, independent of this policy.

## Setup

```bash
npm install

# one-time: create the D1 database and note the returned database_id
wrangler d1 create hcdown

# apply the schema
wrangler d1 execute hcdown --file=schema.sql

# put the database_id from above into pinger/wrangler.toml, website/wrangler.toml, and admin/wrangler.toml
```

Then deploy each worker:

```bash
cd pinger && wrangler deploy
cd ../website && wrangler deploy
cd ../admin && wrangler deploy   # then protect it with Access -- see above
```

## Local dev

```bash
cd pinger && npm run dev     # GET / on the local pinger runs one check pass immediately
cd website && npm run dev    # GET / for the status page
cd admin && npm run dev      # GET /admin, using the simulated identity in wrangler.toml
```

Both `wrangler.toml` files need to point at the same D1 `database_id` for local dev too (wrangler dev uses a local SQLite copy of that database by default).
