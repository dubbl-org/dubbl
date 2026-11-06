// Sales: invoices, quotes, credit notes, payments and the rest of /sales.
const INVOICE = "^/sales/[0-9a-f]{8}-[0-9a-f-]{27}$";

export const shots = [
  {
    name: "invoices",
    path: "/sales",
    marks: [
      { target: "text=Customers owe you", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Totals at a glance; click one to filter the list" },
      { target: "text=Top customers", closest: 2, label: "Who you bill most, by month and by customer" },
      { target: "input[placeholder^='Search invoices']", closest: 3, label: "Status tabs, search, filters, grouping and columns" },
      { target: "text=New Invoice", label: "Start a new invoice" },
    ],
  },
  {
    name: "invoice-new",
    path: "/sales",
    actions: [
      { click: "text=New Invoice" },
      { waitFor: "text=Line Items" },
      { click: "text=Select contact..." },
      { type: "Acme" },
      { press: "Enter" },
      { type: "Brand refresh", into: "input[placeholder='Item description']" },
      { type: "4500", into: "[role=dialog] input[placeholder='0.00']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "invoice-draft",
    path: "/sales",
    follow: INVOICE,
    followText: "Draft",
    viewport: { height: 1100 },
    marks: [
      { target: "text=Send", label: "Send it by email, or mark it as sent" },
      { target: "text=Submit for approval", label: "Or route it to someone for approval first" },
      { target: "text=Download PDF", label: "The PDF your customer gets" },
      { target: "text=Payment status", closest: 2, label: "What's been paid and what's still owed" },
    ],
  },
  {
    name: "invoice-payment",
    path: "/sales",
    follow: INVOICE,
    followText: "Overdue",
    actions: [{ click: "text=Record payment" }, { waitFor: "text=Method" }],
    clip: "[role=dialog]",
    padding: 0,
  },
];

// Quotes, credit notes, payments, cash sales, prepayments, recurring invoices,
// revenue schedules, reminders, and the contacts area. Forms are filled for the
// picture but never saved.
const UUID = "[0-9a-f]{8}-[0-9a-f-]{27}";
const pickCustomer = (name) => [{ click: "text=Select contact..." }, { type: name }, { press: "Enter" }];
const firstLine = (description, price) => [
  { type: description, into: "input[placeholder='Item description']" },
  { type: price, into: "[role=dialog] input[placeholder='0.00']" },
  { eval: "document.activeElement?.blur()" },
];

shots.push(
  // Quotes
  {
    name: "quotes",
    path: "/sales/quotes",
    marks: [
      { target: "text=Ready to invoice", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Accepted quotes you haven't billed yet" },
      { target: "text=Win rate", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "How many answered quotes you won" },
      { target: "input[placeholder^='Search quotes']", closest: 2, label: "Status tabs, search and filters" },
      { target: "text=New Quote", label: "Start a new quote" },
    ],
  },
  {
    name: "quotes-new",
    path: "/sales/quotes",
    actions: [
      { click: "text=New Quote" },
      { waitFor: "text=Line Items" },
      ...pickCustomer("Pinnacle"),
      { type: "Website redesign, phase 1", into: "input[placeholder='Item description']" },
      { type: "12000", into: "[role=dialog] input[placeholder='0.00']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "quotes-preview",
    viewport: { width: 1440, height: 780 },
    path: "/sales/quotes",
    actions: [{ click: "text=Pinnacle Group", within: "table" }, { waitFor: "text=Customer accepted" }, { eval: "document.activeElement?.blur()" }],
    clip: "[role=dialog]",
    marks: [
      { target: "text=Customer accepted", label: "They said yes: mark it accepted" },
      { target: "text=Declined", within: "[role=dialog]", label: "They said no" },
    ],
  },
  {
    name: "quotes-accepted",
    path: "/sales/quotes",
    follow: `^/sales/quotes/${UUID}$`,
    followText: "Accepted",
    marks: [{ target: "text=Create an invoice from this quote", label: "Turn the accepted quote into an invoice" }],
  },

  // Credit notes
  {
    name: "credit-notes",
    path: "/sales/credit-notes",
    marks: [
      { target: "text=Credit left to use", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Credit customers can still use" },
      { target: "text=Left to use", within: "table", closest: 1, label: "What's left on each credit note" },
      { target: "text=New Credit Note", label: "Issue a new credit note" },
    ],
  },
  {
    name: "credit-notes-new",
    path: "/sales/credit-notes",
    actions: [
      { click: "text=New Credit Note" },
      { waitFor: "text=Line Items" },
      ...pickCustomer("Acme"),
      { type: "INV-00004", into: "input[placeholder='Original invoice, etc.']" },
      ...firstLine("Refund for 2 hours not delivered", "300"),
      { type: "Two hours of the March workshop were cancelled.", into: "textarea[placeholder='Reason for credit...']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "credit-notes-sent",
    path: "/sales/credit-notes",
    follow: `^/sales/credit-notes/${UUID}$`,
    followText: "Sent",
    marks: [
      { target: "text=Use against an invoice", label: "Use the credit to reduce an invoice" },
      { target: "text=Remaining", closest: 1, label: "Credit still left on this note" },
      { target: "text=Cancel credit note", label: "Cancel it so it can't be used" },
    ],
  },
  {
    name: "credit-notes-apply",
    path: "/sales/credit-notes",
    follow: `^/sales/credit-notes/${UUID}$`,
    followText: "Sent",
    actions: [{ click: "text=Use against an invoice" }, { waitFor: "text=Reduce the invoice" }],
    clip: "[role=dialog]",
    padding: 0,
  },

  // Payments received
  {
    name: "payments-received",
    path: "/sales/payments",
    marks: [
      { target: "text=Not matched yet", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Money not yet put toward an invoice" },
      { target: "text=Matched", within: "table", closest: 1, label: "Whether each payment is fully matched" },
      { target: "text=Leftover", within: "table", closest: 1, label: "Anything not put toward an invoice" },
    ],
  },
  {
    name: "payments-received-detail",
    path: "/sales/payments",
    follow: `^/sales/payments/${UUID}$`,
    marks: [{ target: "text=Invoices this payment covers", closest: 2, label: "The invoices this payment settled" }],
  },

  // Cash sales
  { name: "cash-sales", path: "/sales/receipts" },
  {
    name: "cash-sales-new",
    path: "/sales/receipts",
    actions: [
      { click: "text=New cash sale" },
      { waitFor: "text=What was sold" },
      ...pickCustomer("Riverdale"),
      ...firstLine("Workshop ticket", "45"),
    ],
    clip: "[role=dialog]",
  },

  // Prepayments
  { name: "customer-prepayments", path: "/sales/customer-prepayments" },
  {
    name: "customer-prepayments-new",
    path: "/sales/customer-prepayments",
    actions: [
      { click: "text=New prepayment" },
      { waitFor: "text=Prepayment Details" },
      ...pickCustomer("Pinnacle"),
      { type: "250", into: "#drawer-credit-amount" },
      { type: "Deposit for the Q4 brand project", into: "textarea[placeholder='Notes about this prepayment...']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },

  // Recurring invoices
  {
    name: "recurring-invoices",
    path: "/sales/recurring",
    marks: [
      { target: "text=Coming up next", closest: 1, label: "The next invoices each template will create" },
      { target: "text=Going out this week", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Invoices due to be created in the next 7 days" },
      { target: "text=Invoices made", within: "table", closest: 1, label: "How many each template has made so far" },
      { target: "text=New Recurring", label: "Set up a new schedule" },
    ],
  },
  {
    name: "recurring-invoices-new",
    path: "/sales/recurring",
    actions: [
      { click: "text=New Recurring" },
      { waitFor: "text=Template Details" },
      { type: "Monthly retainer", into: "input[placeholder='e.g. Monthly Retainer']" },
      ...pickCustomer("Metro"),
      ...firstLine("Monthly retainer", "3000"),
    ],
    clip: "[role=dialog]",
  },
  {
    name: "recurring-invoices-preview",
    viewport: { width: 1440, height: 780 },
    path: "/sales/recurring",
    actions: [{ click: "text=Monthly Retainer - Metro Services", within: "table" }, { waitFor: "text=Next invoices" }],
    clip: "[role=dialog]",
  },

  // Revenue schedules
  {
    name: "revenue-schedules",
    path: "/sales/revenue-schedules",
    marks: [
      { target: "text=Left to count", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Paid for, not yet earned" },
      { target: "text=Ready to count", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Periods that have passed and can be counted now" },
      { target: "text=Progress", within: "table", closest: 1, label: "How much of each schedule is counted" },
    ],
  },
  {
    name: "revenue-schedules-preview",
    viewport: { width: 1440, height: 780 },
    path: "/sales/revenue-schedules",
    actions: [{ click: "text=Riverdale Co", within: "table" }, { waitFor: "text=Periods" }, { eval: "document.activeElement?.blur()" }],
    clip: "[role=dialog]",
  },
  {
    name: "revenue-schedules-new",
    viewport: { width: 1440, height: 640 },
    path: "/sales/revenue-schedules",
    actions: [
      { click: "text=New revenue schedule" },
      { waitFor: "text=Schedule Details" },
      { type: "600", into: "#drawer-revsched-amount" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },

  // Payment reminders
  {
    name: "payment-reminders",
    path: "/settings/reminders",
    marks: [
      { target: "text=Invoice Due in 7 Days", closest: 1, label: "A rule: when it fires and what it's for" },
      { target: "main [role=switch]", label: "Turn a rule on or off" },
      { target: "text=Reminder Log", closest: 2, label: "Every reminder sent, failed or skipped" },
      { target: "text=New Rule", label: "Add a rule" },
    ],
  },
  {
    name: "payment-reminders-rule",
    path: "/settings/reminders",
    actions: [
      { click: "text=New Rule" },
      { waitFor: "text=Subject Template" },
      { type: "3 days before due", into: "input[placeholder='e.g. 7 days before due']" },
      { type: "Reminder: {{documentNumber}} is due on {{dueDate}}", into: "input[placeholder='Payment reminder for {{documentNumber}}']" },
      { type: "Hi {{contactName}}, a quick reminder that {{documentNumber}} for {{amountDue}} is due on {{dueDate}}. Thank you, {{organizationName}}", into: "textarea[placeholder='Dear {{contactName}}, this is a reminder...']" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },

  // Contacts
  {
    name: "contacts",
    path: "/contacts",
    marks: [
      { target: "text=Customers owe you", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "What customers owe and what you owe suppliers" },
      { target: "text=All", closest: 1, label: "Filter by customers, suppliers or both" },
      { target: "text=Owes you", within: "table", closest: 1, label: "Each contact's open balance" },
      { target: "text=New Contact", label: "Add a contact" },
    ],
  },
  {
    name: "contacts-new",
    path: "/contacts",
    actions: [
      { click: "text=New Contact" },
      { waitFor: "text=Basic Info" },
      { type: "Northwind Studio", into: "#drawer-contact-name" },
      { type: "accounts@northwind.studio", into: "#drawer-contact-email" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },
  {
    name: "contacts-detail",
    path: "/contacts",
    follow: `^/contacts/${UUID}$`,
    followText: "Sterling",
    marks: [
      { target: "text=Bookkeeping", closest: "nav", label: "Activity, statement, bookkeeping, people and files" },
      { target: "text=Payment terms (days)", closest: 1, label: "Payment terms, currency and credit limit" },
      { target: "text=Merge duplicates", label: "Fold a duplicate into this contact" },
    ],
  },
  {
    name: "contacts-preview",
    path: "/contacts",
    actions: [
      { scroll: "text=Sterling Enterprises", block: "center" },
      { click: "text=Sterling Enterprises", within: "table" },
      { waitFor: "text=Invite to portal" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
  },

  // Statements
  {
    name: "statements",
    path: "/contacts/statements",
    marks: [
      { target: "text=Suppliers", closest: 1, label: "Customer or supplier statements" },
      { target: "text=Last 12 months", label: "The period each statement covers" },
      { target: "text=Over 90 days", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Who owes you, and how late" },
    ],
  },
  {
    name: "statements-preview",
    viewport: { width: 1440, height: 780 },
    path: "/contacts/statements",
    actions: [{ click: "text=TechStart Inc", within: "table" }, { waitFor: "text=Full statement" }],
    clip: "[role=dialog]",
  },
  {
    name: "statements-contact",
    path: "/contacts/statements",
    follow: `^/contacts/${UUID}/statement$`,
    followText: "Acme",
    marks: [
      { target: "main .grid.sm\\:grid-cols-4", label: "What they owed at the start, then charges, payments and the end balance" },
      { target: "text=PDF", label: "Download the statement as a PDF" },
      { target: "text=Email", label: "Email it to the customer" },
    ],
  },

  // Customer portal
  {
    name: "customer-portal",
    path: "/contacts/portal",
    marks: [
      { target: "text=Opened", within: "main .grid.rounded-xl", closest: ".min-w-0.bg-card", label: "Who has opened their link" },
      { target: "text=Works until", closest: 1, label: "When each link stops working" },
      { target: "text=Recent portal activity", closest: 3, label: "What customers looked at and did" },
      { target: "text=Invite a customer", label: "Send a customer their link" },
    ],
  },
  {
    name: "customer-portal-invite",
    path: "/contacts/portal",
    actions: [
      { click: "text=Invite a customer" },
      { waitFor: "text=Link works for" },
      { click: "text=Pick a customer…" },
      { type: "TechStart" },
      { press: "Enter" },
      { type: "Hi! You can now see all your invoices and your statement here.", into: "textarea" },
      { eval: "document.activeElement?.blur()" },
    ],
    clip: "[role=dialog]",
    padding: 0,
  },

  // Duplicates
  { name: "duplicate-contacts", path: "/contacts/duplicates" },
  {
    name: "duplicate-contacts-merge",
    path: "/contacts",
    follow: `^/contacts/${UUID}$`,
    followText: "Acme",
    actions: [{ click: "text=Merge duplicates" }, { waitFor: "text=Merge a duplicate into this contact" }, { wait: 800 }],
    clip: "[role=dialog]",
    padding: 0,
  },
);
