// Purchases (bills, expenses, ordering, supplier credits, paying bills) and Banking
// (bank accounts, imports, categorizing, reconciliation). Format: scripts/docs-shots.config.mjs.
const UUID = "[0-9a-f]{8}-[0-9a-f-]{27}";
const BILL = `^/purchases/${UUID}$`;

// Bank accounts open with router.push (no links), so click through to one.
const openChecking = [{ click: "text=Business Checking" }, { waitFor: "text=Match statement to your books" }];
// The bank account's own tabs (Overview, Transactions, Imports, Settings).
const tab = (label) => ({
  eval: `[...document.querySelectorAll("nav button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click()`,
});
// Click a button inside the transaction row that mentions `desc`.
const rowButton = (desc, label) => ({
  eval: `(() => {
    const row = [...document.querySelectorAll("div.group")].find((d) => d.innerText.includes(${JSON.stringify(desc)}));
    [...(row?.querySelectorAll("button") ?? [])].find((b) => b.innerText.trim().startsWith(${JSON.stringify(label)}))?.click();
  })()`,
});
// List pages (Explorer) open a record on double-click, not through a link. Open the
// first row that mentions `text`, then wait for `ready` on the record's page.
const openRow = (text, ready) => [
  {
    eval: `[...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes(${JSON.stringify(text)}))?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`,
  },
  { waitFor: ready, timeout: 30000 },
];
// Tag the smallest element whose text ends with `text`, so a real click can hit it.
const tagText = (text, tag) => ({
  eval: `(() => {
    const els = [...document.querySelectorAll("body *")].filter((e) => e.innerText?.trim().endsWith(${JSON.stringify(text)}));
    els.sort((a, b) => a.innerText.length - b.innerText.length);
    els[0]?.setAttribute("data-shot", ${JSON.stringify(tag)});
  })()`,
});
// Tag a row's "More actions" trigger so a real click can open its menu.
const tagRowMenu = (desc) => ({
  eval: `(() => {
    const row = [...document.querySelectorAll("div.group")].find((d) => d.innerText.includes(${JSON.stringify(desc)}));
    row?.querySelector("button[title='More actions']")?.setAttribute("data-shot", "row-menu");
  })()`,
});

const CSV = [
  "Date,Description,Amount,Reference",
  "2026-10-01,Stripe payout,4250.00,PO-1001",
  "2026-10-02,AWS EMEA,-480.00,INV-88213",
  "2026-10-03,Office rent October,-3500.00,RENT-10",
  "2026-10-05,Figma Pro,-45.00,FIG-2210",
  "2026-10-06,Acme Corp payment,4950.00,INV-00011",
].join("\n");

