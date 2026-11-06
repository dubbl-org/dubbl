// Screenshots for the accounting docs. See scripts/docs-shots.config.mjs for the spec format.
const UUID = "[0-9a-f]{8}-[0-9a-f-]{27}";

/** Tag the nth element matching a selector so a later action can click it. */
const tag = (selector, n, id) => ({ eval: `document.querySelectorAll(${JSON.stringify(selector)})[${n}]?.setAttribute("data-shot", ${JSON.stringify(id)})`, wait: 50, settle: false });
/** Focus the nth element matching a selector, ready for a `type` with no `into`. */
const focus = (selector, n) => ({ eval: `document.querySelectorAll(${JSON.stringify(selector)})[${n}]?.focus()`, wait: 50, settle: false });
/** Open the nth select in a drawer and pick the first option starting with `key`. */
const pick = (n, keys, scope = "[role=dialog]") => [
  tag(`${scope} button[role=combobox]`, n, `combo-${n}`),
  { click: `[data-shot=combo-${n}]`, wait: 400, settle: false },
  ...[...keys].map((k) => ({ press: k, wait: 60, settle: false })),
  { press: "Enter", wait: 300, settle: false },
];
const blur = { eval: "document.activeElement?.blur()", wait: 200 };
/** A posted entry the demo seed always makes: the loan's first monthly payment. */
const LOAN_PAYMENT = "Loan payment #1 for Equipment Financing";
/** Search the journal list for an entry, so it's on screen whatever the dates. */
const findEntry = (text) => [{ type: text, into: "input[placeholder^='Search journal entries']", wait: 600 }, blur, { scroll: `text=${text}`, block: "center" }];

