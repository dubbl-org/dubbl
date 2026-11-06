// Operations: inventory, locations, stocktakes, assemblies, landed costs,
// projects, CRM, payroll, time & leave and teams.
const UUID = "[0-9a-f]{8}-[0-9a-f-]{27}";
const blur = { eval: "document.activeElement?.blur()" };
/** Open the Mobile App project from the projects table (the sidebar also links every project, so `follow` can't pick it). */
const openMobileApp = [{ click: "text=Mobile App", within: "table" }, { waitFor: "text=Invoice" }];
/** Select a currency input's text so typing replaces it. */
const selectAll = (sel) => ({ eval: `(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); el.select(); })()` });
/** Give the button under a dialog label an id, so it can be clicked. */
const tagField = (label, id) => ({
  eval: `(() => { const l = [...document.querySelectorAll('[role=dialog] label')].find((l) => l.innerText.trim() === ${JSON.stringify(label)}); l.parentElement.querySelector('button').id = ${JSON.stringify(id)}; })()`,
});

export const shots = [
  /* ------------------------------------------------------------ inventory */
  {
    name: "inventory",
    path: "/inventory",
    marks: [
      { target: "text=Stock value", closest: 3, label: "What your stock cost, what it could sell for, and what's running low" },
      { target: "text=In stock", closest: 2, label: "Filter by stock level: in stock, running low, out of stock, hidden" },
      { target: "text=Reorder at", closest: 1, label: "Units on hand and the level that counts as running low" },
      { target: "text=Import items", label: "Bring in items from a CSV" },
      { target: "text=New Item", label: "Add one item" },
    ],
  },
  {
    name: "inventory-new",
    path: "/inventory",
    actions: [
      { click: "text=New Item" },
      { waitFor: "text=New Inventory Item" },
      { type: "FURN-004", into: "#drawer-inv-code" },
      { type: "Laptop Stand", into: "#drawer-inv-name" },
      { type: "LS-100", into: "#drawer-inv-sku" },
      { eval: "(() => { const s = (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; s(document.querySelector('#drawer-inv-qty'), '40'); s(document.querySelector('#drawer-inv-reorder'), '10'); })()" },
      { eval: "(() => { const el = document.querySelector('#drawer-inv-purchase'); el.focus(); el.select(); })()" },
      { type: "28.00" },
      { eval: "(() => { const el = document.querySelector('#drawer-inv-sale'); el.focus(); el.select(); })()" },
      { type: "59.99" },
      blur,
    ],
    clip: "[role=dialog]",
  },
  {
    name: "inventory-item",
    path: "/inventory",
    follow: `^/inventory/${UUID}$`,
    followText: "Monitor Stand",
    marks: [
      { target: "text=Change the count", label: "Add or remove units, with a reason" },
      { target: "text=Write down value", label: "Lower what the stock is worth without changing the count" },
      { target: "text=Units on hand", closest: 1, label: "Units, value, price and margin at a glance" },
      { target: "text=History", closest: 1, label: "Every stock change, and the suppliers you buy it from" },
    ],
  },
  {
    name: "inventory-count",
    path: "/inventory",
    follow: `^/inventory/${UUID}$`,
    followText: "Monitor Stand",
    actions: [
      { click: "text=Change the count" },
      { waitFor: "text=Save new count" },
      { type: "-2", into: "[role=dialog] input[placeholder^='e.g. 10']" },
      { type: "Two stands damaged in the stockroom", into: "[role=dialog] input[placeholder^='e.g. Stock count'], [role=dialog] textarea" },
      blur,
    ],
    viewport: { height: 640 },
    clip: "[role=dialog]",
  },

  /* ------------------------------------------------------------ locations */
  {
    name: "warehouses",
    path: "/inventory/warehouses",
    marks: [
      { target: "text=Default Warehouse", closest: 2, label: "Your default location" },
      { target: "text=East Distribution Center", closest: 4, label: "Each location, with its code and address" },
      { target: "text=New Warehouse", label: "Add a location" },
    ],
  },
  {
    name: "warehouses-new",
    path: "/inventory/warehouses",
    actions: [
      { click: "text=New Warehouse" },
      { waitFor: "text=Create Warehouse" },
      { type: "West Coast Depot", into: "#drawer-wh-name" },
      { type: "WH-WEST", into: "#drawer-wh-code" },
      { type: "88 Harbor Road, Oakland, CA", into: "#drawer-wh-address" },
      blur,
    ],
    clip: "[role=dialog]",
  },
  {
    name: "warehouses-transfers",
    path: "/inventory/transfers",
    marks: [
      { target: "text=Not sent yet", closest: 1, label: "Units on the way, waiting to be sent, and arrived" },
      { target: "text=Top routes", closest: 2, label: "Where stock moves most" },
      { target: "text=All", closest: 1, label: "Filter by status" },
      { target: "text=New Transfer", label: "Move stock between locations" },
    ],
  },
  {
    name: "warehouses-transfer-new",
    path: "/inventory/transfers",
    actions: [
      { click: "text=New Transfer" },
      { waitFor: "text=Create Transfer" },
      { click: "text=Select warehouse..." },
      { type: "Main" },
      { press: "Enter" },
      { click: "text=Select warehouse..." },
      { type: "East" },
      { press: "Enter" },
      { click: "text=Select item..." },
      { type: "Shipping Box" },
      { press: "Enter" },
      { eval: "(() => { const el = [...document.querySelectorAll('[role=dialog] input[type=number]')].pop(); el.focus(); el.select(); })()" },
      { type: "40" },
      { type: "Restock for the holiday rush", into: "[role=dialog] textarea" },
      blur,
    ],
    viewport: { height: 760 },
    clip: "[role=dialog]",
  },
  {
    name: "warehouses-transfer-preview",
    path: "/inventory/transfers",
    actions: [{ click: "text=Keyboards for the east showroom" }, { waitFor: "text=Line items" }],
  },

  /* ----------------------------------------------------------- stocktakes */
  {
    name: "stock-takes",
    path: "/inventory/stock-takes",
    viewport: { height: 640 },
    marks: [
      { target: "text=Counting now", closest: 1, label: "Counts in progress, not started and done, and how long they take" },
      { target: "text=All", closest: 1, label: "Filter by status" },
      { target: "text=Cycle count - East Distribution Center", closest: 3, label: "Each count with its location, status and number of items" },
      { target: "text=New Stock Take", label: "Start a count" },
    ],
  },
  {
    name: "stock-takes-new",
    path: "/inventory/stock-takes",
    actions: [
      { click: "text=New Stock Take" },
      { waitFor: "text=Create Stock Take" },
      { type: "October 2026 full count", into: "#drawer-st-name" },
      blur,
    ],
    clip: "[role=dialog]",
  },

  /* ----------------------------------------------------------- assemblies */
  {
    name: "assemblies-bom",
    path: "/inventory/bom",
    actions: [{ click: "text=Workstation Starter Kit v1" }, { waitFor: "text=Add part" }],
    viewport: { height: 740 },
    marks: [
      { target: "text=Makes: Workstation Starter Kit", closest: 1, label: "The recipe's name and the finished item it makes" },
      { target: "text=Cost to build one", closest: 1, label: "Parts, labour and overhead add up to an estimated cost per item" },
      { target: "text=Parts (5)", closest: 2, label: "Each part, how many go into one item, its cost and what's on hand" },
      { target: "text=New assembly order", label: "Build a batch from this recipe" },
    ],
  },
  {
    name: "assemblies-bom-new",
    path: "/inventory/bom",
    actions: [
      { waitFor: "text=Workstation Starter Kit v1" },
      { click: "text=New bill of materials" },
      { waitFor: "text=Labour per unit" },
      { click: "text=Pick the finished item" },
      { type: "Monitor Stand" },
      { waitFor: "[role=option]" },
      { press: "Enter" },
      selectAll("[role=dialog] input[placeholder^='e.g. Standing desk']"),
      { type: "Monitor stand, assembled" },
      selectAll("[role=dialog] input[inputmode=decimal]"),
      { type: "4.50" },
      blur,
    ],
    viewport: { height: 640 },
    clip: "[role=dialog]",
  },

  /* --------------------------------------------------------- landed costs */
  {
    name: "landed-costs",
    path: "/purchases/landed-costs",
    marks: [
      { target: "a[href='/purchases/landed-costs']", label: "Landed costs live under Purchases" },
      { target: "text=No landed costs yet", closest: 1, label: "Each landed cost is listed here once you add one" },
      { target: "text=New landed cost", label: "Add freight, duty or other costs" },
    ],
  },
  {
    name: "landed-costs-new",
    path: "/purchases/landed-costs",
    actions: [
      { click: "text=New landed cost" },
      { waitFor: "text=Create landed cost" },
      { type: "Ocean freight for PO-0007", into: "[role=dialog] input[placeholder^='e.g. Shipping']" },
      { click: "text=The goods these costs are for" },
      { waitFor: "[role=option]" },
      { press: "Enter" },
      { type: "Ocean freight", into: "[role=dialog] input[placeholder^='e.g. Freight']" },
      { type: "300.00", into: "[role=dialog] input[placeholder='0.00']" },
      blur,
    ],
    viewport: { height: 780 },
    clip: "[role=dialog]",
  },

  /* ------------------------------------------------------------- projects */
  {
    name: "projects",
    path: "/projects",
    marks: [
      { target: "text=Total Budget", closest: 3, label: "Budgets, what you've billed and hours logged across projects" },
      { target: "text=Completed", closest: 1, label: "Filter by status" },
      { target: "text=Website Redesign", closest: 4, label: "Each project with its client, time, budget and billed amount" },
      { target: "text=New Project", label: "Start a project" },
    ],
  },
  {
    name: "projects-new",
    path: "/projects",
    actions: [
      { click: "text=New Project" },
      { waitFor: "text=Create Project" },
      { type: "Brand Refresh", into: "#drawer-project-name" },
      { click: "text=Select contact..." },
      { type: "Acme" },
      { press: "Enter" },
      selectAll("#drawer-project-budget"),
      { type: "15000.00" },
      selectAll("#drawer-project-rate"),
      { type: "150.00" },
      { type: "100", into: "[role=dialog] input[name=estimatedHours]" },
      blur,
    ],
    clip: "[role=dialog]",
  },
  {
    name: "projects-overview",
    path: "/projects",
    actions: openMobileApp,
    viewport: { height: 1240 },
    marks: [
      { target: "text=Invoice", label: "Bill time, milestones or the fixed price on a draft invoice" },
      { target: "text=Overview", within: "main", closest: 1, label: "Tasks, time, notes, the team and settings" },
      { target: "text=Logged", closest: 3, label: "Time, tasks, money and budget at a glance" },
      { target: "text=Financials", closest: 2, label: "Billed, unbilled and what's left of the budget" },
    ],
  },
  {
    name: "projects-invoice",
    path: "/projects",
    actions: [
      ...openMobileApp,
      { click: "text=Invoice" },
      { waitFor: "text=Invoice project" },
      { waitFor: "text=Create Invoice" },
    ],
    viewport: { height: 720 },
    clip: "[role=dialog]",
  },
  {
    name: "projects-tasks",
    path: "/projects",
    actions: [
      ...openMobileApp,
      { eval: "document.querySelector('a[href$=\"/tasks\"]').click()" },
      { waitFor: "text=In Review" },
    ],
  },
  {
    name: "projects-time",
    path: "/projects",
    actions: [
      ...openMobileApp,
      { eval: "document.querySelector('a[href$=\"/time\"]').click()" },
      { waitFor: "text=All Entries" },
    ],
    marks: [
      { target: "text=Start Timer", label: "Time it as you work" },
      { target: "text=Log Time", label: "Or log hours afterwards" },
      { target: "text=Unbilled", closest: 2, label: "Billable time not yet invoiced" },
    ],
  },
  {
    name: "projects-team",
    path: "/projects",
    actions: [
      ...openMobileApp,
      { eval: "document.querySelector('a[href$=\"/members\"]').click()" },
      { waitFor: "text=Assign Team" },
    ],
    marks: [
      { target: "text=Assign Team", label: "Put a whole team on the project" },
      { target: "text=Add Member", label: "Or add one person, with a role and rates" },
    ],
  },

  /* ------------------------------------------------------------------ CRM */
  {
    name: "crm",
    path: "/crm",
    viewport: { height: 620 },
    marks: [
      { target: "text=weighted", closest: 2, label: "What's open, and what it's worth weighted by its chance of closing" },
      { target: "a[href='/crm/deals']", within: "main", label: "Every deal as a list, won and lost included" },
      { target: "text=Proposal", closest: 3, label: "A column per stage; drag a card to move it on" },
      { target: "text=New deal", label: "Add a deal" },
    ],
  },
  {
    name: "crm-new-deal",
    path: "/crm",
    actions: [
      { click: "text=New deal" },
      { waitFor: "text=Create Deal" },
      { type: "Acme Corp - Annual Support", into: "#drawer-deal-title" },
      tagField("Stage", "shot-stage"),
      { click: "#shot-stage" },
      { click: "text=Proposal", within: "[role=listbox]" },
      { click: "text=Select a contact..." },
      { type: "Acme" },
      { press: "Enter" },
      { click: "[role=dialog] input[placeholder='0.00']" },
      { type: "24000.00" },
      { type: "60", into: "#drawer-deal-prob" },
      tagField("Source", "shot-source"),
      { eval: "document.querySelector('#shot-source').scrollIntoView({ block: 'center' })" },
      { click: "#shot-source" },
      { click: "text=Referral", within: "[role=listbox]" },
      blur,
    ],
    clip: "[role=dialog]",
  },
  {
    name: "crm-deal",
    path: "/crm/deals",
    follow: `^/crm/deals/${UUID}$`,
    followText: "Sterling",
    marks: [
      { target: "text=Mark Won", label: "Close the deal as won" },
      { target: "text=Mark Lost", label: "Or as lost" },
      { target: "text=Weighted Value", closest: 4, label: "Value, chance of closing and weighted value" },
      { target: "text=Recent Activity", closest: 2, label: "Calls, emails and notes logged on the deal" },
    ],
  },
  { name: "crm-pipelines", path: "/crm/pipelines", viewport: { height: 460 } },
  {
    name: "crm-analytics",
    path: "/crm/analytics",
    actions: [{ waitFor: "text=Why deals were lost" }],
    marks: [{ target: "text=Why deals were lost", closest: 2, label: "The reasons deals were lost, most common first" }],
  },

  /* -------------------------------------------------------------- payroll */
  {
    name: "payroll",
    path: "/payroll",
    marks: [
      { target: "text=Active Employees", closest: 3, label: "Headcount, monthly cost and what you've paid" },
      { target: "text=Recent Runs", closest: 2, label: "Your latest pay runs" },
      { target: "text=Payroll Breakdown", closest: 2, label: "Take-home pay against taxes and deductions" },
    ],
  },
  {
    name: "payroll-runs",
    path: "/payroll/runs",
    marks: [
      { target: "text=Paid this year", closest: 3, label: "Paid, held back, and what's next" },
      { target: "text=Not finished", closest: 1, within: "[role=tablist]", label: "Runs not finished yet, and runs recorded" },
      { target: "text=Take-home", closest: 1, label: "Pay before deductions, taxes and take-home per run" },
      { target: "text=New payroll run", label: "Start a pay run" },
    ],
  },
  {
    name: "payroll-run-new",
    path: "/payroll/runs",
    actions: [{ click: "text=New payroll run" }, { waitFor: "text=Create Run" }, blur],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "payroll-run-offcycle",
    path: "/payroll/runs",
    actions: [{ click: "text=One-off payment" }, { click: "text=Bonus only" }, { waitFor: "text=Pay bonuses" }, blur],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "payroll-run",
    path: "/payroll",
    // The latest finished run (the newest one is usually still open).
    actions: [{ click: "text=Finished & recorded" }, { waitFor: "text=Employees (4)" }],
    clip: "text=Employees (4)",
    clipClosest: 2,
    padding: 12,
  },
  {
    name: "payroll-employee",
    path: "/payroll/employees",
    follow: `^/payroll/employees/${UUID}$`,
    followText: "Alice",
  },
  {
    name: "payroll-employee-new",
    path: "/payroll/employees",
    actions: [{ click: "text=New Employee" }, { waitFor: "text=Add an employee to the payroll." }],
    clip: "[role=dialog]",
  },

  /* --------------------------------------------------------- time & leave */
  {
    name: "time-and-leave",
    path: "/payroll/time-leave",
    marks: [
      { target: "text=Active Timesheets", closest: 3, label: "Timesheets in progress, waiting for approval and approved" },
      { target: "text=Leave Requests", label: "Switch between timesheets and leave requests" },
      { target: "text=Submitted", closest: 1, label: "Filter by status" },
    ],
  },
  {
    name: "time-and-leave-request-new",
    path: "/payroll/time-leave",
    actions: [{ click: "text=Leave Requests" }, { click: "text=New Request" }, { waitFor: "text=Submit Request" }],
    viewport: { height: 760 },
    clip: "[role=dialog]",
  },
  {
    name: "time-and-leave-timesheet-new",
    path: "/payroll/time-leave",
    actions: [{ click: "text=New Timesheet" }, { waitFor: "text=Create Timesheet" }],
    viewport: { height: 640 },
    clip: "[role=dialog]",
  },

  /* ---------------------------------------------------------------- teams */
  {
    name: "teams",
    path: "/teams",
    actions: [{ click: "text=Engineering" }, { waitFor: "text=Team Members" }, { waitFor: "text=Demo User" }],
    viewport: { height: 520 },
    marks: [
      { target: "text=Product and client engineering", closest: 2, label: "The team's name, size and description" },
      { target: "text=Add Member", label: "Add people from your workspace" },
      { target: "text=Demo User", closest: 3, label: "Everyone on the team" },
      { target: "text=Edit", label: "Rename it, describe it or change its colour" },
    ],
  },
  {
    name: "teams-list",
    path: "/teams",
    actions: [{ waitFor: "text=Engineering" }],
    viewport: { height: 480 },
    marks: [
      { target: "text=Total Teams", closest: 3, label: "Teams, members, average team size and your largest team" },
      { target: "input[placeholder^='Search']", closest: 2, label: "Search, and sort by name or size" },
      { target: "text=Engineering", closest: 1, label: "A card per team, with the first few people on it" },
      { target: "text=New Team", label: "Add a team" },
    ],
  },
  {
    name: "teams-new",
    path: "/teams",
    actions: [
      { click: "text=New Team" },
      { waitFor: "text=Create Team" },
      { type: "Warehouse", into: "[role=dialog] input[placeholder^='e.g. Engineering']" },
      blur,
    ],
    viewport: { height: 520 },
    clip: "[role=dialog]",
  },
  {
    name: "teams-members",
    path: "/teams/members",
    actions: [{ waitFor: "text=Engineering" }],
    viewport: { height: 420 },
    marks: [
      { target: "text=Demo User", closest: 3, label: "Everyone in your workspace" },
      { target: "text=Engineering", closest: 1, label: "A badge for each team they're on" },
    ],
  },
];
