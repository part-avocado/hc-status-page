import type { EndpointConfig, GroupConfig } from "./types";

// The file for adding/configuring NORMAL (non-sensitive) endpoints.
// Should you have sensitive endpoints, please ping @partavocado on Slack to add you to the admin page.

export const groups: GroupConfig[] = [
  { name: "Important", collapsible: true, collapsed: false },
  { name: "Authentication", collapsible: true, collapsed: false},
];

export const endpoints: EndpointConfig[] = [
  {
    id: "site",
    name: "hackclub.com",
    group: "Important",
    url: "https://hackclub.com",
  },
  {
    id: "hackclub-slack",
    name: "Slack",
    group: "Important",
    url: "https://hackclub.slack.com",
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
    name: "HC Auth",
    group: "Authentication",
    url: "https://auth.hackclub.com/up",
  },
];
