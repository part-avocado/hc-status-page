import type { EndpointConfig, GroupConfig } from "./types";

// The file for adding/configuring NORMAL (non-sensitive) endpoints.
//
// Sensitive endpoints don't go here -- add/edit/remove them entirely from
// /admin (behind Cloudflare Access). They're stored as full rows in the D1
// `secret_endpoints` table and get merged with this list at runtime by
// pinger and website. An id declared here must not collide with one created
// in /admin.
//
// Private endpoint (either kind): prefix its `id` with "!PRIVATE." (e.g.
// "!PRIVATE.vpn"). It's still pinged and stored in D1 like any other
// endpoint, but is left out of the public website, /status.txt, and
// /status.json entirely -- not just its URL but its name, status, and
// existence -- and never affects the public overall-status banner.

// Optional per-group display settings, shared by static endpoints here and
// sensitive endpoints created in /admin. A group doesn't need an entry here
// unless you want to customize it -- it just renders non-collapsible by default.
export const groups: GroupConfig[] = [
  { name: "Core" },
  { name: "Internal", collapsible: true, collapsed: true },
];

export const endpoints: EndpointConfig[] = [
  {
    id: "hackclub-site",
    name: "hackclub.com",
    group: "Core",
    url: "https://hackclub.com",
  },
  {
    id: "hackclub-slack",
    name: "Slack",
    group: "Core",
    url: "https://hackclub.slack.com",
  },
  {
    id: "hcb",
    name: "HCB",
    group: "Core",
    url: "https://hcb.hackclub.com/up",
  },
];
