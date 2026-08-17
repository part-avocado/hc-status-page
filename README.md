# hcdown

## How to add endpoints
You may add endpoints by configuring them in the [shared endpoint file](shared/endpoints.ts). Should you have sensitive endpoints that should't be public, but still need status, DM @partavocado on Slack to be added to the private endpoints collection ✨

## Setup

```bash
npm install

# one-time: create the D1 database and note the returned database_id
wrangler d1 create hcdown

# apply the schema (re-run any time schema.sql gains a new table -- it's
# all CREATE TABLE IF NOT EXISTS, so this is always safe)
wrangler d1 execute hcdown --file=schema.sql

# put the database_id from above into pinger/wrangler.toml, website/wrangler.toml, and admin/wrangler.toml
```

Then deploy each worker:

```bash
cd pinger && wrangler deploy
cd ../website && wrangler deploy
cd ../admin && wrangler deploy   # then protect it with Access
```

## API

The website worker also serves a JSON API: `/status.json` is public, and
`/api/status` + `/api/service/:id` (per-endpoint history/latency, bearer-token
authenticated) are new. Full reference: [`docs/API.md`](docs/API.md), also
available on the site at `/docs`. Machine-readable spec at `/openapi.yaml`.

API keys are created and revoked from `/admin` (no separate secret to set
up) -- open the "API Keys" section, name a key, and copy the value shown;
it's not shown again.

## Local dev

```bash
cd pinger && npm run dev     # GET / on the local pinger runs one check pass immediately
cd website && npm run dev    # GET / for the status page
cd admin && npm run dev      # GET /admin, using the simulated identity in wrangler.toml
```
