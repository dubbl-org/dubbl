// Screenshots for the learn docs. See scripts/docs-shots.config.mjs for the spec format.
// Learn pages explain ideas, so these show where each idea lives in dubbl.

/** Open a row of a list that opens on double-click (journal entries, assets, pay runs). */
const openRow = (text) => ({
  eval: `[...document.querySelectorAll("tr")].find((r) => r.innerText.includes(${JSON.stringify(text)})).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`,
  wait: 1500,
});

export const shots = [
  /* double entry, debits and credits */
  {
    name: "learn-journal-entry",
    path: "/accounting",
    // The latest Metro Services retainer invoice: every month the demo seed sends one for $7,500,
    // and its entry is two lines, Accounts Receivable and Service Revenue.
    actions: [
      {
        eval: `[...document.querySelectorAll("tbody tr")].find((r) => [...r.cells].some((c) => /^Invoice INV-\\d+$/.test(c.innerText.trim())) && r.innerText.includes("$7,500.00")).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`,
        wait: 1500,
      },
    ],
    marks: [
      { target: "text=Accounts Receivable", closest: "tr, [class*=grid]", label: "One account takes the debit" },
      { target: "text=Service Revenue", closest: "tr, [class*=grid]", label: "Another takes the credit" },
      { target: "text=Total Debits", closest: 2, label: "Debits equal credits, so the difference is $0.00" },
    ],
  },
  {
    name: "learn-journal",
    path: "/accounting",
    marks: [
      { target: "text=Total moved", label: "Everything posted to your books" },
      { target: "text=Typed in by hand", closest: 2, label: "How many entries you typed and how many dubbl made for you" },
      { target: "text=New Entry", label: "Write your own entry" },
    ],
  },
  {
    name: "learn-new-entry",
    path: "/accounting",
    viewport: { height: 660 },
    actions: [
      { click: "text=New Entry" },
      { waitFor: "text=Entry lines" },
      { type: "Office rent - March", into: "#description" },
      { click: "text=Select account" },
      { press: "5" }, { press: "2" }, { press: "Enter" },
      { click: "text=Select account" },
      { press: "1" }, { press: "1" }, { press: "Enter" },
      { eval: "document.querySelectorAll('[role=dialog] input[placeholder=\"0.00\"]')[0].focus()" },
      { type: "3500" },
      { eval: "document.querySelectorAll('[role=dialog] input[placeholder=\"0.00\"]')[3].focus()" },
      { type: "3500" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "learn-trial-balance",
    path: "/reports/trial-balance",
    marks: [
      { target: "text=Money in side", label: "Debit balances" },
      { target: "text=Money out side", label: "Credit balances" },
      { target: "text=As of:", closest: 1, label: "Any date you like" },
    ],
  },

  /* chart of accounts */
  {
    name: "learn-accounts",
    path: "/accounting/accounts",
    marks: [
      { target: "text=Liability", closest: 2, label: "How many accounts of each type you have" },
      { target: "[role=tablist]", label: "Filter by type" },
      { target: "text=Checking Account", label: "Each account has a code, a name and a currency" },
    ],
  },

  /* accrual vs cash, statements */
  {
    name: "learn-pnl",
    path: "/reports/profit-and-loss",
    marks: [
      { target: "text=Count income and costs:", closest: 1, label: "Accrual (when invoiced or billed) or cash (when money moves)" },
      { target: "text=This Month", closest: 1, label: "The period it covers" },
      { target: "text=Profit (in minus out)", closest: 3, label: "Money in minus money out" },
    ],
  },
  {
    name: "learn-balance-sheet",
    path: "/reports/balance-sheet",
    marks: [
      { target: "text=As of:", closest: 1, label: "One date, not a period" },
      { target: "text=Compare to an earlier date", label: "Put two dates side by side" },
      { target: "text=Accounts Receivable", closest: "tr", label: "Customers who haven't paid yet" },
    ],
  },
  {
    name: "learn-cash-flow",
    path: "/reports/cash-flow",
    marks: [
      { target: "text=From day-to-day trading", closest: 2, label: "Running the business" },
      { target: "text=From buying & selling things", closest: 2, label: "Equipment and other long-term things" },
      { target: "text=From funding", closest: 2, label: "Loans and money from owners" },
      { target: "text=Change in cash", closest: 2, label: "The bottom line: how much your cash changed" },
    ],
  },

  /* receivables and payables */
  {
    name: "learn-aged-receivables",
    path: "/reports/aged-receivables",
    marks: [
      { target: "text=Current", closest: 2, label: "Not due yet" },
      { target: "text=90+ Days", closest: 2, label: "The longer it waits, the further right it moves" },
      { target: "text=Days overdue", label: "Counted from the due date" },
    ],
  },

  /* bank reconciliation */
  {
    name: "learn-bank-account",
    path: "/accounting/banking",
    actions: [{ click: "text=Business Checking", wait: 1500 }],
    marks: [
      { target: "text=To do", closest: 2, label: "Lines still to sort, lines done, lines ignored" },
      { target: "text=Categorize", label: "Put a bank line in your books" },
      { target: "text=Match statement to your books", label: "Reconcile against a statement" },
    ],
  },
  {
    name: "learn-reconcile",
    path: "/accounting/banking",
    actions: [
      { click: "text=Business Checking", wait: 1500 },
      { eval: "location.href = location.pathname.match(/\\/accounting\\/banking\\/[^/]+/)[0] + '/reconcile'", wait: 2500 },
    ],
    marks: [
      { target: "text=Bank statement balance", closest: 2, label: "The statement, your books, and the gap between them" },
      { target: "text=Not yet matched", closest: 2, label: "Tick the lines that appear on the statement" },
      { target: "text=Write off the difference", label: "Last resort for a small leftover gap" },
      { target: "text=Finish statement check", label: "Done" },
    ],
  },

  /* tax */
  {
    name: "learn-vat-return",
    path: "/tax/vat-return",
    marks: [
      { target: "text=Count VAT", closest: 1, label: "Count VAT when you record it, or when money moves" },
      { target: "text=Output vs input VAT", closest: 1, label: "VAT you charged against VAT you paid" },
      { target: "text=Box 5 · Amount due to HMRC", closest: 2, label: "What you owe the tax office" },
    ],
  },
  {
    name: "learn-tax-rates",
    path: "/tax",
    marks: [
      { target: "text=Sales Rates", closest: 2, label: "Rates you charge customers" },
      { target: "text=Purchase Rates", closest: 2, label: "Rates suppliers charge you" },
      { target: "text=Texas Sales Tax 8.25%", closest: ".rounded-lg", label: "Each rate applies to sales, purchases or both" },
    ],
  },

  /* multi-currency */
  {
    name: "learn-currencies",
    path: "/tax/currencies",
    viewport: { height: 570 },
    marks: [
      { target: "text=Organization Base Currency", closest: 1, label: "Your base currency: every report is in this" },
      { target: "text=Unrealised FX gains & losses", closest: 1, label: "Open foreign invoices and bills, valued at today's rate" },
      { target: "text=Add Rate", label: "Add a rate by hand" },
    ],
  },

  /* depreciation */
  {
    name: "learn-fixed-assets",
    path: "/accounting/fixed-assets",
    marks: [
      { target: "text=How value is spread", label: "The depreciation method" },
      { target: "text=Value used up", closest: 1, label: "Accumulated depreciation so far" },
      { target: "text=Record value drops", label: "Record this month's depreciation for every asset" },
    ],
  },
  {
    name: "learn-fixed-asset",
    path: "/accounting/fixed-assets",
    actions: [openRow("MacBook Pro")],
    marks: [
      { target: "text=In use", closest: 1, label: "Method and useful life" },
      { target: "text=Value left at the end", closest: 1, label: "Residual value" },
      { target: "text=Bookkeeping accounts", closest: 1, label: "The accounts each value drop posts to" },
      { target: "text=Value drops over time", closest: 1, label: "Every month's depreciation" },
    ],
  },

  /* inventory */
  {
    name: "learn-inventory",
    path: "/inventory",
    marks: [
      { target: "text=Could sell for", closest: 2, label: "What it would all sell for" },
      { target: "text=Cost", label: "What you pay for one" },
      { target: "text=Sells for", label: "What you sell it for" },
    ],
  },

  /* payroll */
  {
    name: "learn-payroll-runs",
    path: "/payroll/runs",
    marks: [
      { target: "text=Before deductions", label: "Gross pay" },
      { target: "text=Taxes & deductions", label: "Withheld from employees" },
      { target: "text=Take-home", label: "What lands in their accounts" },
      { target: "text=New payroll run", label: "Start a pay run" },
    ],
  },

  /* closing */
  {
    name: "learn-fiscal-years",
    path: "/accounting/fiscal-years",
    viewport: { height: 560 },
    marks: [
      { target: "text=FY 2026", closest: 2, label: "A financial year and its dates" },
      { target: "text=Close year", label: "Move the year's profit into retained earnings and lock it" },
    ],
  },
  {
    name: "learn-accruals",
    path: "/accounting/accruals",
    marks: [
      { target: "text=Business insurance - monthly amortization", closest: "tr", label: "One $4,800 premium, spread over 12 months at $400 a month" },
      { target: "text=Spread so far", closest: "[role=button], div.bg-card", label: "How much has reached your profit and loss so far" },
      { target: "text=New accrual", label: "Set one up" },
    ],
  },

  /* solopreneurs */
  {
    name: "learn-overview",
    path: "/dashboard",
    marks: [
      { target: "text=Cash in bank", label: "Cash in your bank accounts" },
      { target: "text=Profit", label: "Money in minus money out" },
      { target: "text=Owed to you", label: "Customers who haven't paid" },
      { target: "text=Your to-do list", closest: 2, label: "What needs you this week" },
    ],
  },
];
