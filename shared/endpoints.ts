import type { EndpointConfig, GroupConfig } from "./types";

// The file for adding/configuring NORMAL (non-sensitive) endpoints.
// Should you have sensitive endpoints, please ping @partavocado on Slack to add you to the admin page.

export const groups: GroupConfig[] = [
  { name: "Core Websites", collapsible: true, collapsed: false },
  { name: "Authentication", collapsible: true, collapsed: true},
  { name: "Services", collapsible: true, collapsed: true},
  { name: "YSWS", collapsible: true, collapsed: true},
];

export const endpoints: EndpointConfig[] = [
  {
    id: "site",
    name: "hackclub.com",
    group: "Important",
    url: "https://hackclub.com",
  },
  {
    id: "hcb",
    name: "HCB",
    group: "Important",
    url: "https://hcb.hackclub.com/up",
  },
  
// authentication group
  {
    id: "idv",
    name: "Hack Club Authentication",
    group: "Authentication",
    url: "https://auth.hackclub.com/up",
  },

// timing group
  {
    id: "hackatime",
    name: "Hackatime",
    group: "Services",
    url: "https://hackatime.hackclub.com/up",
  },
  {
    id: "lapse",
    name: "Lapse",
    group: "Services",
    url: "https://lapse.hackclub.com/",
  },

// ysws
  {
    id: "stardance-ysws",
    name: "Stardance - YSWS",
    group: "YSWS",
    url: "https://stardance.hackclub.com/up",
  },
];