export const shots = [
  /* ------------------------------------------------ chart of accounts */
  {
    name: "accounts",
    path: "/accounting/accounts",
    marks: [
      { target: "div.flex.h-2", closest: 1, label: "How your accounts split across the five types" },
      { target: "[role=tablist]", label: "Show one type at a time" },
      { target: "input[placeholder^='Search by name or code']", closest: 1, label: "Search by name or code, and change the sort" },
      { target: "span.bg-muted.rounded.shrink-0", label: "Built-in accounts: name and code are fixed" },
      { target: "text=New account", label: "Add an account of your own" },
    ],
  },
  {
    name: "accounts-new",
    path: "/accounting/accounts",
    viewport: { height: 560 },
    actions: [
      { click: "text=New account" },
      { waitFor: "text=Account Details" },
      { type: "6150", into: "#drawer-account-code" },
      { type: "Software subscriptions", into: "#drawer-account-name" },
      ...pick(0, "ex"),
      { type: "Design tools, hosting and other monthly software", into: "#drawer-account-description" },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "account-ledger",
    path: "/accounting/accounts",
    actions: [{ click: "text=Checking Account" }, { waitFor: "text=Back to accounts" }, { waitFor: "text=Transactions" }],
    marks: [
      { target: "text=Total Debits", closest: 2, label: "Balance, total debits and credits, and how many entries" },
      { target: "[role=tablist]", label: "Show only debits or only credits" },
      { target: "text=Balance", within: "thead", label: "The running balance after each entry" },
    ],
  },
  {
    name: "account-settings",
    path: "/accounting/accounts",
    actions: [{ click: "text=Checking Account" }, { waitFor: "text=Back to accounts" }, { click: "text=Settings", within: "nav.border-b" }, { waitFor: "text=Danger zone" }],
    viewport: { height: 1400 },
    clip: "form",
    padding: 16,
  },

  /* ------------------------------------------------ journal entries */
  {
    name: "journal-entries",
    path: "/accounting",
    marks: [
      { target: "text=Entries this month", closest: 3, label: "This month, drafts waiting, and what's been reversed" },
      { target: "input[placeholder^='Search journal entries']", closest: 2, label: "Search, filter by date, source and how it was made" },
      { target: "th:nth-child(6)", label: "Source: typed in by hand, or made by an invoice, bill or payment" },
      { target: "text=New Entry", label: "Start a new manual entry" },
    ],
  },
  {
    name: "journal-entry-new",
    path: "/accounting",
    viewport: { height: 640 },
    actions: [
      { click: "text=New Entry" },
      { waitFor: "text=Entry lines" },
      { type: "Owner adds money to the business", into: "#description" },
      { type: "CAP-2026-01", into: "#reference" },
      ...pick(0, "1100"),
      ...pick(1, "30"),
      focus("[role=dialog] input[inputmode=decimal]", 0),
      { type: "5000.00", wait: 100, settle: false },
      focus("[role=dialog] input[inputmode=decimal]", 3),
      { type: "5000.00", wait: 100, settle: false },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "journal-entry-preview",
    viewport: { height: 720 },
    path: "/accounting",
    actions: [...findEntry(LOAN_PAYMENT), { click: `text=${LOAN_PAYMENT}` }, { waitFor: "text=What moved where" }],
    clip: "[role=dialog]",
    marks: [
      { target: "text=What moved where", closest: 1, label: "Every line of the entry: account, debit and credit" },
      { target: "text=Reverse entry", label: "Undo a posted entry with a matching opposite one" },
    ],
  },
  {
    name: "journal-entry-reverse",
    path: "/accounting",
    actions: [
      ...findEntry(LOAN_PAYMENT),
      { click: `text=${LOAN_PAYMENT}` },
      { waitFor: "text=What moved where" },
      { click: "text=Reverse entry" },
      { waitFor: "[role=dialog] textarea", timeout: 5000 },
      { type: "Booked to the wrong month", into: "[role=dialog] textarea" },
    ],
    clip: "[role=dialog]:has(textarea)",
    padding: 0,
  },

  /* ------------------------------------------------ recurring journals */
  {
    name: "recurring-journals",
    path: "/accounting/recurring-journals",
    viewport: { height: 600 },
    marks: [
      { target: "text=Posting automatically", closest: 1, label: "What's running, the next entry and what it comes to each month" },
      { target: "text=Accrued audit fee", closest: "tr", label: "Each one: how often, the amount, the next entry and how many are posted" },
      { target: "text=Post what's due", label: "Post anything that's due now" },
      { target: "text=New recurring journal", label: "Set one up" },
    ],
  },
  {
    name: "recurring-journal-new",
    path: "/accounting/recurring-journals",
    actions: [
      { click: "text=New recurring journal" },
      { waitFor: "text=Template Details" },
      { type: "Monthly office rent", into: "[role=dialog] input[placeholder^='e.g. Monthly']" },
      { type: "RENT", into: "[role=dialog] input[placeholder='Optional reference']" },
      ...pick(1, "52"),
      ...pick(2, "1100"),
      focus("[role=dialog] input[inputmode=decimal]", 0),
      { type: "3500.00", wait: 100, settle: false },
      focus("[role=dialog] input[inputmode=decimal]", 3),
      { type: "3500.00", wait: 100, settle: false },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------ accruals */
  {
    name: "accruals",
    path: "/accounting/accruals",
    marks: [
      { target: "text=Running", closest: ".grid", label: "What's running, this month's share, what's left to spread and anything behind" },
      { target: "text=Business insurance - monthly amortization", closest: "tr", label: "Each accrual: the total, each month's share, months recorded and the next one" },
      { target: "text=New accrual", label: "Add an accrual" },
    ],
  },
  {
    name: "accrual-new",
    path: "/accounting/accruals",
    viewport: { height: 700 },
    actions: [
      { click: "text=New accrual" },
      { waitFor: "text=Accrual Details" },
      { type: "Annual insurance premium", into: "#drawer-accrual-desc" },
      { eval: "(() => { const i = document.querySelector('#drawer-accrual-amount'); i.focus(); i.select(); })()", wait: 50, settle: false },
      { type: "1200.00", wait: 100, settle: false },
      { type: "12", into: "#drawer-accrual-periods" },
      { click: "text=Choose the account..." },
      { type: "Prepaid", wait: 500 },
      { press: "Enter" },
      { click: "text=Choose the account each period" },
      { type: "Insurance", wait: 500 },
      { press: "Enter" },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------ fixed assets */
  {
    name: "fixed-assets",
    path: "/accounting/fixed-assets",
    marks: [
      { target: "text=What you paid", closest: 3, label: "What you paid, what it's worth now, and what's been written off" },
      { target: "th:nth-child(7)", label: "How much of each item's cost is used up" },
      { target: "text=Record value drops", label: "Record this month's depreciation for every asset" },
      { target: "text=New Asset", label: "Add an asset" },
    ],
  },
  {
    name: "fixed-asset-new",
    path: "/accounting/fixed-assets",
    viewport: { height: 1180 },
    actions: [
      { click: "text=New Asset" },
      { waitFor: "text=Asset Info" },
      { type: "Delivery van", into: "[role=dialog] input[placeholder='Office Equipment']" },
      { type: "FA-003", into: "[role=dialog] input[placeholder='FA-001']" },
      { type: "36000.00", into: "[role=dialog] input[placeholder='10000.00']" },
      { type: "6000.00", into: "[role=dialog] input[placeholder='500.00']" },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "fixed-asset",
    path: "/accounting/fixed-assets",
    follow: `^/accounting/fixed-assets/${UUID}$`,
    followText: "MacBook",
    marks: [
      { target: "text=Record value drop", label: "Record this month's depreciation for this asset" },
      { target: "text=More actions", label: "Revalue, write down, undo, or record it as sold" },
      { target: "text=What you paid", closest: 2, label: "Cost, current value and how much is used up" },
      { target: "text=Bookkeeping accounts", closest: 1, label: "The accounts its entries post to" },
    ],
  },
  {
    name: "fixed-asset-more",
    path: "/accounting/fixed-assets",
    follow: `^/accounting/fixed-assets/${UUID}$`,
    followText: "MacBook",
    actions: [{ click: "text=More actions" }, { waitFor: "text=Record a higher value" }],
    clip: "[role=menu]",
    padding: 12,
  },
  {
    name: "fixed-asset-dispose",
    path: "/accounting/fixed-assets",
    follow: `^/accounting/fixed-assets/${UUID}$`,
    followText: "MacBook",
    actions: [
      { click: "text=More actions" },
      { click: "text=Record as sold or written off" },
      { waitFor: "text=Amount you got for it" },
      focus("[role=dialog] input[inputmode=decimal]", 0),
      { type: "1800.00", wait: 100, settle: false },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "asset-categories-new",
    path: "/accounting/asset-categories",
    actions: [{ click: "text=New Category" }, { waitFor: "text=How it loses value" }, { type: "Vehicles", into: "#ac-name" }, blur],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------ loans */
  {
    name: "loans",
    path: "/accounting/loans",
    actions: [
      // The next payment cell (the list's only date column): "12d late" when its date has passed unpaid.
      {
        eval: `(() => { const tds = [...document.querySelectorAll("tbody td")]; const td = tds.find((td) => /\\d+d late/.test(td.innerText)) || tds.find((td) => /[A-Z][a-z]{2} \\d+, \\d{4}/.test(td.innerText)); td?.setAttribute("data-shot", "next-payment"); })()`,
        settle: false,
      },
    ],
    marks: [
      { target: "text=You still owe", closest: ".grid", label: "What you owe, the next payment, interest so far and payments due" },
      { target: "th:nth-child(7)", label: "Payments made out of the total" },
      { target: "[data-shot=next-payment]", label: "The next payment date, marked late once it passes without a payment recorded" },
      { target: "text=New loan", label: "Add a loan" },
    ],
  },
  {
    name: "loan-new",
    path: "/accounting/loans",
    viewport: { height: 860 },
    actions: [
      { click: "text=New loan" },
      { waitFor: "text=Loan Details" },
      { type: "Van loan", into: "#drawer-loan-name" },
      { eval: "(() => { const i = document.querySelector('[role=dialog] input[inputmode=decimal]'); i.focus(); i.select(); })()", wait: 50, settle: false },
      { type: "30000.00", wait: 100, settle: false },
      { type: "6", into: "#drawer-loan-rate" },
      { type: "36", into: "#drawer-loan-term" },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "loan",
    path: "/accounting/loans",
    follow: `^/accounting/loans/${UUID}$`,
    followText: "Equipment Financing",
    marks: [
      { target: "text=Record this month's payment", label: "Record the next scheduled payment" },
      { target: "text=Amount borrowed", closest: 2, label: "Borrowed, rate, length and monthly payment" },
      { target: "text=Off the loan", closest: 1, label: "Each payment split into principal and interest" },
    ],
  },

  /* ------------------------------------------------ budgets */
  {
    name: "budgets",
    path: "/accounting/budgets",
    marks: [
      { target: "text=FY 2026 Operating Budget", label: "Spent so far against the whole budget, and days left" },
      { target: "text=Wages & Salaries", closest: 3, label: "Each account: left this month, spent and budgeted" },
      { target: "text=New Budget", label: "Plan a new budget" },
    ],
  },
  {
    name: "budget",
    path: "/accounting/budgets",
    actions: [{ click: "text=FY 2026 Operating Budget" }, { waitFor: "text=Total Budget" }],
    marks: [
      { target: "text=Total Budget", closest: 2, label: "Budget, actual, variance, burn rate and days left" },
      { target: "text=Spending Trend", closest: 1, label: "Budgeted against actual, period by period" },
    ],
  },
  {
    name: "budget-new",
    path: "/accounting/budgets",
    actions: [
      { click: "text=New Budget" },
      { waitFor: "text=Budget Info" },
      { type: "Marketing 2027", into: "[role=dialog] input[placeholder='FY 2026 Operating Budget']" },
      { click: "text=Add Line" },
      ...pick(1, "56"),
      focus("[role=dialog] input[inputmode=decimal]", 0),
      { type: "24000.00", wait: 100, settle: false },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------ periods and closing */
  {
    name: "financial-years",
    path: "/accounting/fiscal-years",
    actions: [{ click: "text=Add a year" }, { waitFor: "text=New financial year" }, blur],
    marks: [
      { target: "text=New financial year", closest: 1, label: "Add a year: dubbl suggests the next one" },
      { target: "text=Current", closest: 3, label: "Each year, its dates and whether it's open or closed" },
      { target: "text=Close year", label: "Close the year when the numbers are final" },
    ],
  },
  {
    name: "financial-years-close",
    path: "/accounting/fiscal-years",
    actions: [{ click: "text=Close year" }, { waitFor: "text=Close the year" }],
    clip: "[role=alertdialog], [role=dialog]",
    padding: 0,
  },
  {
    name: "lock-dates",
    path: "/settings",
    actions: [{ scroll: "text=Lock past dates", block: "center" }],
    clip: "text=Lock past dates",
    clipClosest: 2,
    padding: 24,
  },

  /* ------------------------------------------------ opening balances */
  {
    name: "opening-balances",
    path: "/accounting/opening-balances",
    viewport: { height: 640 },
    marks: [
      { target: "[class*='bg-muted/30']", label: "What opening balances are" },
      { target: "text=Starting from:", label: "The date your books start from" },
      { target: "text=Money in (debit)", closest: "div.overflow-x-auto", label: "Each account's starting balance, with both columns adding up to the same total" },
      { target: "text=Replace opening balances", label: "Enter a new set: it replaces the old one" },
    ],
  },
  {
    name: "opening-balances-new",
    path: "/accounting/opening-balances",
    viewport: { height: 560 },
    actions: [
      { click: "text=Set opening balances" },
      { waitFor: "text=Account balances" },
      ...pick(0, "1100"),
      ...pick(1, "2000"),
      { click: "text=Add line" },
      ...pick(2, "3000"),
      focus("[role=dialog] input[inputmode=decimal]", 0),
      { type: "24500.00", wait: 100, settle: false },
      focus("[role=dialog] input[inputmode=decimal]", 3),
      { type: "4500.00", wait: 100, settle: false },
      focus("[role=dialog] input[inputmode=decimal]", 5),
      { type: "20000.00", wait: 100, settle: false },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------ multi-currency */
  {
    name: "currencies",
    path: "/tax/currencies",
    marks: [
      { target: "text=Organization Base Currency", closest: 1, label: "Your base currency: every report adds up in it" },
      { target: "text=Unrealised FX Gains", closest: 2, label: "What open foreign invoices and bills have gained or lost" },
      { target: "div.divide-y.rounded-lg.border.bg-card", label: "Your rates, by date: Manual or Auto" },
      { target: "text=Add Rate", label: "Enter a rate yourself" },
    ],
  },
  {
    name: "currencies-rate",
    path: "/tax/currencies",
    viewport: { height: 520 },
    actions: [
      { click: "text=Add Rate" },
      { waitFor: "text=New Exchange Rate" },
      { type: "1.0850", into: "[role=dialog] input[type=number]" },
      blur,
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
];
