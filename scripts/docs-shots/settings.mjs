// Screenshots for the settings docs (and Documents, Tilly and the apps). See
// scripts/docs-shots.config.mjs for the spec format.
//
// Tilly is off in the demo (no model key), so the Tilly shots answer the panel's
// "is Tilly switched on?" check in the page and block sending, which shows the real
// panel without ever talking to a model or changing data.
import { readFileSync } from "node:fs";
import path from "node:path";

const TILLY_ON = `(() => {
  if (window.__tillyOn) return;
  window.__tillyOn = true;
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/v1/assistant/chat")) {
      if ((init?.method ?? "GET").toUpperCase() === "GET") return Promise.resolve(new Response('{"configured":true}', { headers: { "content-type": "application/json" } }));
      return Promise.reject(new Error("Sending is off while taking docs screenshots"));
    }
    return real(input, init);
  };
})()`;

// On the full Tilly page the check runs as the page loads, before a shot can step
// in, so flip the panel's own "not switched on" flag back off instead.
const TILLY_PAGE_ON = `(() => {
  const el = document.querySelector("main") || document.body;
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
  let f = key && el[key];
  while (f && f.type?.name !== "AssistantProvider") f = f.return;
  if (!f) throw new Error("AssistantProvider not found");
  let hook = f.memoizedState;
  for (let i = 0; i < 3; i++) hook = hook.next; // open, minimized, layout, notConfigured
  if (hook.memoizedState !== true) throw new Error("Unexpected hook order");
  hook.queue.dispatch(false);
})()`;

// The desktop app's first-run screen, from the files the app ships (desktop/static).
const DESKTOP = path.join(import.meta.dirname, "../../desktop/static");
const connectHtml = readFileSync(path.join(DESKTOP, "connect.html"), "utf8");
const connectBody = connectHtml.slice(connectHtml.indexOf("<body>") + 6, connectHtml.indexOf("<script"));
// Force the light look: drop the dark-mode overrides so the page matches the light shots.
const sharedCss = readFileSync(path.join(DESKTOP, "shared.css"), "utf8")
  .replace(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\}\s*\}/g, "")
  .replace("color-scheme: light dark;", "color-scheme: light;");
const DESKTOP_CONNECT = `(() => {
  document.documentElement.className = "";
  document.documentElement.setAttribute("data-desktop", "mac");
  document.head.innerHTML = "<style>" + ${JSON.stringify(sharedCss)} + " html,body{background:#ecebe8 !important}</style>";
  document.body.className = "";
  document.body.innerHTML = ${JSON.stringify(connectBody)};
  const lights = document.createElement("div");
  lights.style.cssText = "position:fixed;left:18px;top:18px;display:flex;gap:8px;z-index:9";
  for (const c of ["#ff5f57", "#febc2e", "#28c840"]) { const d = document.createElement("span"); d.style.cssText = "width:12px;height:12px;border-radius:50%;background:" + c; lights.appendChild(d); }
  document.body.appendChild(lights);
})()`;

