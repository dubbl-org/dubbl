// The app's main screens, used on the guides home and getting-started pages.
export const shots = [
  {
    name: "overview",
    path: "/dashboard",
    marks: [
      { target: "[data-shell=rail]", label: "The rail: every area of dubbl, one click away" },
      { target: "[data-shell=panel]", label: "The panel: the pages inside the area you're in" },
      { target: "text=Search", label: "Search and jump anywhere (⌘K)" },
      { target: "text=Ask Tilly", label: "Ask Tilly, the AI assistant" },
    ],
  },
];

// Getting started: finding your way, setup and import. Nothing here is saved.
shots.push(
  {
    name: "finding-your-way-search",
    path: "/dashboard",
    actions: [
      { click: "text=Search" },
      { waitFor: "input[placeholder='Search invoices, bills, contacts, documents...']" },
      { type: "acme" },
      { waitFor: "text=Acme Corp", timeout: 8000 },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "finding-your-way-sales",
    path: "/sales",
    marks: [
      { target: "text=Demo Company", label: "Switch organization, see your plan and members" },
      { target: "text=Invoices", within: "[data-shell=panel]", label: "Pages inside Sales" },
      { target: "text=New Invoice", label: "The create button changes with the page" },
      { target: "main input[placeholder^='Search']", label: "Search, filter and group the list" },
    ],
  },
  {
    name: "finding-your-way-org",
    path: "/dashboard",
    actions: [{ click: "text=Demo Company" }, { waitFor: "text=New organization" }],
    clip: "[role=menu]",
  },
  {
    name: "finding-your-way-tilly",
    path: "/dashboard",
    actions: [{ click: "text=Ask Tilly" }, { waitFor: "aside[aria-label=Tilly]" }],
  },
  {
    name: "setup-organization",
    path: "/onboarding",
    actions: [{ waitFor: "text=Name your organization" }, { eval: "document.querySelector('main .max-w-lg .rounded-2xl > div').style.background = '#1f1f1f'; const back = document.querySelector('main .max-w-lg > button'); if (back) back.style.display = 'none'" }],
    clip: "main .max-w-lg",
  },
  {
    name: "setup-country",
    path: "/onboarding",
    actions: [{ waitFor: "text=Name your organization" }, { click: "text=Next" }, { waitFor: "text=Where is your business based?" }, { click: "text=United Kingdom" }, { eval: "document.querySelector('main .max-w-lg .rounded-2xl > div').style.background = '#1f1f1f'; const back = document.querySelector('main .max-w-lg > button'); if (back) back.style.display = 'none'" }],
    clip: "main .max-w-lg",
  },
  {
    name: "setup-tax",
    path: "/onboarding",
    actions: [
      { waitFor: "text=Name your organization" },
      { click: "text=Next" },
      { waitFor: "text=Where is your business based?" },
      { click: "text=United Kingdom" },
      { click: "text=Next" },
      { waitFor: "text=What type of business?" },
      { eval: "document.querySelector('main .overflow-y-auto button')?.click()" },
      { click: "text=Next" },
      { waitFor: "text=Tax and financial year" },
      { eval: "document.querySelector('main .max-w-lg .rounded-2xl > div').style.background = '#1f1f1f'; const back = document.querySelector('main .max-w-lg > button'); if (back) back.style.display = 'none'" }
    ],
    clip: "main .max-w-lg",
  },
  {
    name: "setup-review",
    path: "/onboarding",
    actions: [
      { waitFor: "text=Name your organization" },
      { click: "text=Next" },
      { waitFor: "text=Where is your business based?" },
      { click: "text=United Kingdom" },
      { click: "text=Next" },
      { waitFor: "text=What type of business?" },
      { eval: "document.querySelector('main .overflow-y-auto button')?.click()" },
      { click: "text=Next" },
      { waitFor: "text=Tax and financial year" },
      { click: "text=Next" },
      { click: "text=Skip" },
      { click: "text=Skip" },
      { waitFor: "text=You're all set" },
      { eval: "document.querySelector('main .max-w-lg .rounded-2xl > div').style.background = '#1f1f1f'; const back = document.querySelector('main .max-w-lg > button'); if (back) back.style.display = 'none'" }
    ],
    clip: "main .max-w-lg",
  },
  {
    name: "setup-settings",
    path: "/settings",
    actions: [{ scroll: "text=Financials", block: "center" }],
    marks: [
      { target: "text=Default currency", closest: 1, label: "Your base currency" },
      { target: "text=Fiscal year start", closest: 1, label: "When your financial year starts" },
      { target: "text=Payment terms", closest: 1, label: "Default days to pay" },
    ],
  },
  {
    name: "import-data",
    path: "/settings/import-export",
    marks: [
      { target: "text=Select your source system", closest: 1, label: "Where your data comes from" },
      { target: "text=No dependencies", label: "Start with accounts, then contacts" },
      { target: "main .border-dashed", label: "Bank statements have their own importer" },
    ],
  },
  {
    name: "import-data-wizard",
    viewport: { width: 1440, height: 640 },
    path: "/settings/import-export",
    actions: [
      { eval: "[...document.querySelectorAll('main button')].find((b) => b.querySelector('p')?.textContent === 'Contacts')?.click()" },
      { waitFor: "text=Drop your CSV file here" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "import-data-map",
    viewport: { width: 1440, height: 640 },
    path: "/settings/import-export",
    actions: [
      { eval: "[...document.querySelectorAll('main button')].find((b) => b.querySelector('p')?.textContent === 'Contacts')?.click()" },
      { waitFor: "text=Drop your CSV file here" },
      { eval: "(() => { const input = document.querySelector('[role=dialog] input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([\"Display Name,Email,Phone,Tax ID,Billing City,Notes\\nNorthwind Studio,accounts@northwind.studio,555-0100,US12-3456789,Portland,VIP\\nHarbor Coffee,hello@harbor.coffee,555-0199,,Seattle,\"], 'quickbooks-customers.csv', { type: 'text/csv' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()" },
      { waitFor: "text=Change file" },
    ],
    clip: "[role=dialog]",
  },
);
