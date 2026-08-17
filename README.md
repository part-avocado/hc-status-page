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
cd ../admin && wrangler deploy   # then protect it with Access -- see above
```

## Local dev

```bash
cd pinger && npm run dev     # GET / on the local pinger runs one check pass immediately
cd website && npm run dev    # GET / for the status page
cd admin && npm run dev      # GET /admin, using the simulated identity in wrangler.toml
```

Both `wrangler.toml` files need to point at the same D1 `database_id` for local dev too (wrangler dev uses a local SQLite copy of that database by default).