export const shots = [
  /* ---------------------------------------------------------- Documents */
  {
    name: "documents",
    path: "/documents",
    marks: [
      { target: "text=All files", closest: 1, label: "Quick views: recent, starred, not attached, attached, private and trash" },
      { target: "text=Folders", closest: 1, label: "Your folders. Drag files onto one to move them" },
      { target: "input[placeholder='Search all files']", closest: 1, label: "Search every file by name" },
      { target: "main button.bg-foreground[aria-haspopup=menu]", label: "Upload files or make a folder" },
      { target: "text=Sent emails", label: "Every document emailed from dubbl" },
    ],
  },
  {
    name: "documents-new",
    path: "/documents",
    actions: [{ click: "main button.bg-foreground[aria-haspopup=menu]" }, { waitFor: "text=Upload files" }],
    clip: "[role=menu]",
    padding: 12,
  },
  { name: "documents-emails", path: "/documents/emails" },

  /* -------------------------------------------------------------- Tilly */
  {
    name: "tilly-panel",
    path: "/dashboard",
    actions: [{ eval: TILLY_ON }, { click: "[aria-label='Ask Tilly']" }, { waitFor: "text=Hi, I'm Tilly" }],
    marks: [
      { target: "[aria-label='Ask Tilly']", label: "Open or close Tilly from anywhere (⌘I)" },
      { target: "text=Drop a receipt, bill or statement", closest: 1, label: "Drop receipts, bills or statements to book them" },
      { target: "text=Or ask", closest: 1, label: "Questions to start with" },
      { target: "textarea", closest: 2, label: "Ask anything in plain words" },
    ],
  },
  {
    name: "tilly-prompt",
    path: "/dashboard",
    actions: [
      { eval: TILLY_ON },
      { click: "[aria-label='Ask Tilly']" },
      { waitFor: "text=Hi, I'm Tilly" },
      { type: "Which customers owe me the most, and how late are they?", into: "textarea" },
    ],
    clip: "aside[aria-label='Tilly']",
    padding: 0,
  },
  {
    name: "tilly-page",
    path: "/assistant",
    actions: [
      { eval: TILLY_ON },
      { eval: TILLY_PAGE_ON },
      { waitFor: "text=Book receipts and bills" },
    ],
    marks: [
      { target: "text=New chat", label: "Start a new chat; earlier chats are listed below it" },
      { target: "text=Drop receipts, bills, invoices or bank statements", closest: 2, label: "Drop files anywhere on the page, or choose them" },
      { target: "text=Book receipts and bills", closest: 3, label: "Shortcuts for the jobs Tilly is best at" },
      { target: "textarea", closest: 2, label: "Ask anything; Enter sends, Shift+Enter adds a line" },
    ],
  },
  {
    name: "tilly-floating",
    path: "/sales",
    actions: [{ eval: TILLY_ON }, { click: "[aria-label='Ask Tilly']" }, { waitFor: "text=Hi, I'm Tilly" }, { click: "[aria-label='Pop out']" }, { wait: 800 }],
  },
  {
    name: "tilly-history",
    path: "/dashboard",
    actions: [{ eval: TILLY_ON }, { click: "[aria-label='Ask Tilly']" }, { waitFor: "text=Hi, I'm Tilly" }, { click: "[aria-label='History']" }, { wait: 600 }],
    clip: "aside[aria-label='Tilly']",
    padding: 0,
  },

  /* -------------------------------------------------------- Organization */
  {
    name: "organization",
    path: "/settings",
    marks: [
      { target: "text=Name", closest: 1, label: "Your business name, as it appears on invoices" },
      { target: "text=Country (sets your tax rules)", closest: 1, label: "Where you're based: picks your tax rules and forms" },
      { target: "text=Tax ID / VAT", closest: 1, label: "Tax and registration numbers for your documents" },
      { target: "text=Street", closest: 2, label: "The address printed on what you send" },
    ],
  },
  {
    name: "organization-financials",
    path: "/settings",
    actions: [{ eval: "document.querySelector('[data-shell=main]').scrollTop = 900", wait: 600 }],
    marks: [
      { target: "text=Default currency", closest: 3, label: "Currency, fiscal year start and default payment terms" },
      { target: "text=Annual interest rate (%)", closest: 3, label: "What Charge interest bills on overdue invoices" },
      { target: "text=PEPPOL Participant ID", closest: 3, label: "Your ID for sending e-invoices over PEPPOL" },
      { target: "text=Save changes", label: "Save everything above" },
    ],
  },
  {
    name: "organization-lock",
    path: "/settings",
    actions: [{ eval: "const m = document.querySelector('[data-shell=main]'); m.scrollTop = m.scrollHeight", wait: 600 }],
    marks: [
      { target: "text=Lock everything up to and including", closest: 2, label: "Lock past dates once a period is done" },
      { target: "text=Advisor lock date (optional)", closest: 2, label: "An earlier hard lock for your advisors" },
      { target: "text=Permanently delete this organization and all its data.", closest: 2, label: "Delete the organization and all its data (owner only)" },
    ],
  },
  {
    name: "organization-delete",
    path: "/settings",
    actions: [
      { eval: "const m = document.querySelector('[data-shell=main]'); m.scrollTop = m.scrollHeight", wait: 400 },
      { eval: "[...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === 'Delete').click()" },
      { waitFor: "text=Type the organization's name to confirm" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ---------------------------------------------------- Members and roles */
  {
    name: "members-and-roles",
    path: "/settings/members",
    marks: [
      { target: "text=Seats used", closest: 3, label: "Seats used, and how many owners, admins and members" },
      { target: "text=Invite Member", label: "Invite someone by email" },
      { target: "text=Demo User", closest: 4, label: "Everyone with access, their role and when they joined" },
      { target: "text=Create Link", label: "Or share a link anyone can join with" },
    ],
  },
  {
    name: "members-and-roles-invite",
    path: "/settings/members",
    actions: [
      { click: "text=Invite Member" },
      { waitFor: "text=Send Invitation" },
      { type: "sam@brightsolutions.com", into: "input[placeholder='colleague@company.com']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
    viewport: { height: 560 },
  },
  {
    name: "members-and-roles-custom",
    path: "/settings/roles",
    marks: [
      { target: "text=Create Role", label: "Build your own role" },
      { target: "text=Bookkeeper", closest: 3, label: "Your custom roles: edit or delete them from the menu" },
      { target: "text=Read-only", closest: 3, label: "Ready-made roles marked System can't be changed" },
    ],
  },
  {
    name: "members-and-roles-new-role",
    path: "/settings/roles",
    actions: [
      { click: "text=Create Role" },
      { waitFor: "text=Permissions" },
      { type: "Bookkeeper", into: "[role=dialog] input[placeholder='e.g. Bookkeeper']" },
      { type: "Day-to-day bookkeeping, no settings", into: "[role=dialog] textarea" },
      { click: "text=See data (read-only)", within: "[role=dialog]" },
      { click: "text=Add transactions", within: "[role=dialog]" },
      { click: "text=Edit transactions", within: "[role=dialog]" },
      { click: "text=Manage bills you owe", within: "[role=dialog]" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
    viewport: { height: 1000 },
  },

  /* ----------------------------------------------------------- Approvals */
  {
    name: "approvals",
    path: "/settings/approval-workflows",
    marks: [{ target: "text=Create Workflow", label: "Add a workflow" }],
  },
  {
    name: "approvals-new",
    path: "/settings/approval-workflows",
    actions: [
      { click: "text=Create Workflow" },
      { waitFor: "text=Approval Steps" },
      { type: "Invoices over $5,000", into: "[role=dialog] input[placeholder='e.g. High-value bill approval']" },
      { click: "text=Bill", within: "[role=dialog]" },
      { click: "[role=option]:nth-child(3)" },
      { click: "text=Add condition", within: "[role=dialog]" },
      { type: "5000", into: "[role=dialog] input[placeholder='0.00']" },
      { click: "text=Add Step", within: "[role=dialog]" },
      { click: "text=Select approver", within: "[role=dialog]" },
      { click: "[role=option]:nth-child(1)" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
    viewport: { width: 1440, height: 640 },
  },

  /* ------------------------------------------------------- Notifications */
  {
    name: "notifications",
    path: "/notifications",
    marks: [
      { target: "text=Unread", closest: 1, label: "All or unread, then one category at a time" },
      { target: "input[placeholder='Search notifications…']", closest: 1, label: "Search, or tick several to mark read or remove" },
      { target: "text=Payment received from Acme Corp", closest: 3, label: "Click one to open what it's about" },
      { target: "text=Preferences", label: "Choose what reaches your inbox and email" },
    ],
  },
  {
    name: "notifications-preferences",
    path: "/notifications",
    actions: [{ click: "text=Preferences" }, { waitFor: "text=Notify me when" }],
    clip: "[role=dialog]",
    padding: 0,
    viewport: { width: 1440, height: 1230 },
  },
  {
    name: "bank-low-balance-alert",
    path: "/accounting/banking",
    actions: [
      { click: "text=Business Checking" },
      { waitFor: "nav.border-b button", timeout: 60000 },
      { click: "text=Settings", within: "nav.border-b" },
      { waitFor: "text=Low balance alert" },
      { type: "5000.00", into: "#lowBalanceThreshold" },
      { eval: "document.activeElement?.blur()" },
    ],
    viewport: { height: 1500 },
    clip: "text=Low balance alert",
    clipClosest: 2,
    padding: 24,
  },
  {
    name: "budget-spending-alert",
    path: "/accounting/budgets",
    actions: [
      { click: "text=FY 2026 Operating Budget" },
      { waitFor: "nav.border-b button", timeout: 60000 },
      { click: "text=Settings", within: "nav.border-b" },
      { waitFor: "text=Spending alert" },
    ],
    clip: "text=Spending alert",
    clipClosest: 2,
    padding: 24,
  },

  /* --------------------------------------------------------------- Email */
  {
    name: "email",
    path: "/settings/email",
    marks: [
      { target: "text=Sending from dubbl", closest: 2, label: "Who your documents come from right now" },
      { target: "text=Server", closest: 3, label: "Your mail server's outgoing (SMTP) details" },
      { target: "text=From address", closest: 3, label: "The name and address your customers see" },
      { target: "text=Connect and check", label: "Save, and check the login works" },
    ],
  },

  /* -------------------------------------------------- Document templates */
  {
    name: "document-templates",
    path: "/settings/document-templates",
    marks: [
      { target: "text=Standard Invoice", closest: 4, label: "One card per template, with its type and colour" },
      { target: "text=Default", label: "The default is used for every new PDF of that type" },
      { target: "text=New Template", label: "Make a new template" },
    ],
  },
  {
    name: "document-templates-new",
    path: "/settings/document-templates",
    actions: [
      { click: "text=New Template" },
      { waitFor: "text=Display Options" },
      { type: "Invoice with bank details", into: "[role=dialog] input[placeholder='e.g. Standard Invoice']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
    viewport: { height: 1000 },
  },
  {
    name: "document-templates-preview",
    path: "/settings/document-templates",
    actions: [
      { click: ".grid > div:first-child button[aria-haspopup='menu']" },
      { click: "text=Preview" },
      { waitFor: "text=Template Preview" },
      { wait: 1500 },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------ Tags and cost centers */
  {
    name: "tags-and-cost-centers",
    path: "/settings/tags",
    marks: [
      { target: "text=Add Tag", label: "Add a tag" },
      { target: "text=VIP", closest: 1, label: "A colour, a name and a note on what it's for" },
    ],
  },
  // The tag picker on an invoice, opened but nothing attached (demo data stays as is).
  {
    name: "tags-and-cost-centers-picker",
    path: "/sales",
    follow: "^/sales/[0-9a-f]{8}-[0-9a-f-]{27}$",
    followText: "Draft",
    actions: [{ click: "text=Add tags" }, { waitFor: "text=Follow up" }],
    marks: [{ target: "text=Add tags", label: "Add a tag, or type a new name to create one" }],
  },
  {
    name: "tags-and-cost-centers-pnl",
    path: "/reports/profit-and-loss",
    actions: [{ click: "button[aria-label=Tag]" }, { waitFor: "text=No tag filter" }],
    marks: [{ target: "button[aria-label=Tag]", label: "Show only records with this tag" }],
  },
  {
    name: "tags-and-cost-centers-list",
    path: "/settings/cost-centers",
    marks: [
      { target: "text=New Cost Center", label: "Add a department or cost center" },
      { target: "text=ENG-INFRA", closest: 2, label: "Nest one under another with a parent" },
      { target: "text=Status", closest: 1, label: "Each one's code, name, parent and whether it's active" },
    ],
  },
  {
    name: "tags-and-cost-centers-new",
    path: "/settings/cost-centers",
    actions: [
      { click: "text=New Cost Center" },
      { waitFor: "text=Parent Cost Center" },
      { type: "DEPT-SUP", into: "[role=dialog] input[placeholder='e.g. DEPT-ENG']" },
      { type: "Customer Support", into: "[role=dialog] input[placeholder='e.g. Engineering']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
    viewport: { height: 560 },
  },
  { name: "tags-and-cost-centers-report", path: "/reports/tracking" },

  /* -------------------------------------------------------- Integrations */
  {
    name: "integrations-stripe",
    path: "/settings/integrations/stripe",
    marks: [
      { target: "text=When connected, dubbl will automatically:", closest: 1, label: "What dubbl records once Stripe is connected" },
      { target: "text=Connect Stripe Account", label: "Sign in to Stripe and allow dubbl to read it" },
    ],
  },

  /* ------------------------------------------- Billing, backups and trash */
  // The demo server is self-hosted, so Billing shows the "every feature unlocked" card.
  { name: "billing", path: "/settings/billing", actions: [{ waitFor: "text=Every feature unlocked" }], clip: "text=Every feature unlocked", clipClosest: 2, padding: 24 },
  {
    name: "backups",
    path: "/settings/backups",
    marks: [
      { target: "text=Download Snapshot", label: "Download everything now as a JSON file" },
      { target: "text=Upload Backup", label: "Bring in a backup file you downloaded" },
      { target: "text=Create Backup", label: "Take a backup now and keep it here" },
    ],
  },
  {
    name: "backups-create",
    path: "/settings/backups",
    actions: [{ click: "text=Create Backup" }, { waitFor: "text=Create backup?" }],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "trash",
    path: "/settings/trash",
    marks: [
      { target: "input[placeholder='Search deleted items...']", closest: 2, label: "Search, or show one type of record" },
      { target: "button[title='Restore']", label: "Put it back where it was" },
      { target: "button[title='Delete permanently']", label: "Delete it for good" },
      { target: "text=Empty Trash", label: "Delete everything in the trash (owners only)" },
    ],
  },
  {
    name: "audit-log",
    path: "/settings/audit-log",
    marks: [
      { target: "[role=tablist]", label: "Filter by what happened: created, updated, deleted and more" },
      { target: "input[placeholder='Search user, entity...']", closest: 2, label: "Search by person or record, by type and by date" },
      { target: "text=Demo User", closest: 3, label: "Who did it, to what, and when" },
    ],
  },

  /* ---------------------------------------------------------------- Apps */
  {
    name: "desktop-app-connect",
    path: "/docs",
    viewport: { width: 1100, height: 720 },
    actions: [{ eval: DESKTOP_CONNECT }],
  },

  /* ----------------------------------------------------------- Mobile app */
  // The browser step of the iPhone app's sign-in. Only viewed: Continue is never pressed.
  {
    name: "mobile-app-sign-in",
    path: "/app-authorize?redirect_uri=dubbl%3A%2F%2Fauth%2Fcallback&code_challenge=docs&state=docs&platform=ios&device_name=Sam%E2%80%99s%20iPhone",
    actions: [{ waitFor: "text=Continue" }, { wait: 600 }],
    clip: "h1",
    clipClosest: 3,
    padding: 48,
  },
];