export const shots = [
  /* ------------------------------------------------------------ bills */
  {
    name: "bills",
    path: "/purchases",
    marks: [
      { target: "text=You owe suppliers", closest: 3, label: "What you owe, what's overdue and what falls due soon" },
      { target: "text=Top suppliers", closest: 2, label: "Who bills you most, by month and by supplier" },
      { target: "input[placeholder^='Search bills']", closest: 3, label: "Status tabs, search, filters, grouping and columns" },
      { target: "text=New Bill", label: "Record a new bill" },
    ],
  },
  {
    name: "bills-new",
    path: "/purchases",
    actions: [
      { click: "text=New Bill" },
      { waitFor: "text=Line Items" },
      { click: "text=Select contact..." },
      { type: "AWS" },
      { press: "Enter" },
      { type: "INV-88213", into: "input[placeholder='The number on their invoice']" },
      { type: "Cloud hosting, October", into: "input[placeholder='Item description']" },
      { type: "480", into: "[role=dialog] input[placeholder='0.00']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "bills-draft",
    path: "/purchases",
    follow: BILL,
    followText: "Draft",
    marks: [
      { target: "text=Edit", label: "Change anything while it's a draft" },
      { target: "text=Add to my books", label: "Post it to your books so it counts toward what you owe" },
      { target: "text=Cancel bill", label: "Cancel a bill that shouldn't exist" },
      { target: "text=Payment Status", closest: 2, label: "What's been paid and what's still owed" },
      { target: "text=Supplier documents", closest: 1, label: "Keep the supplier's PDF and receipts with the bill" },
    ],
  },
  {
    name: "bills-edit",
    path: "/purchases",
    follow: BILL,
    followText: "Draft",
    actions: [{ click: "text=Edit" }, { waitFor: "text=Save changes" }],
    clip: "[role=dialog]",
  },
  {
    name: "bills-open",
    path: "/purchases",
    follow: BILL,
    followText: "Overdue",
    marks: [
      { target: "text=Record Payment", label: "Record money you paid against it" },
      { target: "text=Record a supplier credit", label: "The supplier owes you money back" },
      { target: "text=Supplier statement", label: "Everything with this supplier on one statement" },
    ],
  },
  {
    name: "bills-payment",
    path: "/purchases",
    follow: BILL,
    followText: "Overdue",
    actions: [{ click: "text=Record Payment" }, { waitFor: "[role=dialog]" }, { type: "200", into: "[role=dialog] input[placeholder]" }],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "bills-matching",
    path: "/settings/procurement",
    actions: [{ waitFor: "text=Allowed price difference" }],
    clip: "text=Allowed price difference",
    clipClosest: 4,
  },

  /* --------------------------------------------------------- expenses */
  {
    name: "expenses",
    path: "/purchases/expenses",
    marks: [
      { target: "text=Awaiting approval", closest: 1, label: "Claims to review, to pay back and already paid" },
      { target: "text=Top people", closest: 2, label: "Who claims what, by month and by person" },
      { target: "text=SaaS Summit conference", closest: "tr", label: "Each claim with its person, status and amount" },
      { target: "text=New Expense", label: "Start a new expense claim" },
    ],
  },
  {
    name: "expenses-new",
    path: "/purchases/expenses",
    actions: [
      { click: "text=New Expense" },
      { waitFor: "text=Expense Items" },
      { type: "Client visit, Boston", into: "input[placeholder='e.g. Business trip to NYC']" },
      { type: "Train tickets", into: "input[placeholder='What was this for?']" },
      { type: "186.40", into: "[role=dialog] input[placeholder='0.00']" },
      { type: "Travel", into: "input[placeholder='e.g. Travel']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "expenses-claim",
    path: "/purchases/expenses",
    follow: `^/purchases/expenses/${UUID}$`,
    followText: "Awaiting",
    marks: [
      { target: "text=Approve", label: "Approve it: the costs go into your books" },
      { target: "text=Reject", label: "Or send it back with a reason" },
      { target: "text=Recall to edit", label: "Pull it back to a draft to change it" },
      { target: "text=DATE", closest: 2, label: "Each item with its category, account, receipt and tax" },
    ],
  },

  /* -------------------------------------------------- purchase orders */
  {
    name: "purchase-orders",
    path: "/purchases/orders",
    marks: [
      { target: "text=Open commitments", closest: 3, label: "Money you've agreed to spend, and what's late" },
      { target: "input[placeholder^='Search purchase orders']", closest: 3, label: "Status tabs, search and filters" },
      { target: "text=PO-00003", closest: "tr", label: "Each order with its expected date and status" },
      { target: "text=New PO", label: "Raise a new purchase order" },
    ],
  },
  {
    name: "purchase-orders-new",
    path: "/purchases/orders",
    actions: [
      { click: "text=New PO" },
      { waitFor: "text=Order Details" },
      { click: "text=Select contact..." },
      { type: "Office Depot" },
      { press: "Enter" },
      { type: "Ergonomic chairs", into: "input[placeholder='Item description']" },
      { click: "[role=dialog] input[type=number]" },
      { eval: "document.querySelector('[role=dialog] input[type=number]')?.select()" },
      { type: "6" },
      { type: "325", into: "[role=dialog] input[placeholder='0.00']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "purchase-orders-detail",
    path: "/purchases/orders",
    actions: openRow("Ordered", "text=Mark items as received"),
    marks: [
      { target: "text=Mark items as received", label: "Record that the goods arrived" },
      { target: "text=Create a bill from this order", label: "Turn the order into a bill when the invoice comes" },
      { target: "text=DESCRIPTION", closest: 2, label: "What you ordered, at the agreed price" },
    ],
  },
  {
    name: "purchase-orders-receive",
    path: "/purchases/orders",
    actions: [
      ...openRow("Ordered", "text=Mark items as received"),
      { click: "text=Mark items as received" },
      { waitFor: "text=Received now" },
      // A part delivery: only some of the first item came.
      { eval: "(() => { const i = document.querySelector('[role=dialog] input[type=number]'); const v = Math.max(1, Math.floor(Number(i.value) / 2)); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, String(v)); i.dispatchEvent(new Event('input', { bubbles: true })); })()" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "purchase-orders-received",
    path: "/purchases/goods-receipts",
  },

  /* ----------------------------------------------------- requisitions */
  {
    name: "requisitions",
    path: "/purchases/requisitions",
    marks: [
      { target: "text=Approved, not ordered", closest: 1, label: "What's waiting, approved, needed soon and ordered" },
      { target: "text=Ergonomic chair", closest: "tr", label: "Each request with its supplier, dates and status" },
      { target: "text=New requisition", within: "main", label: "Ask to buy something" },
    ],
  },
  {
    name: "requisitions-new",
    path: "/purchases/requisitions",
    actions: [
      { click: "text=New Requisition" },
      { waitFor: "text=Create Requisition" },
      { click: "text=Optional, needed before ordering" },
      { type: "Tech Hardware" },
      { press: "Enter" },
      { type: "Laptops for new hires", into: "input[placeholder='Description']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    // Needs a draft requisition in the demo company (the seed has none)
    name: "requisitions-detail",
    path: "/purchases/requisitions",
    follow: `^/purchases/requisitions/${UUID}$`,
    followText: "Draft",
    marks: [
      { target: "text=Edit", label: "Change it while it's a draft or after a rejection" },
      { target: "text=Submit", label: "Send it for approval" },
    ],
  },
  {
    name: "requisitions-edit",
    path: "/purchases/requisitions",
    follow: `^/purchases/requisitions/${UUID}$`,
    followText: "Draft",
    actions: [{ click: "text=Edit" }, { waitFor: "text=Save Changes" }],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------- supplier credits */
  {
    name: "supplier-credits",
    path: "/purchases/debit-notes",
    marks: [
      { target: "text=Credit to use", closest: 3, label: "Credit you can still take off a bill" },
      { target: "text=DN-00001", closest: "tr", label: "Each credit with what's used and what's left" },
      { target: "text=New supplier credit", label: "Record a new credit" },
    ],
  },
  {
    name: "supplier-credits-detail",
    path: "/purchases/debit-notes",
    actions: openRow("Available", "text=Use against a bill"),
    marks: [
      { target: "text=Use against a bill", label: "Take it off a bill you owe this supplier" },
      { target: "text=Remaining", closest: 1, label: "How much of the credit is left" },
      { target: "text=Cancel supplier credit", label: "Cancel it if it shouldn't exist" },
    ],
  },
  {
    name: "supplier-credits-apply",
    path: "/purchases/debit-notes",
    actions: [...openRow("Available", "text=Use against a bill"), { click: "text=Use against a bill" }, { waitFor: "text=Reduce the bill" }],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "supplier-credits-from-bill",
    path: "/purchases",
    follow: BILL,
    followText: "Overdue",
    actions: [{ click: "text=Record a supplier credit" }, { waitFor: "text=Create supplier credit" }],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ------------------------------------------------------ paying bills */
  {
    name: "paying-bills-batch",
    path: "/accounting/banking/batches",
    actions: [
      { click: "text=Create Batch" },
      { waitFor: "text=Select Bills" },
      { type: "Month-end supplier run", into: "input[placeholder='e.g., March Supplier Payments']" },
      tagText("- City Power & Water", "batch-bill"),
      { click: "[data-shot=batch-bill]" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },
  {
    name: "paying-bills-scheduled",
    path: "/accounting/banking/scheduled",
    marks: [
      { target: "text=Process Due", label: "Pay everything that has come due" },
      { target: "text=Schedule Payment", label: "Set a bill payment for a future date" },
      { target: "text=Marketing Agency", closest: 4, label: "Each payment with its bill, date and status" },
    ],
  },
  {
    name: "paying-bills-schedule",
    path: "/accounting/banking/scheduled",
    actions: [{ click: "text=Schedule Payment" }, { waitFor: "text=Scheduled Date" }],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* --------------------------------------------------- recurring bills */
  {
    name: "recurring-bills",
    path: "/purchases/bills/recurring",
    marks: [
      { target: "text=Monthly AWS", closest: "tr", label: "Each schedule, its supplier and the next bill date" },
      { target: "text=Next Bill", label: "When the next draft bill will be created" },
      { target: "button[title=Pause]", closest: 1, label: "Edit, pause or delete a schedule" },
      { target: "text=New Recurring Bill", label: "Set up a new recurring bill" },
    ],
  },
  {
    name: "recurring-bills-new",
    path: "/purchases/bills/recurring",
    actions: [
      { click: "text=New Recurring Bill" },
      { waitFor: "text=Create Recurring Bill" },
      { type: "Office internet", into: "input[placeholder='e.g. Monthly Software Subscription']" },
      { type: "Fiber 1 Gbps", into: "[role=dialog] input[placeholder='Item description']" },
      { type: "89", into: "[role=dialog] input[placeholder='0.00']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  /* ----------------------------------------------------- bank accounts */
  {
    name: "bank-accounts",
    path: "/accounting/banking",
    marks: [
      { target: "text=Total Balance", closest: 2, label: "Your total balance across every account" },
      { target: "text=Business Checking", closest: "button", label: "Each account with its bank, last digits and balance" },
      { target: "text=Move money", label: "Record money moving between your accounts" },
      { target: "text=New Account", within: "main", label: "Add a bank, card or cash account" },
    ],
  },
  {
    name: "bank-accounts-new",
    path: "/accounting/banking",
    actions: [
      { click: "text=New Account" },
      { waitFor: "text=Books connection (optional)" },
      { type: "Operating account", into: "input[placeholder='Global Operating Account']" },
      { type: "First National Bank", into: "input[placeholder='Revolut Business']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "bank-accounts-overview",
    path: "/accounting/banking",
    actions: openChecking,
    marks: [
      { target: "text=Balance", closest: 2, label: "Balance, money in and out, and how much is done" },
      { target: "text=Match statement to your books", label: "Check your books against a bank statement" },
      { target: "text=Import", label: "Bring in a statement" },
      { target: "text=Recent Transactions", closest: 2, label: "The latest lines, ready to categorize" },
    ],
  },
  {
    name: "bank-accounts-settings",
    path: "/accounting/banking",
    actions: [...openChecking, tab("Settings"), { waitFor: "text=Danger zone" }],
  },
  {
    name: "bank-accounts-transfer",
    path: "/accounting/banking",
    actions: [{ click: "text=Move money" }, { waitFor: "text=Move money between accounts" }],
    clip: "[role=dialog]",
  },

  /* ------------------------------------------- importing transactions */
  {
    name: "importing-transactions-sheet",
    path: "/accounting/banking",
    actions: [
      ...openChecking,
      { eval: "[...document.querySelectorAll('main button')].find((b) => b.innerText.trim() === 'Import')?.click()" },
      { waitFor: "text=Or Paste Content" },
      { type: CSV, into: "textarea[placeholder^='Paste CSV']" },
      { click: "text=Preview", within: "[role=dialog]" },
      { waitFor: "text=Duplicates" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    viewport: { height: 1360 },
    marks: [
      { target: "text=Drop your statement here", closest: 2, label: "Drop the file from your bank" },
      { target: "textarea[placeholder^='Paste CSV']", label: "Or paste the lines" },
      { target: "[role=dialog] button[role=combobox]", label: "Leave on Auto Detect, or pick the format" },
      { target: "text=Duplicates", closest: 3, label: "Check rows, duplicates and the lines before importing" },
    ],
  },
  {
    name: "importing-transactions-history",
    path: "/accounting/banking",
    actions: [...openChecking, tab("Imports"), { waitFor: "text=Import Statement" }],
  },

  /* ----------------------------------------- categorizing transactions */
  {
    name: "categorizing-transactions",
    path: "/accounting/banking",
    actions: [...openChecking, tab("Transactions"), { waitFor: "text=Assign in bulk" }],
    marks: [
      { target: "text=To do", within: "[role=tablist]", closest: 1, label: "To do, done and ignored lines" },
      { target: "text=Assign in bulk", label: "Assign many lines at once in a grid" },
      { target: "text=Apply rules", label: "Run your bank rules on the lines still to do" },
      { target: "text=Categorize", label: "Say what a line was for" },
      { target: "text=to do", closest: 0, label: "Where each line stands" },
    ],
  },
  {
    name: "categorizing-transactions-sheet",
    path: "/accounting/banking",
    actions: [
      ...openChecking,
      rowButton("MONTHLY SERVICE FEE", "Categorize"),
      { waitFor: "text=What was this?" },
      { click: "text=A business cost" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "categorizing-transactions-menu",
    path: "/accounting/banking",
    actions: [...openChecking, tagRowMenu("JANE DOE DESIGN"), { click: "[data-shot=row-menu]" }, { waitFor: "text=Find a match…" }],
    clip: "[role=menu]",
    padding: 120,
  },
  {
    name: "categorizing-transactions-match",
    path: "/accounting/banking",
    actions: [...openChecking, tagRowMenu("JANE DOE DESIGN"), { click: "[data-shot=row-menu]" }, { click: "text=Find a match…" }, { waitFor: "text=Open Bills" }],
    clip: "[role=dialog]",
  },
  {
    name: "categorizing-transactions-split",
    path: "/accounting/banking",
    actions: [...openChecking, tagRowMenu("CONSULTCO LLC"), { click: "[data-shot=row-menu]" }, { click: "text=Split across categories" }, { waitFor: "text=Save split" }],
    clip: "[role=dialog]",
  },
  {
    name: "categorizing-transactions-bulk",
    path: "/accounting/banking",
    actions: [...openChecking, tab("Transactions"), { waitFor: "text=Assign in bulk" }, { click: "text=Assign in bulk" }, { waitFor: "text=Fill down" }],
  },
  {
    name: "categorizing-transactions-rules",
    path: "/settings/bank-rules",
    actions: [{ click: "text=Add Rule" }, { waitFor: "text=When a transaction matches" }, { type: "Stripe payouts", into: "input[placeholder='e.g. Stripe Payouts']" }],
    clip: "[role=dialog]",
  },
  {
    // Needs a payee categorized to the same account at least twice that no rule covers yet.
    name: "categorizing-transactions-suggestions",
    path: "/settings/bank-rules",
    actions: [{ click: "text=Get Suggestions" }, { waitFor: "text=Suggested rules" }],
    marks: [
      { target: "text=Get Suggestions", label: "Look for payees you keep categorizing the same way" },
      { target: "text=Create rule", label: "Turn a suggestion into a rule" },
    ],
  },

  /* ---------------------------------------------------- reconciliation */
  {
    name: "reconciliation",
    path: "/accounting/banking",
    actions: [...openChecking, { click: "text=Match statement to your books" }, { waitFor: "text=Still to match", timeout: 30000 }],
    marks: [
      { target: "text=Still to match", closest: 3, label: "Account balance, lines still to match, and your selection" },
      { target: "text=Finish statement check", label: "Close the check when everything is ticked off" },
      { target: "text=Bank statement balance", closest: 3, label: "Statement against your books, and the difference" },
      { target: "text=Not yet matched", closest: 2, label: "Lines in your books not yet on a statement" },
    ],
  },
  {
    name: "reconciliation-lines",
    path: "/accounting/banking",
    actions: [
      ...openChecking,
      { click: "text=Match statement to your books" },
      { waitFor: "text=Still to match", timeout: 30000 },
      { eval: "document.querySelector(\"input[placeholder='Search transactions...']\")?.scrollIntoView({ block: 'start' })" },
    ],
    viewport: { height: 1100 },
  },
  {
    name: "reconciliation-writeoff",
    path: "/accounting/banking",
    actions: [
      ...openChecking,
      { click: "text=Match statement to your books" },
      { waitFor: "text=Still to match", timeout: 30000 },
      { click: "text=Write off the difference" },
      { waitFor: "text=Adjustment amount" },
    ],
    clip: "[role=dialog]",
  },
];
