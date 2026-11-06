// Screenshots for the tax and reports docs. See scripts/docs-shots.config.mjs for the spec format.

// Sets a React-controlled input's value (date inputs don't take typed text).
const setInputs = (selector, values) =>
  `(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; const els = [...document.querySelectorAll(${JSON.stringify(selector)})]; ${JSON.stringify(values)}.forEach((v, i) => { if (!els[i]) return; set.call(els[i], v); els[i].dispatchEvent(new Event("input", { bubbles: true })); els[i].dispatchEvent(new Event("change", { bubbles: true })); }); })()`;

export const shots = [
  /* ------------------------------------------------------------ tax */
  {
    name: "tax-rates",
    path: "/tax",
    marks: [
      { target: "text=Tax Periods", within: "[data-shell=panel]", closest: 1, label: "Rates, currencies, tax periods and your country's returns" },
      { target: "text=Total Rates", closest: 3, label: "How many rates apply to sales and to purchases" },
      { target: "text=Texas Sales Tax 8.25%", closest: ".rounded-lg", label: "Each rate, its percentage and where it applies" },
      { target: "text=Add Tax Rate", label: "Add a rate of your own" },
    ],
  },
  {
    name: "tax-rates-new",
    path: "/tax",
    actions: [
      { click: "text=Add Tax Rate" },
      { waitFor: "text=New Tax Rate" },
      { type: "Meals 20% (half reclaimable)", into: "[role=dialog] input[placeholder='e.g. GST 10%']" },
      { type: "20", into: "[role=dialog] input[placeholder='10.00']" },
      { click: "text=Standard (fully reclaimable)", within: "[role=dialog]" },
      { click: "text=Partly reclaimable" },
      { eval: setInputs("[role=dialog] input[placeholder='100']", ["50"]) },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    viewport: { height: 680 },
  },
  {
    name: "vat-return",
    path: "/tax/vat-return",
    marks: [
      { target: "text=This Month", closest: 1, label: "The period the return covers" },
      { target: "text=Count VAT", closest: 1, label: "Count VAT when you record it, or when money moves" },
      { target: "text=Use a flat rate", closest: 2, label: "Optional flat rate scheme" },
      { target: "text=Box 5", closest: 3, label: "What you pay, or get back" },
    ],
  },
  {
    name: "vat-return-boxes",
    path: "/tax/vat-return",
    actions: [{ scroll: "text=All Boxes", block: "start" }, { click: "text=VAT due on sales" }],
    clip: "text=All Boxes",
    clipClosest: 1,
    padding: 12,
  },
  {
    name: "vat-return-plain",
    path: "/reports/vat-return",
    actions: [{ click: "text=Tax you charged on sales" }],
    marks: [
      { target: "text=When invoiced or billed", closest: 2, label: "Accrual or cash basis" },
      { target: "text=Tax you charged on sales", closest: "div.rounded-lg", label: "Open a box to read what it means" },
      { target: "text=See what's behind this number", label: "Jump to the transactions behind it" },
    ],
  },
  {
    name: "vat-return-periods",
    path: "/tax/periods",
  },
  {
    name: "vat-return-period-new",
    path: "/tax/periods",
    actions: [
      { click: "text=New Tax Period" },
      { waitFor: "text=Start Date" },
      { type: "Q3 2026", into: "[role=dialog] input[placeholder='e.g. Q1 2026']" },
      { eval: setInputs("[role=dialog] input[type=date]", ["2026-07-01", "2026-09-30"]) },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    viewport: { height: 560 },
  },
  {
    name: "sales-tax",
    path: "/tax/sales-tax",
    marks: [
      { target: "text=This Month", closest: 1, label: "Pick the filing period" },
      { target: "text=Tax Collected", closest: 2, label: "Tax collected, taxable sales and sales with no tax rate" },
      { target: "text=Breakdown by Rate", label: "Collected tax, rate by rate" },
      { target: "text=Export CSV", label: "Print it, or export it for your filing" },
    ],
  },
  {
    name: "bas",
    path: "/tax/bas",
    marks: [
      { target: "text=GST on Sales vs Purchases", closest: 1, label: "GST on sales (1A) against GST on purchases (1B)" },
      { target: "text=Amount Payable to ATO", closest: 3, label: "What you pay the ATO, or get back" },
      { target: "text=GST Information", closest: 2, label: "Every G field and 1A, 1B" },
    ],
  },
  {
    name: "schedule-c",
    path: "/tax/schedule-c",
    marks: [
      { target: "text=Tax prep worksheet", closest: 2, label: "A worksheet for your preparer, not a filing tool" },
      { target: "text=Income vs Expenses", closest: 1, label: "Gross income against total expenses" },
      { target: "text=Line 31", closest: 3, label: "Line 31: your net profit or loss" },
    ],
  },
  {
    name: "form-1099",
    path: "/reports/1099",
    viewport: { height: 720 },
    // The page opens on last year; the demo company's contractor payments are all this year.
    actions: [
      { eval: `[...document.querySelectorAll("span")].find((s) => s.textContent === "Tax year:")?.nextElementSibling?.setAttribute("data-shot", "this-year")`, wait: 50, settle: false },
      { click: "[data-shot=this-year]", wait: 800 },
    ],
    marks: [
      { target: "text=Tax year:", closest: 1, label: "Pick the tax year" },
      { target: "text=Need a 1099 form", closest: ".grid", label: "Who needs a form, what you paid them, and the threshold" },
      { target: "text=Contractor", closest: "table", label: "Each contractor you track: payments, total paid and whether they need a form" },
      { target: "text=Export CSV", label: "Take the list to your filing service" },
    ],
  },
  {
    name: "form-1099-contact",
    path: "/contacts",
    follow: "^/contacts/[0-9a-f]{8}-[0-9a-f-]{27}$",
    followText: "Freelancer Jane",
    actions: [{ scroll: "text=US tax reporting", block: "center" }],
    clip: "text=US tax reporting",
    clipClosest: 4,
    padding: 16,
    marks: [{ target: "#is1099Vendor", closest: 1, label: "Tick this for each US contractor" }],
  },

  /* -------------------------------------------------------- reports */
  {
    name: "reports",
    path: "/reports",
    marks: [
      { target: "text=All reports", within: "[data-shell=panel]", closest: 1, label: "Every report, grouped, in the side panel" },
      { target: "text=Quick health check", closest: "a", label: "Start here: this period against the last" },
      { target: "text=Money in vs money out", closest: "a", label: "Each card says what the report answers" },
      { target: "text=Download a report bundle", closest: "a", label: "The main reports in one spreadsheet" },
    ],
  },
  {
    name: "reports-pack",
    path: "/reports/pack",
    clip: "text=What's in the bundle",
    clipClosest: 4,
    padding: 12,
  },
  {
    name: "profit-and-loss",
    path: "/reports/profit-and-loss",
    marks: [
      { target: "text=This Month", closest: 1, label: "Pick the period" },
      { target: "text=When invoiced or billed", closest: 2, label: "Count on invoice date, or when money moves" },
      { target: "text=Compare two periods side by side", closest: 1, label: "Compare periods, split by team, or see a yearly summary" },
      { target: "text=Download PDF", closest: 1, label: "Download a PDF or export a CSV" },
      { target: "text=Profit (in minus out)", closest: 3, label: "Money in, money out and the difference" },
    ],
  },
  {
    name: "profit-and-loss-comparison",
    path: "/reports/pnl-comparison",
    actions: [{ click: "text=Monthly" }, { click: "text=Quarterly", within: "[role=listbox]" }, { click: "text=6 periods" }, { click: "text=4 periods", within: "[role=listbox]" }, { hover: "text=Back to reports" }],
    marks: [
      { target: "text=Quarterly", closest: 2, label: "Months, quarters or years, and how many of them" },
      { target: "text=Metric", closest: "table", label: "Each period with the change from the one before" },
    ],
  },
  {
    name: "balance-sheet",
    path: "/reports/balance-sheet",
    marks: [
      { target: "text=As of:", closest: 1, label: "The day you want the snapshot for" },
      { target: "text=Compare to an earlier date", label: "Add a second date to compare" },
      { target: "text=Download PDF", label: "Download it as a PDF" },
      { target: "text=Accounts Receivable", closest: "tr", label: "Click any account to see its transactions" },
    ],
  },
  {
    name: "cash-flow",
    path: "/reports/cash-flow",
    marks: [
      { target: "text=From day-to-day trading", closest: 3, label: "Trading, buying and selling things, funding" },
      { target: "text=Change in cash", closest: 3, label: "How much your cash changed" },
    ],
  },
  {
    name: "cash-flow-forecast",
    path: "/reports/cash-flow-forecast",
  },
  {
    name: "aged-receivables",
    path: "/reports/aged-receivables",
    marks: [
      { target: "text=As of date:", closest: 1, label: "Age everything as of any date" },
      { target: "text=90+ days", closest: 3, label: "A total per bucket, with how many invoices" },
      { target: "text=Total owed to you", closest: 1, label: "Everything still owed to you" },
      { target: "text=Export CSV", label: "Export the list" },
    ],
  },
  {
    name: "aged-payables",
    path: "/reports/aged-payables",
  },
  {
    name: "general-ledger",
    path: "/reports/general-ledger",
    marks: [
      { target: "text=This Month", closest: 1, label: "The period to list" },
      { target: "text=Expand all", closest: 1, label: "Open or close every account at once" },
      { target: "text=Running balance", closest: "table", label: "Each entry and the running balance" },
    ],
  },
  {
    name: "custom-reports",
    path: "/reports/custom",
  },
  {
    name: "custom-reports-builder",
    path: "/reports/custom",
    actions: [
      { click: "text=New Report" },
      { waitFor: "text=Report Builder" },
      { type: "Unpaid invoices", into: "[role=dialog] input[placeholder='Monthly Sales Report']" },
      { click: "text=Run Report" },
      { waitFor: "th" },
    ],
    clip: "[role=dialog]",
    viewport: { height: 760 },
  },
  {
    name: "custom-reports-saved",
    path: "/reports/saved",
  },
  {
    name: "custom-reports-schedule",
    path: "/reports/schedules",
    actions: [
      { click: "text=Email a report automatically" },
      { waitFor: "text=Which report to send" },
      { click: "text=Choose a saved report" },
      { click: "text=Monthly sales", within: "[role=listbox]" },
      { type: "accountant@example.com", into: "#recipients" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "consolidation",
    path: "/reports/consolidation",
    marks: [
      { target: "text=Company groups", closest: 2, label: "Create a group for the businesses you report on together" },
    ],
  },
];
