# hcdown

## How to add endpoints
You may add endpoints by configuring them in the [shared endpoint file](shared/endpoints.ts). Should you have sensitive endpoints that should't be public, but still need status, DM @partavocado on Slack to be added to the private endpoints collection ✨

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
cd ../admin && wrangler deploy   # then protect it with Access
```

To enable the authenticated API (see below), also set a shared API key on
the website worker:

```bash
cd website && wrangler secret put API_KEY
```

## API

The website worker also serves a JSON API: `/status.json` is public, and
`/api/status` + `/api/service/:id` (per-endpoint history/latency, bearer-token
authenticated) are new. Full reference: [`docs/API.md`](docs/API.md), also
available on the site at `/docs`. Machine-readable spec at `/openapi.yaml`.

## Local dev

```bash
cd pinger && npm run dev     # GET / on the local pinger runs one check pass immediately
cd website && npm run dev    # GET / for the status page
cd admin && npm run dev      # GET /admin, using the simulated identity in wrangler.toml
```
