// Screenshots for the developers and self-hosting docs. See scripts/docs-shots.config.mjs for the spec format.
// Nothing here saves anything: forms are opened and filled for the picture, never submitted.
const MCP_AUTHORIZE =
  "/mcp-authorize?client_name=Claude&client_id=mcp_docs&redirect_uri=http%3A%2F%2Flocalhost%3A33418%2Fcallback&code_challenge=docs&code_challenge_method=S256&state=docs&scope=mcp";

export const shots = [
  {
    name: "dev-api-keys",
    path: "/settings/api-keys",
    marks: [
      { target: "text=New Key", label: "Create a key for a script or integration" },
      { target: "text=Example request", closest: 3, label: "The header every request sends" },
    ],
  },
  {
    name: "dev-api-keys-new",
    path: "/settings/api-keys",
    viewport: { height: 420 },
    actions: [
      { click: "text=New Key" },
      { waitFor: "text=New API Key" },
      { type: "Warehouse sync", into: "input[placeholder='e.g. Production API']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "dev-mcp-authorize",
    path: MCP_AUTHORIZE,
    actions: [{ waitFor: "text=Authorize MCP Access" }],
    marks: [
      { target: "text=This application will be able to:", closest: 1, label: "What the client will be able to do" },
      { target: "text=Organization:", label: "The organization it connects to (pick one if you have several)" },
      { target: "text=Authorize", label: "Approve, or Deny to send the client away" },
    ],
  },
  {
    name: "dev-webhooks",
    path: "/settings/webhooks",
    marks: [{ target: "text=Add Webhook", label: "Add an endpoint and choose its events" }],
  },
  {
    name: "dev-webhooks-new",
    path: "/settings/webhooks",
    actions: [
      { click: "text=Add Webhook" },
      { waitFor: "text=New Webhook" },
      { type: "https://hooks.example.com/dubbl", into: "input[placeholder='https://example.com/webhooks']" },
      { type: "Sync paid invoices to the CRM", into: "input[placeholder='Optional description']" },
      { click: "text=invoice.paid" },
      { click: "text=payment.received" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "dev-export",
    path: "/settings/import-export",
    actions: [{ scroll: "text=Export Data" }],
    clip: "text=Export Data",
    clipClosest: 3,
  },
  {
    name: "selfhost-admin-settings",
    path: "/admin/settings",
    marks: [
      { target: "text=Registration mode", closest: 1, label: "Who can sign up" },
      { target: "text=Allow users to create organizations", closest: 2, label: "Whether members can start new organizations" },
      { target: "text=Stripe status", closest: 2, label: "Billing is on only when Stripe is configured" },
    ],
  },
  {
    name: "selfhost-smtp",
    path: "/settings/email",
    actions: [{ waitFor: "text=Mail server" }],
  },
];
