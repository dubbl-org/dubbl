import { db } from "./index";
import {
  currency,
  users,
  organization,
  member,
  subscription,
  chartAccount,
  fiscalYear,
  journalEntry,
  journalLine,
  taxRate,
  contact,
  contactPerson,
  invoice,
  invoiceLine,
  creditNote,
  creditNoteLine,
  quote,
  quoteLine,
  bill,
  billLine,
  purchaseOrder,
  purchaseOrderLine,
  debitNote,
  debitNoteLine,
  bankAccount,
  bankTransaction,
  bankRule,
  bankReconciliation,
  budget,
  budgetLine,
  budgetPeriod,
  project,
  projectTask,
  projectLabel,
  projectMilestone,
  projectNote,
  taskChecklist,
  taskComment,
  timeEntry,
  fixedAsset,
  depreciationEntry,
  payrollEmployee,
  payrollSettings,
  payrollRun,
  payrollItem,
  inventoryItem,
  inventoryCategory,
  warehouse,
  warehouseStock,
  inventoryMovement,
  inventoryItemSupplier,
  inventoryVariant,
  inventoryTransfer,
  inventoryTransferLine,
  expenseClaim,
  expenseItem,
  payment,
  paymentAllocation,
  recurringTemplate,
  recurringTemplateLine,
  costCenter,
  tag,
  entityTag,
  periodLock,
  exchangeRate,
  numberSequence,
  customRole,
  team,
  teamMember,
  pipeline,
  deal,
  dealActivity,
  loan,
  loanSchedule,
  reminderRule,
  notification,
  documentTemplate,
  documentFolder,
  savedReport,
  type ReportConfig,
  type WorkflowCondition,
  type WorkflowAction,
  scheduledPayment,
  workflow,
  revenueSchedule,
  revenueEntry,
} from "./schema";
import { eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { DEFAULT_ACCOUNTS } from "./default-accounts";

const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2 },
  { code: "EUR", name: "Euro", symbol: "\u20ac", decimalPlaces: 2 },
  { code: "GBP", name: "British Pound", symbol: "\u00a3", decimalPlaces: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00a5", decimalPlaces: 0 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimalPlaces: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimalPlaces: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimalPlaces: 2 },
  { code: "CNY", name: "Chinese Yuan", symbol: "\u00a5", decimalPlaces: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "\u20b9", decimalPlaces: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimalPlaces: 2 },
  { code: "KRW", name: "South Korean Won", symbol: "\u20a9", decimalPlaces: 0 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimalPlaces: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimalPlaces: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimalPlaces: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimalPlaces: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimalPlaces: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimalPlaces: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimalPlaces: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimalPlaces: 2 },
  { code: "PLN", name: "Polish Zloty", symbol: "z\u0142", decimalPlaces: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "\u20ba", decimalPlaces: 2 },
  { code: "THB", name: "Thai Baht", symbol: "\u0e3f", decimalPlaces: 2 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimalPlaces: 0 },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", decimalPlaces: 0 },
  { code: "CZK", name: "Czech Koruna", symbol: "K\u010d", decimalPlaces: 2 },
  { code: "ILS", name: "Israeli Shekel", symbol: "\u20aa", decimalPlaces: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "\u20b1", decimalPlaces: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "AED", decimalPlaces: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimalPlaces: 2 },
  { code: "TWD", name: "Taiwan Dollar", symbol: "NT$", decimalPlaces: 0 },
];

// Chart of Accounts template (imported from shared module)
const ACCOUNTS = DEFAULT_ACCOUNTS;

// Contacts seed data
const CONTACTS = [
  { name: "Acme Corp", email: "accounts@acme.com", type: "customer" as const, paymentTermsDays: 30 },
  { name: "Global Industries", email: "billing@globalind.com", type: "customer" as const, paymentTermsDays: 14 },
  { name: "TechStart Inc", email: "finance@techstart.io", type: "customer" as const, paymentTermsDays: 30 },
  { name: "Bright Solutions", email: "ap@brightsolutions.com", type: "customer" as const, paymentTermsDays: 7 },
  { name: "Metro Services", email: "pay@metroservices.com", type: "customer" as const, paymentTermsDays: 30 },
  { name: "Pinnacle Group", email: "invoices@pinnacle.com", type: "customer" as const, paymentTermsDays: 45 },
  { name: "Riverdale Co", email: "ar@riverdale.co", type: "customer" as const, paymentTermsDays: 30 },
  { name: "Summit Digital", email: "billing@summitdigital.com", type: "customer" as const, paymentTermsDays: 14 },
  { name: "CloudBase Systems", email: "finance@cloudbase.dev", type: "customer" as const, paymentTermsDays: 30 },
  { name: "Sterling Enterprises", email: "pay@sterling.com", type: "customer" as const, paymentTermsDays: 60 },
  { name: "Office Depot", email: "orders@officedepot.com", type: "supplier" as const, paymentTermsDays: 30 },
  { name: "AWS", email: "billing@aws.amazon.com", type: "supplier" as const, paymentTermsDays: 30 },
  { name: "Landlord Properties", email: "rent@landlordprop.com", type: "supplier" as const, paymentTermsDays: 1 },
  { name: "City Power & Water", email: "billing@citypw.com", type: "supplier" as const, paymentTermsDays: 14 },
  { name: "Insurance Co", email: "premiums@insco.com", type: "supplier" as const, paymentTermsDays: 30 },
  { name: "Tech Hardware Ltd", email: "sales@techhw.com", type: "supplier" as const, paymentTermsDays: 30 },
  { name: "Marketing Agency", email: "invoices@marketing.co", type: "supplier" as const, paymentTermsDays: 14 },
  { name: "Legal Partners LLP", email: "accounts@legalpartners.com", type: "supplier" as const, paymentTermsDays: 30 },
  { name: "Freelancer Jane", email: "jane@freelance.com", type: "both" as const, paymentTermsDays: 14 },
  { name: "ConsultCo", email: "billing@consultco.com", type: "both" as const, paymentTermsDays: 30 },
];

const TAX_RATES = [
  { name: "GST 10%", rate: 1000, type: "both" as const, isDefault: true },
  { name: "GST 5%", rate: 500, type: "both" as const, isDefault: false },
  { name: "Sales Tax 8%", rate: 800, type: "sales" as const, isDefault: false },
  { name: "VAT 20%", rate: 2000, type: "both" as const, isDefault: false },
  { name: "Tax Exempt", rate: 0, type: "both" as const, isDefault: false },
];

async function seed() {
  console.log("Seeding dubbl demo data...\n");

  // 1. Currencies
  console.log("Seeding currencies...");
  for (const c of CURRENCIES) {
    await db.insert(currency).values(c).onConflictDoNothing({ target: currency.code });
  }
  console.log(`  ${CURRENCIES.length} currencies`);

  // 2. Find existing user + org, or create demo user
  console.log("Looking for existing user/organization...");

  // Prefer the dev user's org first, then fall back to any owner membership
  const devUser = await db.query.users.findFirst({
    where: eq(users.email, "dev@dubbl.local"),
    columns: { id: true },
  });

  const existingMember = devUser
    ? (await db.query.member.findFirst({
        where: eq(member.userId, devUser.id),
        with: { user: true, organization: true },
      }))
    : null;

  const resolvedMember = existingMember ??
    (await db.query.member.findFirst({
      where: eq(member.role, "owner"),
      with: { user: true, organization: true },
    }));

  let userId: string;
  let org: { id: string; name: string };

  if (resolvedMember) {
    userId = resolvedMember.userId;
    org = { id: resolvedMember.organizationId, name: resolvedMember.organization.name };
    console.log(`  Using existing user: ${resolvedMember.user.email}`);
    console.log(`  Using existing org: ${org.name}`);
  } else {
    console.log("  No existing user found, creating demo user...");
    const passwordHash = await bcrypt.hash("password123", 12);
    const [demoUser] = await db
      .insert(users)
      .values({
        id: "00000000-0000-0000-0000-000000000001",
        name: "Demo User",
        email: "demo@dubbl.dev",
        passwordHash,
        isSiteAdmin: true,
      })
      .onConflictDoNothing()
      .returning();

    if (!demoUser) {
      console.log("  Demo user already exists but no org found. Aborting.");
      process.exit(1);
    }

    const [newOrg] = await db
      .insert(organization)
      .values({
        id: "00000000-0000-0000-0000-000000000002",
        name: "Demo Company",
        slug: "demo-company",
        defaultCurrency: "USD",
        fiscalYearStartMonth: 1,
      })
      .returning();

    userId = demoUser.id;
    org = { id: newOrg.id, name: newOrg.name };

    await db.insert(member).values({
      organizationId: newOrg.id,
      userId,
      role: "owner",
    });

    await db.insert(subscription).values({
      organizationId: newOrg.id,
      plan: "pro",
      status: "active",
    });
  }

  // 4. Fiscal Year
  console.log("Creating fiscal year...");
  let fy: { id: string };
  const existingFy = await db.query.fiscalYear.findFirst({
    where: eq(fiscalYear.organizationId, org.id),
  });
  if (existingFy) {
    fy = existingFy;
    console.log("  Fiscal year already exists, reusing...");
  } else {
    const [newFy] = await db
      .insert(fiscalYear)
      .values({
        organizationId: org.id,
        name: "FY 2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      })
      .returning();
    fy = newFy;
  }

  // 5. Chart of Accounts
  console.log("Creating chart of accounts...");
  const accountMap = new Map<string, string>(); // code -> id

  // First load any existing accounts for this org
  const existingAccounts = await db.query.chartAccount.findMany({
    where: eq(chartAccount.organizationId, org.id),
  });
  for (const a of existingAccounts) {
    accountMap.set(a.code, a.id);
  }

  let newAccountCount = 0;
  for (const acct of ACCOUNTS) {
    if (accountMap.has(acct.code)) continue; // skip existing
    const [row] = await db
      .insert(chartAccount)
      .values({
        organizationId: org.id,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        subType: acct.subType,
      })
      .returning();
    accountMap.set(acct.code, row.id);
    newAccountCount++;
  }
  console.log(`  ${newAccountCount} new accounts (${accountMap.size} total)`);

  // 6. Tax Rates
  console.log("Creating tax rates...");
  const existingTaxRates = await db.query.taxRate.findMany({
    where: eq(taxRate.organizationId, org.id),
  });
  const taxRateIds: string[] = existingTaxRates.map((t) => t.id);
  const existingTaxNames = new Set(existingTaxRates.map((t) => t.name));
  for (const tr of TAX_RATES) {
    if (existingTaxNames.has(tr.name)) continue;
    const [row] = await db
      .insert(taxRate)
      .values({
        organizationId: org.id,
        name: tr.name,
        rate: tr.rate,
        type: tr.type,
        isDefault: tr.isDefault,
      })
      .returning();
    taxRateIds.push(row.id);
  }
  console.log(`  ${taxRateIds.length} tax rates`);

  // 7. Contacts
  console.log("Creating contacts...");
  const existingContacts = await db.query.contact.findMany({
    where: eq(contact.organizationId, org.id),
  });
  const existingContactEmails = new Set(existingContacts.map((c) => c.email));
  const contactIds: string[] = [];

  for (const c of CONTACTS) {
    const existing = existingContacts.find((ec) => ec.email === c.email);
    if (existing) {
      contactIds.push(existing.id);
      continue;
    }
    const [row] = await db
      .insert(contact)
      .values({
        organizationId: org.id,
        name: c.name,
        email: c.email,
        type: c.type,
        paymentTermsDays: c.paymentTermsDays,
      })
      .returning();
    contactIds.push(row.id);
  }
  console.log(`  ${contactIds.length} contacts`);

  // Check which data already exists to skip those sections
  const existingEntries = await db.query.journalEntry.findFirst({
    where: eq(journalEntry.organizationId, org.id),
  });
  const existingInvoices = await db.query.invoice.findFirst({
    where: eq(invoice.organizationId, org.id),
  });
  const existingCreditNotes = await db.query.creditNote.findFirst({
    where: eq(creditNote.organizationId, org.id),
  });

  const invoiceIds: { id: string; contactIdx: number; status: string; paid: number; total: number }[] = [];

  if (existingEntries) {
    console.log("\nJournal entries already exist, skipping...");
  } else {
  // 8. Journal Entries (manual entries for opening balances)
  console.log("Creating journal entries...");
  let entryNum = 1;

  // Opening balance: Cash + AR + Equity
  const [openingEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: org.id,
      entryNumber: entryNum++,
      date: "2026-01-01",
      description: "Opening balances",
      status: "posted",
      fiscalYearId: fy.id,
      sourceType: "manual",
      createdBy: userId,
      postedAt: new Date(),
    })
    .returning();

  await db.insert(journalLine).values([
    { journalEntryId: openingEntry.id, accountId: accountMap.get("1100")!, debitAmount: 5000000, creditAmount: 0 }, // $50,000 checking
    { journalEntryId: openingEntry.id, accountId: accountMap.get("1110")!, debitAmount: 2500000, creditAmount: 0 }, // $25,000 savings
    { journalEntryId: openingEntry.id, accountId: accountMap.get("1200")!, debitAmount: 1200000, creditAmount: 0 }, // $12,000 AR
    { journalEntryId: openingEntry.id, accountId: accountMap.get("1620")!, debitAmount: 800000, creditAmount: 0 }, // $8,000 computers
    { journalEntryId: openingEntry.id, accountId: accountMap.get("3000")!, debitAmount: 0, creditAmount: 9500000 }, // $95,000 equity
  ]);

  // Monthly revenue/expense entries (Jan-Feb 2026)
  const months = ["2026-01-15", "2026-01-31", "2026-02-15", "2026-02-28"];
  const descriptions = [
    "Service revenue - Acme Corp",
    "Consulting income - Global Industries",
    "Service revenue - TechStart",
    "Software development - Summit Digital",
  ];
  for (let i = 0; i < months.length; i++) {
    const [e] = await db
      .insert(journalEntry)
      .values({
        organizationId: org.id,
        entryNumber: entryNum++,
        date: months[i],
        description: descriptions[i],
        status: "posted",
        fiscalYearId: fy.id,
        sourceType: "manual",
        createdBy: userId,
        postedAt: new Date(),
      })
      .returning();

    const revenue = 250000 + Math.floor(Math.random() * 300000); // $2,500 - $5,500
    await db.insert(journalLine).values([
      { journalEntryId: e.id, accountId: accountMap.get("1200")!, debitAmount: revenue, creditAmount: 0 },
      { journalEntryId: e.id, accountId: accountMap.get("4010")!, debitAmount: 0, creditAmount: revenue },
    ]);
  }

  // Expense entries
  const expenses = [
    { date: "2026-01-05", desc: "Office rent - January", account: "5200", amount: 350000 },
    { date: "2026-01-10", desc: "Internet service", account: "5220", amount: 9900 },
    { date: "2026-01-15", desc: "Office supplies", account: "5300", amount: 15000 },
    { date: "2026-01-20", desc: "AWS hosting", account: "5220", amount: 45000 },
    { date: "2026-01-31", desc: "Payroll - January", account: "5100", amount: 1200000 },
    { date: "2026-02-05", desc: "Office rent - February", account: "5200", amount: 350000 },
    { date: "2026-02-10", desc: "Insurance premium", account: "5400", amount: 25000 },
    { date: "2026-02-15", desc: "Marketing campaign", account: "5600", amount: 75000 },
    { date: "2026-02-20", desc: "Legal consultation", account: "5710", amount: 50000 },
    { date: "2026-02-28", desc: "Payroll - February", account: "5100", amount: 1200000 },
  ];

  for (const exp of expenses) {
    const [e] = await db
      .insert(journalEntry)
      .values({
        organizationId: org.id,
        entryNumber: entryNum++,
        date: exp.date,
        description: exp.desc,
        status: "posted",
        fiscalYearId: fy.id,
        sourceType: "manual",
        createdBy: userId,
        postedAt: new Date(),
      })
      .returning();

    await db.insert(journalLine).values([
      { journalEntryId: e.id, accountId: accountMap.get(exp.account)!, debitAmount: exp.amount, creditAmount: 0 },
      { journalEntryId: e.id, accountId: accountMap.get("1100")!, debitAmount: 0, creditAmount: exp.amount },
    ]);
  }
  console.log(`  ${entryNum - 1} journal entries`);
  } // end journal entries

  // 9. Invoices
  if (existingInvoices) {
    console.log("Invoices already exist, skipping...");
  } else {
  console.log("Creating invoices...");
  const invoiceData = [
    { contact: 0, number: "INV-00001", date: "2026-01-10", due: "2026-02-09", status: "paid" as const, desc: "Web Development", qty: 100, price: 15000, paid: 1500000 },
    { contact: 1, number: "INV-00002", date: "2026-01-15", due: "2026-01-29", status: "paid" as const, desc: "Consulting Services", qty: 100, price: 20000, paid: 2000000 },
    { contact: 2, number: "INV-00003", date: "2026-01-20", due: "2026-02-19", status: "sent" as const, desc: "API Integration", qty: 100, price: 800000, paid: 0 },
    { contact: 3, number: "INV-00004", date: "2026-02-01", due: "2026-02-08", status: "overdue" as const, desc: "Support Contract", qty: 100, price: 500000, paid: 0 },
    { contact: 4, number: "INV-00005", date: "2026-02-05", due: "2026-03-07", status: "sent" as const, desc: "Monthly Retainer", qty: 100, price: 300000, paid: 0 },
    { contact: 5, number: "INV-00006", date: "2026-02-10", due: "2026-03-27", status: "draft" as const, desc: "Data Migration", qty: 100, price: 1200000, paid: 0 },
    { contact: 0, number: "INV-00007", date: "2026-02-15", due: "2026-03-17", status: "sent" as const, desc: "Phase 2 Development", qty: 100, price: 2500000, paid: 0 },
    { contact: 6, number: "INV-00008", date: "2026-02-18", due: "2026-03-20", status: "partial" as const, desc: "Training Sessions", qty: 300, price: 50000, paid: 500000 },
    { contact: 7, number: "INV-00009", date: "2026-02-20", due: "2026-03-06", status: "sent" as const, desc: "UX Design", qty: 100, price: 350000, paid: 0 },
    { contact: 8, number: "INV-00010", date: "2026-02-25", due: "2026-03-27", status: "draft" as const, desc: "Cloud Architecture", qty: 100, price: 450000, paid: 0 },
  ];

  for (const inv of invoiceData) {
    const lineAmount = (inv.qty / 100) * inv.price;
    const [row] = await db
      .insert(invoice)
      .values({
        organizationId: org.id,
        contactId: contactIds[inv.contact],
        invoiceNumber: inv.number,
        issueDate: inv.date,
        dueDate: inv.due,
        status: inv.status,
        subtotal: lineAmount,
        taxTotal: 0,
        total: lineAmount,
        amountPaid: inv.paid,
        amountDue: lineAmount - inv.paid,
        currencyCode: "USD",
      })
      .returning();

    await db.insert(invoiceLine).values({
      invoiceId: row.id,
      description: inv.desc,
      quantity: inv.qty,
      unitPrice: inv.price,
      amount: lineAmount,
      accountId: accountMap.get("4010")!,
      sortOrder: 0,
    });
    invoiceIds.push({ id: row.id, contactIdx: inv.contact, status: inv.status, paid: inv.paid, total: lineAmount });
  }
  console.log(`  ${invoiceData.length} invoices`);
  } // end invoices block

  // 9b. Credit Notes (always check, even on re-run)
  if (existingCreditNotes) {
    console.log("Credit notes already exist, skipping...");
  } else {
  console.log("Creating credit notes...");
  const creditNoteData = [
    {
      contact: 0,
      number: "CN-00001",
      date: "2026-01-25",
      status: "applied" as const,
      invoiceIdx: 0,
      description: "Overcharge correction on web development",
      qty: 100,
      price: 20000,
      subtotal: 20000,
      total: 20000,
      amountApplied: 20000,
      amountRemaining: 0,
    },
    {
      contact: 1,
      number: "CN-00002",
      date: "2026-02-05",
      status: "sent" as const,
      invoiceIdx: null,
      description: "Partial refund for consulting services",
      qty: 100,
      price: 50000,
      subtotal: 50000,
      total: 50000,
      amountApplied: 0,
      amountRemaining: 50000,
    },
    {
      contact: 2,
      number: "CN-00003",
      date: "2026-02-12",
      status: "draft" as const,
      invoiceIdx: null,
      description: "Discount for delayed delivery",
      qty: 100,
      price: 15000,
      subtotal: 15000,
      total: 15000,
      amountApplied: 0,
      amountRemaining: 15000,
    },
  ];

  for (const cn of creditNoteData) {
    const [row] = await db
      .insert(creditNote)
      .values({
        organizationId: org.id,
        contactId: contactIds[cn.contact],
        invoiceId: cn.invoiceIdx !== null && invoiceIds[cn.invoiceIdx] ? invoiceIds[cn.invoiceIdx].id : undefined,
        creditNoteNumber: cn.number,
        issueDate: cn.date,
        status: cn.status,
        subtotal: cn.subtotal,
        taxTotal: 0,
        total: cn.total,
        amountApplied: cn.amountApplied,
        amountRemaining: cn.amountRemaining,
        currencyCode: "USD",
        createdBy: userId,
        sentAt: cn.status !== "draft" ? new Date(cn.date) : undefined,
      })
      .returning();

    await db.insert(creditNoteLine).values({
      creditNoteId: row.id,
      description: cn.description,
      quantity: cn.qty,
      unitPrice: cn.price,
      amount: cn.subtotal,
      accountId: accountMap.get("4010")!,
      sortOrder: 0,
    });
  }
  console.log(`  ${creditNoteData.length} credit notes`);
  } // end credit notes

  const billIds: { id: string; contactIdx: number; status: string; paid: number }[] = [];
  const existingBills = await db.query.bill.findFirst({
    where: eq(bill.organizationId, org.id),
  });
  if (existingBills) {
    console.log("Bills already exist, skipping...");
  } else {
  // 10. Bills
  console.log("Creating bills...");
  const billData = [
    { contact: 10, number: "BILL-00001", date: "2026-01-03", due: "2026-02-02", status: "paid" as const, desc: "Office Supplies Jan", amount: 15000, paid: 15000 },
    { contact: 11, number: "BILL-00002", date: "2026-01-10", due: "2026-02-09", status: "paid" as const, desc: "AWS January", amount: 45000, paid: 45000 },
    { contact: 12, number: "BILL-00003", date: "2026-01-01", due: "2026-01-02", status: "paid" as const, desc: "Rent January", amount: 350000, paid: 350000 },
    { contact: 13, number: "BILL-00004", date: "2026-01-15", due: "2026-01-29", status: "paid" as const, desc: "Utilities January", amount: 22000, paid: 22000 },
    { contact: 14, number: "BILL-00005", date: "2026-02-01", due: "2026-03-03", status: "received" as const, desc: "Insurance Q1", amount: 75000, paid: 0 },
    { contact: 15, number: "BILL-00006", date: "2026-02-05", due: "2026-03-07", status: "received" as const, desc: "New Laptop", amount: 150000, paid: 0 },
    { contact: 16, number: "BILL-00007", date: "2026-02-10", due: "2026-02-24", status: "overdue" as const, desc: "Marketing Campaign", amount: 75000, paid: 0 },
    { contact: 17, number: "BILL-00008", date: "2026-02-15", due: "2026-03-17", status: "draft" as const, desc: "Legal Consultation", amount: 50000, paid: 0 },
    { contact: 11, number: "BILL-00009", date: "2026-02-10", due: "2026-03-12", status: "received" as const, desc: "AWS February", amount: 48000, paid: 0 },
    { contact: 12, number: "BILL-00010", date: "2026-02-01", due: "2026-02-02", status: "paid" as const, desc: "Rent February", amount: 350000, paid: 350000 },
  ];

  for (const b of billData) {
    const [row] = await db
      .insert(bill)
      .values({
        organizationId: org.id,
        contactId: contactIds[b.contact],
        billNumber: b.number,
        issueDate: b.date,
        dueDate: b.due,
        status: b.status,
        subtotal: b.amount,
        taxTotal: 0,
        total: b.amount,
        amountPaid: b.paid,
        amountDue: b.amount - b.paid,
        currencyCode: "USD",
      })
      .returning();

    await db.insert(billLine).values({
      billId: row.id,
      description: b.desc,
      quantity: 100,
      unitPrice: b.amount,
      amount: b.amount,
      accountId: accountMap.get("5000")!,
      sortOrder: 0,
    });
    billIds.push({ id: row.id, contactIdx: b.contact, status: b.status, paid: b.paid });
  }
  console.log(`  ${billData.length} bills`);
  } // end bills block

  // 11. Bank Accounts + Transactions
  const existingBankAccounts = await db.query.bankAccount.findFirst({
    where: eq(bankAccount.organizationId, org.id),
  });
  if (existingBankAccounts) {
    console.log("Bank accounts already exist, skipping...");
  } else {
  console.log("Creating bank accounts...");
  const [checkingBank] = await db
    .insert(bankAccount)
    .values({
      organizationId: org.id,
      accountName: "Business Checking",
      accountNumber: "****4567",
      bankName: "First National Bank",
      currencyCode: "USD",
      chartAccountId: accountMap.get("1100")!,
      balance: 5000000,
    })
    .returning();

  await db
    .insert(bankAccount)
    .values({
      organizationId: org.id,
      accountName: "Business Savings",
      accountNumber: "****8901",
      bankName: "First National Bank",
      currencyCode: "USD",
      chartAccountId: accountMap.get("1110")!,
      balance: 2500000,
    });

  await db
    .insert(bankAccount)
    .values({
      organizationId: org.id,
      accountName: "Business Credit Card",
      accountNumber: "****2345",
      bankName: "Capital One",
      currencyCode: "USD",
      chartAccountId: accountMap.get("2600")!,
      balance: -125000,
    });

  // Bank transactions for checking account
  const bankTxns = [
    { date: "2026-01-02", desc: "Opening deposit", amount: 5000000, ref: "DEP001" },
    { date: "2026-01-05", desc: "Rent payment", amount: -350000, ref: "CHK001" },
    { date: "2026-01-10", desc: "Client payment - Acme Corp", amount: 1500000, ref: "DEP002" },
    { date: "2026-01-12", desc: "Internet bill", amount: -9900, ref: "ACH001" },
    { date: "2026-01-15", desc: "Office supplies", amount: -15000, ref: "CHK002" },
    { date: "2026-01-20", desc: "AWS hosting", amount: -45000, ref: "ACH002" },
    { date: "2026-01-25", desc: "Client payment - Global Industries", amount: 2000000, ref: "DEP003" },
    { date: "2026-01-31", desc: "Payroll", amount: -1200000, ref: "ACH003" },
    { date: "2026-02-01", desc: "Transfer to savings", amount: -500000, ref: "TRF001" },
    { date: "2026-02-05", desc: "Rent payment", amount: -350000, ref: "CHK003" },
    { date: "2026-02-10", desc: "Insurance", amount: -25000, ref: "ACH004" },
    { date: "2026-02-12", desc: "Client payment", amount: 800000, ref: "DEP004" },
    { date: "2026-02-15", desc: "Marketing agency", amount: -75000, ref: "CHK004" },
    { date: "2026-02-18", desc: "Client payment", amount: 500000, ref: "DEP005" },
    { date: "2026-02-20", desc: "Legal fees", amount: -50000, ref: "CHK005" },
    { date: "2026-02-25", desc: "Subscription payment", amount: -2900, ref: "ACH005" },
    { date: "2026-02-28", desc: "Payroll", amount: -1200000, ref: "ACH006" },
  ];

  let runBal = 0;
  for (const tx of bankTxns) {
    runBal += tx.amount;
    await db.insert(bankTransaction).values({
      bankAccountId: checkingBank.id,
      date: tx.date,
      description: tx.desc,
      amount: tx.amount,
      balance: runBal,
      reference: tx.ref,
      status: tx.amount > 0 ? "reconciled" : "unreconciled",
    });
  }
  console.log(`  3 bank accounts, ${bankTxns.length} transactions`);

  // 11b. Payments (received for paid invoices, made for paid bills)
  console.log("Creating payments...");
  let payNum = 1;

  // Received payments for paid/partial invoices
  for (const inv of invoiceIds.filter((i) => i.paid > 0)) {
    const [p] = await db
      .insert(payment)
      .values({
        organizationId: org.id,
        contactId: contactIds[inv.contactIdx],
        paymentNumber: `PAY-R${String(payNum++).padStart(4, "0")}`,
        type: "received",
        date: "2026-01-25",
        amount: inv.paid,
        method: payNum % 2 === 0 ? "bank_transfer" : "card",
        reference: `REF-${payNum}`,
        bankAccountId: checkingBank.id,
        currencyCode: "USD",
        createdBy: userId,
      })
      .returning();

    await db.insert(paymentAllocation).values({
      paymentId: p.id,
      documentType: "invoice",
      documentId: inv.id,
      amount: inv.paid,
    });
  }

  // Made payments for paid bills
  for (const b of billIds.filter((b) => b.paid > 0)) {
    const [p] = await db
      .insert(payment)
      .values({
        organizationId: org.id,
        contactId: contactIds[b.contactIdx],
        paymentNumber: `PAY-M${String(payNum++).padStart(4, "0")}`,
        type: "made",
        date: "2026-02-01",
        amount: b.paid,
        method: "bank_transfer",
        reference: `CHK-${payNum}`,
        bankAccountId: checkingBank.id,
        currencyCode: "USD",
        createdBy: userId,
      })
      .returning();

    await db.insert(paymentAllocation).values({
      paymentId: p.id,
      documentType: "bill",
      documentId: b.id,
      amount: b.paid,
    });
  }
  console.log(`  ${payNum - 1} payments`);

  // 11c. Recurring Templates
  console.log("Creating recurring templates...");
  const recurringData = [
    { name: "Monthly Retainer - Metro Services", type: "invoice", contactIdx: 4, freq: "monthly" as const, desc: "Monthly Retainer", price: 300000 },
    { name: "Quarterly Consulting - Pinnacle", type: "invoice", contactIdx: 5, freq: "quarterly" as const, desc: "Quarterly Consulting", price: 600000 },
    { name: "Monthly Rent", type: "bill", contactIdx: 12, freq: "monthly" as const, desc: "Office Rent", price: 350000 },
    { name: "Monthly AWS", type: "bill", contactIdx: 11, freq: "monthly" as const, desc: "Cloud Hosting", price: 48000 },
  ];

  for (const rt of recurringData) {
    const [tmpl] = await db
      .insert(recurringTemplate)
      .values({
        organizationId: org.id,
        name: rt.name,
        type: rt.type,
        contactId: contactIds[rt.contactIdx],
        frequency: rt.freq,
        startDate: "2026-01-01",
        nextRunDate: "2026-03-01",
        lastRunDate: "2026-02-01",
        occurrencesGenerated: 2,
        status: "active",
        currencyCode: "USD",
        createdBy: userId,
      })
      .returning();

    await db.insert(recurringTemplateLine).values({
      templateId: tmpl.id,
      description: rt.desc,
      quantity: 100,
      unitPrice: rt.price,
      accountId: accountMap.get(rt.type === "invoice" ? "4010" : "5200")!,
      sortOrder: 0,
    });
  }
  console.log(`  ${recurringData.length} recurring templates`);
  } // end bank accounts block

  // 12. Budget
  const existingBudget = await db.query.budget.findFirst({
    where: eq(budget.organizationId, org.id),
  });
  if (existingBudget) {
    console.log("Budget already exists, skipping...");
  } else {
  console.log("Creating budget...");
  const [bud] = await db
    .insert(budget)
    .values({
      organizationId: org.id,
      name: "FY 2026 Operating Budget",
      fiscalYearId: fy.id,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })
    .returning();

  const budgetAccounts = [
    { code: "4010", monthly: 500000 },  // $5,000/mo revenue
    { code: "5100", monthly: 1200000 }, // $12,000/mo wages
    { code: "5200", monthly: 350000 },  // $3,500/mo rent
    { code: "5220", monthly: 10000 },   // $100/mo internet
    { code: "5300", monthly: 15000 },   // $150/mo supplies
    { code: "5400", monthly: 25000 },   // $250/mo insurance
    { code: "5600", monthly: 50000 },   // $500/mo marketing
  ];

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const ba of budgetAccounts) {
    const [bl] = await db.insert(budgetLine).values({
      budgetId: bud.id,
      accountId: accountMap.get(ba.code)!,
      total: ba.monthly * 12,
    }).returning();

    await db.insert(budgetPeriod).values(
      monthLabels.map((label, i) => ({
        budgetLineId: bl.id,
        label: `${label} 2026`,
        startDate: `2026-${String(i + 1).padStart(2, "0")}-01`,
        endDate: `2026-${String(i + 1).padStart(2, "0")}-${new Date(2026, i + 1, 0).getDate()}`,
        amount: ba.monthly,
        sortOrder: i,
      }))
    );
  }
  console.log(`  1 budget with ${budgetAccounts.length} line items`);
  } // end budget block

  // 13. Projects + Time Entries + Tasks + Milestones + Notes
  const existingProjects = await db.query.project.findFirst({
    where: eq(project.organizationId, org.id),
  });
  if (existingProjects) {
    console.log("Projects already exist, skipping...");
  } else {
  console.log("Creating projects...");

  // Get member ID for task assignees
  const demoMember = await db.query.member.findFirst({
    where: eq(member.organizationId, org.id),
  });
  const memberId = demoMember!.id;

  const projectData = [
    { name: "Website Redesign", contactIdx: 0, budget: 2000000, rate: 15000, status: "active" as const },
    { name: "Mobile App MVP", contactIdx: 2, budget: 5000000, rate: 17500, status: "active" as const },
    { name: "API Integration", contactIdx: 8, budget: 800000, rate: 12500, status: "completed" as const },
  ];

  const projectIds: string[] = [];

  for (const p of projectData) {
    const [proj] = await db
      .insert(project)
      .values({
        organizationId: org.id,
        name: p.name,
        contactId: contactIds[p.contactIdx],
        budget: p.budget,
        hourlyRate: p.rate,
        status: p.status,
        startDate: "2026-01-01",
      })
      .returning();

    projectIds.push(proj.id);

    // Add some time entries
    const entries = [
      { date: "2026-01-15", desc: "Initial setup and planning", mins: 120 },
      { date: "2026-01-20", desc: "Development work", mins: 480 },
      { date: "2026-01-25", desc: "Code review and testing", mins: 180 },
      { date: "2026-02-01", desc: "Feature implementation", mins: 360 },
      { date: "2026-02-10", desc: "Bug fixes and polish", mins: 240 },
    ];

    for (const te of entries) {
      await db.insert(timeEntry).values({
        projectId: proj.id,
        userId: userId,
        date: te.date,
        description: te.desc,
        minutes: te.mins,
        isBillable: true,
        hourlyRate: p.rate,
      });
    }
  }
  console.log(`  ${projectData.length} projects with time entries`);

  // 13a. Project Labels
  console.log("Creating project labels...");
  const labelColors: Record<string, string> = {
    bug: "#ef4444", feature: "#3b82f6", design: "#8b5cf6", backend: "#10b981",
    frontend: "#f59e0b", urgent: "#dc2626", documentation: "#6366f1", performance: "#06b6d4",
  };

  for (const projId of projectIds) {
    for (const [name, color] of Object.entries(labelColors)) {
      await db.insert(projectLabel).values({ projectId: projId, name, color });
    }
  }

  // 13b. Project Milestones
  console.log("Creating project milestones...");
  const milestonesPerProject: { title: string; description: string; status: "upcoming" | "in_progress" | "completed" | "overdue"; dueDate: string; amount: number; completedAt?: Date }[][] = [
    // Website Redesign
    [
      { title: "Design Approval", description: "Finalize wireframes and visual design with stakeholder sign-off", status: "completed", dueDate: "2026-01-20", amount: 50000, completedAt: new Date("2026-01-18") },
      { title: "Frontend Build", description: "Implement responsive pages from approved designs", status: "in_progress", dueDate: "2026-03-15", amount: 80000 },
      { title: "Content Migration", description: "Migrate all existing content to new templates", status: "upcoming", dueDate: "2026-04-01", amount: 30000 },
      { title: "Launch", description: "Go live with new website and redirect old URLs", status: "upcoming", dueDate: "2026-04-15", amount: 40000 },
    ],
    // Mobile App MVP
    [
      { title: "Architecture Review", description: "Define tech stack, API contracts, and data models", status: "completed", dueDate: "2026-01-15", amount: 75000, completedAt: new Date("2026-01-14") },
      { title: "Core Features", description: "Authentication, dashboard, and primary user flows", status: "in_progress", dueDate: "2026-03-01", amount: 150000 },
      { title: "Beta Release", description: "Internal beta with TestFlight / Play Store internal track", status: "upcoming", dueDate: "2026-04-15", amount: 100000 },
      { title: "App Store Submission", description: "Submit to Apple and Google for review", status: "upcoming", dueDate: "2026-05-01", amount: 175000 },
    ],
    // API Integration
    [
      { title: "API Specification", description: "OpenAPI spec and endpoint documentation", status: "completed", dueDate: "2026-01-10", amount: 20000, completedAt: new Date("2026-01-09") },
      { title: "Implementation", description: "Build all integration endpoints with error handling", status: "completed", dueDate: "2026-02-01", amount: 40000, completedAt: new Date("2026-01-30") },
      { title: "Testing & QA", description: "End-to-end integration tests and load testing", status: "completed", dueDate: "2026-02-15", amount: 20000, completedAt: new Date("2026-02-14") },
    ],
  ];

  for (let i = 0; i < projectIds.length; i++) {
    for (let j = 0; j < milestonesPerProject[i].length; j++) {
      const m = milestonesPerProject[i][j];
      await db.insert(projectMilestone).values({
        projectId: projectIds[i],
        title: m.title,
        description: m.description,
        status: m.status,
        dueDate: m.dueDate,
        amount: m.amount,
        completedAt: m.completedAt,
        sortOrder: j,
      });
    }
  }

  // 13c. Project Tasks
  console.log("Creating project tasks...");
  type TaskSeed = { title: string; description: string; status: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled"; priority: "low" | "medium" | "high" | "urgent"; dueDate?: string; estimatedMinutes?: number; labels?: string[]; completedAt?: Date; checklist?: { title: string; done: boolean }[]; comments?: string[] };

  const tasksPerProject: TaskSeed[][] = [
    // Website Redesign
    [
      { title: "Create sitemap", description: "Map out all pages and navigation hierarchy", status: "done", priority: "high", dueDate: "2026-01-12", estimatedMinutes: 120, labels: ["design"], completedAt: new Date("2026-01-11"),
        checklist: [{ title: "List all current pages", done: true }, { title: "Define new IA structure", done: true }, { title: "Get stakeholder approval", done: true }],
        comments: ["Mapped 42 pages from the old site", "Consolidated 12 redundant pages into 6"] },
      { title: "Design homepage mockup", description: "High-fidelity homepage design in Figma", status: "done", priority: "high", dueDate: "2026-01-18", estimatedMinutes: 480, labels: ["design", "frontend"], completedAt: new Date("2026-01-17"),
        comments: ["Client approved v3 of the design", "Hero section uses the new brand gradient"] },
      { title: "Implement responsive nav", description: "Build hamburger menu for mobile and sticky header for desktop", status: "done", priority: "high", dueDate: "2026-02-01", estimatedMinutes: 240, labels: ["frontend"], completedAt: new Date("2026-01-31") },
      { title: "Build contact page", description: "Contact form with validation and Google Maps embed", status: "in_progress", priority: "medium", dueDate: "2026-03-05", estimatedMinutes: 180, labels: ["frontend", "backend"],
        checklist: [{ title: "Form layout", done: true }, { title: "Validation logic", done: true }, { title: "Email integration", done: false }, { title: "Map embed", done: false }] },
      { title: "Set up CMS", description: "Configure headless CMS for blog and dynamic pages", status: "in_progress", priority: "high", dueDate: "2026-03-10", estimatedMinutes: 360, labels: ["backend"],
        comments: ["Going with Sanity for the CMS"] },
      { title: "SEO optimization", description: "Meta tags, structured data, sitemap.xml, robots.txt", status: "todo", priority: "medium", dueDate: "2026-03-20", estimatedMinutes: 240, labels: ["frontend", "performance"] },
      { title: "Performance audit", description: "Lighthouse scores, image optimization, lazy loading", status: "todo", priority: "medium", dueDate: "2026-03-25", estimatedMinutes: 180, labels: ["performance"] },
      { title: "Accessibility review", description: "WCAG 2.1 AA compliance check and fixes", status: "backlog", priority: "low", estimatedMinutes: 300, labels: ["frontend"] },
      { title: "Analytics setup", description: "Google Analytics 4 + event tracking for key conversions", status: "backlog", priority: "low", labels: ["backend"] },
      { title: "Dark mode support", description: "Add theme toggle with system preference detection", status: "cancelled", priority: "low", labels: ["design", "frontend"],
        comments: ["Client decided to skip dark mode for v1"] },
    ],
    // Mobile App MVP
    [
      { title: "Set up React Native project", description: "Init project with Expo, configure TypeScript, ESLint, Prettier", status: "done", priority: "urgent", dueDate: "2026-01-10", estimatedMinutes: 120, labels: ["frontend"], completedAt: new Date("2026-01-09") },
      { title: "Design system components", description: "Button, Input, Card, Modal, Toast - reusable component library", status: "done", priority: "high", dueDate: "2026-01-20", estimatedMinutes: 600, labels: ["design", "frontend"], completedAt: new Date("2026-01-19"),
        checklist: [{ title: "Button variants", done: true }, { title: "Input fields", done: true }, { title: "Card component", done: true }, { title: "Modal/Dialog", done: true }, { title: "Toast notifications", done: true }] },
      { title: "Authentication flow", description: "Sign up, login, forgot password, biometric auth", status: "done", priority: "urgent", dueDate: "2026-01-25", estimatedMinutes: 480, labels: ["frontend", "backend"], completedAt: new Date("2026-01-24"),
        comments: ["Using Clerk for auth", "Added Face ID support on iOS"] },
      { title: "Dashboard screen", description: "Main dashboard with summary cards, recent activity, and quick actions", status: "in_progress", priority: "high", dueDate: "2026-02-28", estimatedMinutes: 360, labels: ["frontend"],
        checklist: [{ title: "Summary cards", done: true }, { title: "Recent activity list", done: true }, { title: "Quick action buttons", done: false }, { title: "Pull to refresh", done: false }] },
      { title: "Push notifications", description: "Firebase Cloud Messaging setup for iOS and Android", status: "in_progress", priority: "high", dueDate: "2026-03-05", estimatedMinutes: 300, labels: ["backend"],
        comments: ["FCM token registration working", "Need to handle notification permissions on iOS"] },
      { title: "Offline mode", description: "Local SQLite cache for offline data access with sync", status: "todo", priority: "medium", dueDate: "2026-03-15", estimatedMinutes: 480, labels: ["frontend", "backend"] },
      { title: "Payment integration", description: "Stripe SDK for in-app payments and subscriptions", status: "todo", priority: "high", dueDate: "2026-03-20", estimatedMinutes: 420, labels: ["backend"] },
      { title: "App icon and splash screen", description: "Design app icon for all sizes, animated splash screen", status: "todo", priority: "medium", dueDate: "2026-03-10", estimatedMinutes: 120, labels: ["design"] },
      { title: "End-to-end tests", description: "Detox tests for critical user flows", status: "backlog", priority: "medium", estimatedMinutes: 600, labels: ["frontend"] },
      { title: "Crash reporting", description: "Sentry integration for crash and error tracking", status: "backlog", priority: "high", labels: ["backend", "performance"] },
      { title: "Localization", description: "i18n setup with English and Spanish translations", status: "backlog", priority: "low", labels: ["frontend"] },
      { title: "Deep linking", description: "Universal links for iOS, App Links for Android", status: "backlog", priority: "low", labels: ["frontend", "backend"] },
    ],
    // API Integration
    [
      { title: "Define API contracts", description: "OpenAPI 3.0 specification for all endpoints", status: "done", priority: "urgent", dueDate: "2026-01-08", estimatedMinutes: 180, labels: ["documentation", "backend"], completedAt: new Date("2026-01-07"),
        comments: ["Spec reviewed and approved by partner team"] },
      { title: "Auth middleware", description: "OAuth 2.0 client credentials flow with token caching", status: "done", priority: "urgent", dueDate: "2026-01-12", estimatedMinutes: 240, labels: ["backend"], completedAt: new Date("2026-01-11") },
      { title: "Data sync endpoints", description: "Build CRUD endpoints for contacts, products, and orders sync", status: "done", priority: "high", dueDate: "2026-01-25", estimatedMinutes: 600, labels: ["backend"], completedAt: new Date("2026-01-24"),
        checklist: [{ title: "Contacts sync", done: true }, { title: "Products sync", done: true }, { title: "Orders sync", done: true }, { title: "Webhook handlers", done: true }] },
      { title: "Rate limiting", description: "Implement rate limiter respecting partner API limits (100 req/min)", status: "done", priority: "high", dueDate: "2026-01-28", estimatedMinutes: 120, labels: ["backend", "performance"], completedAt: new Date("2026-01-27") },
      { title: "Error handling & retries", description: "Exponential backoff retry logic with dead letter queue", status: "done", priority: "high", dueDate: "2026-02-05", estimatedMinutes: 180, labels: ["backend"], completedAt: new Date("2026-02-04"),
        comments: ["Using 3 retries with 1s, 5s, 30s backoff"] },
      { title: "Integration tests", description: "Test suite against partner sandbox environment", status: "done", priority: "high", dueDate: "2026-02-10", estimatedMinutes: 360, labels: ["backend"], completedAt: new Date("2026-02-09") },
      { title: "Load testing", description: "K6 load tests simulating 1000 concurrent syncs", status: "done", priority: "medium", dueDate: "2026-02-14", estimatedMinutes: 180, labels: ["performance"], completedAt: new Date("2026-02-13"),
        comments: ["Handled 1200 concurrent with p99 < 200ms"] },
      { title: "Monitoring dashboard", description: "Grafana dashboard for sync health, errors, and latency", status: "done", priority: "medium", dueDate: "2026-02-15", estimatedMinutes: 120, labels: ["backend"], completedAt: new Date("2026-02-14") },
    ],
  ];

  for (let i = 0; i < projectIds.length; i++) {
    for (let j = 0; j < tasksPerProject[i].length; j++) {
      const t = tasksPerProject[i][j];
      const [task] = await db.insert(projectTask).values({
        projectId: projectIds[i],
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assigneeId: memberId,
        createdById: userId,
        dueDate: t.dueDate,
        estimatedMinutes: t.estimatedMinutes,
        labels: t.labels ?? [],
        sortOrder: j,
        completedAt: t.completedAt,
      }).returning();

      // Checklist items
      if (t.checklist) {
        for (let k = 0; k < t.checklist.length; k++) {
          await db.insert(taskChecklist).values({
            taskId: task.id,
            title: t.checklist[k].title,
            isCompleted: t.checklist[k].done,
            sortOrder: k,
          });
        }
      }

      // Comments
      if (t.comments) {
        for (const content of t.comments) {
          await db.insert(taskComment).values({
            taskId: task.id,
            authorId: userId,
            content,
          });
        }
      }
    }
  }

  // 13d. Project Notes
  console.log("Creating project notes...");
  const notesPerProject: { content: string; isPinned: boolean }[][] = [
    // Website Redesign
    [
      { content: "Client prefers clean, minimal design. Reference sites: stripe.com, linear.app. No heavy animations - focus on content readability and fast loading.", isPinned: true },
      { content: "Brand colors updated: primary #2563eb, secondary #7c3aed. New logo files in shared drive under /brand/2026/.", isPinned: true },
      { content: "Meeting notes (Jan 15): Agreed on 4-page initial scope - Home, About, Services, Contact. Blog to follow in phase 2.", isPinned: false },
      { content: "Hosting decision: Vercel for frontend, existing AWS for API. Domain transfer scheduled for March.", isPinned: false },
      { content: "Image assets: Using Unsplash for stock photos initially. Client will provide custom photography by mid-March.", isPinned: false },
    ],
    // Mobile App MVP
    [
      { content: "Target platforms: iOS 16+ and Android 13+. Using Expo SDK 50 with custom dev client for native modules.", isPinned: true },
      { content: "Design tokens synced from Figma via Style Dictionary. Run `pnpm generate:tokens` after design updates.", isPinned: true },
      { content: "API base URL: staging at api-staging.example.com, prod TBD. Auth tokens expire after 24h.", isPinned: false },
      { content: "Beta testers list: 15 internal, 30 external. TestFlight invites go out March 20th.", isPinned: false },
      { content: "Performance budget: app launch < 2s, screen transitions < 300ms, API calls < 500ms p95.", isPinned: true },
      { content: "App Store requirements checklist: privacy policy page, 6.5\" and 12.9\" screenshots, app preview video (optional for v1).", isPinned: false },
    ],
    // API Integration
    [
      { content: "Partner API docs: https://partner.example.com/docs (login: shared in 1Password). Rate limit: 100 req/min per client.", isPinned: true },
      { content: "Sandbox credentials rotated monthly. Current ones expire March 1st - set calendar reminder.", isPinned: true },
      { content: "Data mapping: partner uses 'customer' we use 'contact', partner 'item' = our 'product'. Field mapping spreadsheet in /docs/mapping.xlsx.", isPinned: false },
      { content: "Post-launch monitoring: alert if sync failure rate > 2% in 5min window. PagerDuty integration configured.", isPinned: false },
    ],
  ];

  for (let i = 0; i < projectIds.length; i++) {
    for (const note of notesPerProject[i]) {
      await db.insert(projectNote).values({
        projectId: projectIds[i],
        authorId: userId,
        content: note.content,
        isPinned: note.isPinned,
      });
    }
  }
  console.log("  Labels, milestones, tasks, and notes created");
  } // end projects block

  // 14. Fixed Assets
  const existingAssets = await db.query.fixedAsset.findFirst({
    where: eq(fixedAsset.organizationId, org.id),
  });
  if (existingAssets) {
    console.log("Fixed assets already exist, skipping...");
  } else {
  console.log("Creating fixed assets...");
  const assetData = [
    { name: "MacBook Pro 16\"", number: "FA-001", date: "2026-01-15", price: 350000, life: 36, residual: 50000 },
    { name: "Office Furniture Set", number: "FA-002", date: "2026-01-10", price: 250000, life: 60, residual: 25000 },
  ];

  for (const a of assetData) {
    await db.insert(fixedAsset).values({
      organizationId: org.id,
      name: a.name,
      assetNumber: a.number,
      purchaseDate: a.date,
      purchasePrice: a.price,
      residualValue: a.residual,
      usefulLifeMonths: a.life,
      depreciationMethod: "straight_line",
      netBookValue: a.price,
      assetAccountId: accountMap.get("1620")!,
      depreciationAccountId: accountMap.get("5500")!,
      accumulatedDepAccountId: accountMap.get("1720")!,
    });
  }
  console.log(`  ${assetData.length} fixed assets`);
  } // end fixed assets block

  // 15. Payroll Employees
  const existingEmployees = await db.query.payrollEmployee.findFirst({
    where: eq(payrollEmployee.organizationId, org.id),
  });
  if (existingEmployees) {
    console.log("Payroll employees already exist, skipping...");
  } else {
  console.log("Creating payroll employees...");
  const employees = [
    { name: "Alice Johnson", email: "alice@demo.com", number: "EMP-001", position: "Senior Developer", salary: 12000000, freq: "monthly" as const },
    { name: "Bob Smith", email: "bob@demo.com", number: "EMP-002", position: "Designer", salary: 9600000, freq: "monthly" as const },
    { name: "Carol Williams", email: "carol@demo.com", number: "EMP-003", position: "Project Manager", salary: 10800000, freq: "monthly" as const },
    { name: "David Brown", email: "david@demo.com", number: "EMP-004", position: "Junior Developer", salary: 7200000, freq: "biweekly" as const },
  ];

  for (const emp of employees) {
    await db.insert(payrollEmployee).values({
      organizationId: org.id,
      name: emp.name,
      email: emp.email,
      employeeNumber: emp.number,
      position: emp.position,
      salary: emp.salary,
      payFrequency: emp.freq,
      taxRate: 2200, // 22%
      startDate: "2026-01-01",
    });
  }
  console.log(`  ${employees.length} employees`);
  } // end payroll employees block

  // 17. Expense Claims
  const existingClaims = await db.query.expenseClaim.findFirst({
    where: eq(expenseClaim.organizationId, org.id),
  });
  if (existingClaims) {
    console.log("Expense claims already exist, skipping...");
  } else {
  console.log("Creating expense claims...");
  const [claim1] = await db
    .insert(expenseClaim)
    .values({
      organizationId: org.id,
      title: "January Travel Expenses",
      description: "Business trip to client site",
      submittedBy: userId,
      status: "approved",
      totalAmount: 85000,
      currencyCode: "USD",
      submittedAt: new Date("2026-01-28"),
      approvedAt: new Date("2026-01-30"),
      approvedBy: userId,
    })
    .returning();

  await db.insert(expenseItem).values([
    {
      expenseClaimId: claim1.id,
      date: "2026-01-20",
      description: "Flight - Round trip",
      amount: 45000,
      category: "Travel",
      accountId: accountMap.get("5800")!,
      sortOrder: 0,
    },
    {
      expenseClaimId: claim1.id,
      date: "2026-01-21",
      description: "Hotel - 2 nights",
      amount: 30000,
      category: "Accommodation",
      accountId: accountMap.get("5800")!,
      sortOrder: 1,
    },
    {
      expenseClaimId: claim1.id,
      date: "2026-01-21",
      description: "Client dinner",
      amount: 10000,
      category: "Meals",
      accountId: accountMap.get("5810")!,
      sortOrder: 2,
    },
  ]);

  const [claim2] = await db
    .insert(expenseClaim)
    .values({
      organizationId: org.id,
      title: "Software Subscriptions",
      description: "Monthly tools and services",
      submittedBy: userId,
      status: "submitted",
      totalAmount: 15900,
      currencyCode: "USD",
      submittedAt: new Date("2026-02-15"),
    })
    .returning();

  await db.insert(expenseItem).values([
    {
      expenseClaimId: claim2.id,
      date: "2026-02-01",
      description: "GitHub Enterprise",
      amount: 4900,
      category: "Software",
      accountId: accountMap.get("5220")!,
      sortOrder: 0,
    },
    {
      expenseClaimId: claim2.id,
      date: "2026-02-01",
      description: "Figma Pro",
      amount: 4500,
      category: "Software",
      accountId: accountMap.get("5220")!,
      sortOrder: 1,
    },
    {
      expenseClaimId: claim2.id,
      date: "2026-02-01",
      description: "Slack Business+",
      amount: 6500,
      category: "Software",
      accountId: accountMap.get("5220")!,
      sortOrder: 2,
    },
  ]);
  console.log("  2 expense claims");
  } // end expense claims block

  // 18. Inventory Items + Warehouses + Movements + Suppliers + Variants
  const existingInventory = await db.query.inventoryItem.findFirst({
    where: eq(inventoryItem.organizationId, org.id),
  });

  if (!existingInventory) {
  console.log("Creating inventory...");

  // Warehouses
  const [mainWarehouse] = await db.insert(warehouse).values({
    organizationId: org.id,
    name: "Main Warehouse",
    code: "WH-MAIN",
    address: "123 Industrial Blvd, Suite 100",
    isDefault: true,
    isActive: true,
  }).returning();

  const [eastWarehouse] = await db.insert(warehouse).values({
    organizationId: org.id,
    name: "East Distribution Center",
    code: "WH-EAST",
    address: "456 Logistics Way, Building B",
    isDefault: false,
    isActive: true,
  }).returning();

  console.log("  2 warehouses");

  // Inventory items with categories
  const items = [
    { code: "ELEC-001", name: "Wireless Mouse", sku: "WM-100", category: "Electronics", purchase: 1200, sale: 2499, qty: 150, reorder: 25 },
    { code: "ELEC-002", name: "USB-C Hub 7-Port", sku: "UH-200", category: "Electronics", purchase: 2800, sale: 5499, qty: 75, reorder: 15 },
    { code: "ELEC-003", name: "Bluetooth Keyboard", sku: "BK-300", category: "Electronics", purchase: 3500, sale: 6999, qty: 42, reorder: 10 },
    { code: "ELEC-004", name: "Webcam HD 1080p", sku: "WC-400", category: "Electronics", purchase: 4500, sale: 8999, qty: 28, reorder: 10 },
    { code: "FURN-001", name: "Desk Organizer Set", sku: "DO-100", category: "Furniture", purchase: 1800, sale: 3499, qty: 60, reorder: 15 },
    { code: "FURN-002", name: "Monitor Stand", sku: "MS-200", category: "Furniture", purchase: 2200, sale: 4499, qty: 35, reorder: 10 },
    { code: "FURN-003", name: "Ergonomic Footrest", sku: "EF-300", category: "Furniture", purchase: 3200, sale: 5999, qty: 18, reorder: 8 },
    { code: "SUPP-001", name: "Printer Paper A4 (500 sheets)", sku: "PP-100", category: "Supplies", purchase: 450, sale: 899, qty: 300, reorder: 50 },
    { code: "SUPP-002", name: "Ink Cartridge Black", sku: "IC-200", category: "Supplies", purchase: 2000, sale: 3999, qty: 45, reorder: 20 },
    { code: "SUPP-003", name: "Sticky Notes (12-Pack)", sku: "SN-300", category: "Supplies", purchase: 350, sale: 799, qty: 120, reorder: 30 },
    { code: "TOOL-001", name: "Precision Screwdriver Kit", sku: "SK-100", category: "Tools", purchase: 1500, sale: 2999, qty: 55, reorder: 10 },
    { code: "TOOL-002", name: "Cable Tester Pro", sku: "CT-200", category: "Tools", purchase: 6500, sale: 12999, qty: 12, reorder: 5 },
    { code: "PKG-001", name: "Shipping Box (Medium)", sku: "SB-100", category: "Packaging", purchase: 150, sale: 349, qty: 500, reorder: 100 },
    { code: "PKG-002", name: "Bubble Wrap Roll (50m)", sku: "BW-200", category: "Packaging", purchase: 800, sale: 1599, qty: 25, reorder: 10 },
    { code: "ELEC-005", name: "Noise Cancelling Headphones", sku: "NH-500", category: "Electronics", purchase: 12000, sale: 24999, qty: 5, reorder: 8, inactive: true },
  ];

  const createdItems: { id: string; code: string; name: string; qty: number }[] = [];
  for (const item of items) {
    const [created] = await db.insert(inventoryItem).values({
      organizationId: org.id,
      code: item.code,
      name: item.name,
      sku: item.sku,
      category: item.category,
      purchasePrice: item.purchase,
      salePrice: item.sale,
      quantityOnHand: item.qty,
      reorderPoint: item.reorder,
      isActive: !("inactive" in item && item.inactive),
    }).returning();
    createdItems.push({ id: created.id, code: item.code, name: item.name, qty: item.qty });
  }
  console.log(`  ${items.length} inventory items`);

  // Inventory movements (history for first few items)
  const movementData = [
    { itemIdx: 0, type: "initial" as const, qty: 100, prev: 0, reason: "Opening stock" },
    { itemIdx: 0, type: "purchase" as const, qty: 50, prev: 100, reason: "PO-2026-001" },
    { itemIdx: 0, type: "sale" as const, qty: -10, prev: 150, reason: "INV-2026-012" },
    { itemIdx: 0, type: "adjustment" as const, qty: 10, prev: 140, reason: "Found miscounted in warehouse audit" },
    { itemIdx: 1, type: "initial" as const, qty: 50, prev: 0, reason: "Opening stock" },
    { itemIdx: 1, type: "purchase" as const, qty: 30, prev: 50, reason: "PO-2026-003" },
    { itemIdx: 1, type: "sale" as const, qty: -5, prev: 80, reason: "INV-2026-018" },
    { itemIdx: 2, type: "initial" as const, qty: 30, prev: 0, reason: "Opening stock" },
    { itemIdx: 2, type: "purchase" as const, qty: 20, prev: 30, reason: "PO-2026-005" },
    { itemIdx: 2, type: "sale" as const, qty: -8, prev: 50, reason: "INV-2026-022" },
    { itemIdx: 3, type: "initial" as const, qty: 20, prev: 0, reason: "Opening stock" },
    { itemIdx: 3, type: "purchase" as const, qty: 15, prev: 20, reason: "PO-2026-007" },
    { itemIdx: 3, type: "sale" as const, qty: -7, prev: 35, reason: "INV-2026-025" },
  ];

  for (const m of movementData) {
    const ci = createdItems[m.itemIdx];
    await db.insert(inventoryMovement).values({
      organizationId: org.id,
      inventoryItemId: ci.id,
      warehouseId: mainWarehouse.id,
      type: m.type,
      quantity: m.qty,
      previousQuantity: m.prev,
      newQuantity: m.prev + m.qty,
      reason: m.reason,
      createdBy: "seed",
    });
  }
  console.log(`  ${movementData.length} inventory movements`);

  // Link some suppliers (use existing contacts that are suppliers)
  const supplierContacts = await db.query.contact.findMany({
    where: eq(contact.organizationId, org.id),
    limit: 3,
  });

  if (supplierContacts.length > 0) {
    const supplierLinks = [
      { itemIdx: 0, contactIdx: 0, code: "SUP-WM100", lead: 7, price: 1100, preferred: true },
      { itemIdx: 1, contactIdx: 0, code: "SUP-UH200", lead: 10, price: 2600, preferred: true },
      { itemIdx: 2, contactIdx: 1 % supplierContacts.length, code: "SUP-BK300", lead: 14, price: 3200, preferred: true },
      { itemIdx: 0, contactIdx: 1 % supplierContacts.length, code: "ALT-WM100", lead: 21, price: 1250, preferred: false },
    ];

    for (const sl of supplierLinks) {
      await db.insert(inventoryItemSupplier).values({
        organizationId: org.id,
        inventoryItemId: createdItems[sl.itemIdx].id,
        contactId: supplierContacts[sl.contactIdx].id,
        supplierCode: sl.code,
        leadTimeDays: sl.lead,
        purchasePrice: sl.price,
        isPreferred: sl.preferred,
      });
    }
    console.log(`  ${supplierLinks.length} supplier links`);
  }

  // Variants for a couple of items
  const variantData = [
    { itemIdx: 0, name: "Black", sku: "WM-100-BLK", purchase: 1200, sale: 2499, qty: 80, options: { Color: "Black" } as Record<string, string> },
    { itemIdx: 0, name: "White", sku: "WM-100-WHT", purchase: 1200, sale: 2499, qty: 50, options: { Color: "White" } as Record<string, string> },
    { itemIdx: 0, name: "Silver", sku: "WM-100-SLV", purchase: 1300, sale: 2699, qty: 20, options: { Color: "Silver" } as Record<string, string> },
    { itemIdx: 2, name: "Compact", sku: "BK-300-CMP", purchase: 3000, sale: 5999, qty: 22, options: { Size: "Compact" } as Record<string, string> },
    { itemIdx: 2, name: "Full Size", sku: "BK-300-FUL", purchase: 3500, sale: 6999, qty: 20, options: { Size: "Full" } as Record<string, string> },
  ];

  for (const v of variantData) {
    await db.insert(inventoryVariant).values({
      organizationId: org.id,
      inventoryItemId: createdItems[v.itemIdx].id,
      name: v.name,
      sku: v.sku,
      purchasePrice: v.purchase,
      salePrice: v.sale,
      quantityOnHand: v.qty,
      options: v.options,
    });
  }
  console.log(`  ${variantData.length} variants`);

  // Inventory categories
  const categoryData = [
    { name: "Electronics", color: "#3b82f6", description: "Electronic devices and accessories" },
    { name: "Furniture", color: "#f59e0b", description: "Office furniture and ergonomic equipment" },
    { name: "Supplies", color: "#10b981", description: "Office and printing supplies" },
    { name: "Tools", color: "#8b5cf6", description: "Hardware and diagnostic tools" },
    { name: "Packaging", color: "#ec4899", description: "Shipping and packaging materials" },
  ];

  const createdCategories: { id: string; name: string }[] = [];
  for (const cat of categoryData) {
    const [created] = await db.insert(inventoryCategory).values({
      organizationId: org.id,
      name: cat.name,
      color: cat.color,
      description: cat.description,
    }).returning();
    createdCategories.push({ id: created.id, name: cat.name });
  }

  // Add subcategories under Electronics
  const electronicsCat = createdCategories.find((c) => c.name === "Electronics");
  if (electronicsCat) {
    await db.insert(inventoryCategory).values([
      { organizationId: org.id, name: "Input Devices", color: "#60a5fa", parentId: electronicsCat.id },
      { organizationId: org.id, name: "Audio", color: "#818cf8", parentId: electronicsCat.id },
    ]);
  }
  console.log(`  ${categoryData.length + 2} categories`);

  // Link items to categories via categoryId
  const categoryMap: Record<string, string> = {};
  for (const c of createdCategories) categoryMap[c.name] = c.id;

  for (let i = 0; i < items.length; i++) {
    const catId = categoryMap[items[i].category];
    if (catId) {
      await db.update(inventoryItem)
        .set({ categoryId: catId })
        .where(eq(inventoryItem.id, createdItems[i].id));
    }
  }
  console.log("  items linked to categories");

  // Per-warehouse stock levels
  const warehouseStockData = [
    // Main warehouse gets majority of stock
    { itemIdx: 0, whId: mainWarehouse.id, qty: 120 },
    { itemIdx: 1, whId: mainWarehouse.id, qty: 55 },
    { itemIdx: 2, whId: mainWarehouse.id, qty: 30 },
    { itemIdx: 3, whId: mainWarehouse.id, qty: 20 },
    { itemIdx: 4, whId: mainWarehouse.id, qty: 45 },
    { itemIdx: 5, whId: mainWarehouse.id, qty: 25 },
    { itemIdx: 7, whId: mainWarehouse.id, qty: 200 },
    { itemIdx: 8, whId: mainWarehouse.id, qty: 30 },
    { itemIdx: 10, whId: mainWarehouse.id, qty: 40 },
    { itemIdx: 12, whId: mainWarehouse.id, qty: 350 },
    // East warehouse gets some items
    { itemIdx: 0, whId: eastWarehouse.id, qty: 30 },
    { itemIdx: 1, whId: eastWarehouse.id, qty: 20 },
    { itemIdx: 2, whId: eastWarehouse.id, qty: 12 },
    { itemIdx: 4, whId: eastWarehouse.id, qty: 15 },
    { itemIdx: 7, whId: eastWarehouse.id, qty: 100 },
    { itemIdx: 8, whId: eastWarehouse.id, qty: 15 },
    { itemIdx: 12, whId: eastWarehouse.id, qty: 150 },
  ];

  for (const ws of warehouseStockData) {
    await db.insert(warehouseStock).values({
      organizationId: org.id,
      inventoryItemId: createdItems[ws.itemIdx].id,
      warehouseId: ws.whId,
      quantity: ws.qty,
    });
  }
  console.log(`  ${warehouseStockData.length} warehouse stock entries`);

  // Stock transfers
  const [completedTransfer] = await db.insert(inventoryTransfer).values({
    organizationId: org.id,
    fromWarehouseId: mainWarehouse.id,
    toWarehouseId: eastWarehouse.id,
    status: "completed",
    notes: "Monthly restock of east distribution center",
    transferredBy: "seed",
    completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  }).returning();

  await db.insert(inventoryTransferLine).values([
    { transferId: completedTransfer.id, inventoryItemId: createdItems[0].id, quantity: 15, receivedQuantity: 15 },
    { transferId: completedTransfer.id, inventoryItemId: createdItems[1].id, quantity: 10, receivedQuantity: 10 },
  ]);

  const [draftTransfer] = await db.insert(inventoryTransfer).values({
    organizationId: org.id,
    fromWarehouseId: eastWarehouse.id,
    toWarehouseId: mainWarehouse.id,
    status: "draft",
    notes: "Return excess packaging materials",
    transferredBy: "seed",
  }).returning();

  await db.insert(inventoryTransferLine).values([
    { transferId: draftTransfer.id, inventoryItemId: createdItems[12].id, quantity: 50 },
  ]);

  const [inTransitTransfer] = await db.insert(inventoryTransfer).values({
    organizationId: org.id,
    fromWarehouseId: mainWarehouse.id,
    toWarehouseId: eastWarehouse.id,
    status: "in_transit",
    notes: "Urgent restock - low stock items",
    transferredBy: "seed",
  }).returning();

  await db.insert(inventoryTransferLine).values([
    { transferId: inTransitTransfer.id, inventoryItemId: createdItems[2].id, quantity: 8 },
    { transferId: inTransitTransfer.id, inventoryItemId: createdItems[3].id, quantity: 5 },
    { transferId: inTransitTransfer.id, inventoryItemId: createdItems[10].id, quantity: 10 },
  ]);

  console.log("  3 stock transfers");
  } else {
    console.log("\nInventory data already exists, skipping...");
  }

  // ===== ADDITIONAL SEED DATA =====

  // 19. Cost Centers
  const existingCostCenters = await db.query.costCenter.findFirst({
    where: eq(costCenter.organizationId, org.id),
  });
  if (!existingCostCenters) {
    console.log("Creating cost centers...");
    const ccData = [
      { code: "DEPT-ENG", name: "Engineering" },
      { code: "DEPT-SALES", name: "Sales" },
      { code: "DEPT-MKT", name: "Marketing" },
      { code: "DEPT-OPS", name: "Operations" },
      { code: "DEPT-HR", name: "Human Resources" },
      { code: "DEPT-FIN", name: "Finance" },
    ];
    const createdCCs: { id: string; code: string }[] = [];
    for (const cc of ccData) {
      const [row] = await db.insert(costCenter).values({
        organizationId: org.id,
        code: cc.code,
        name: cc.name,
      }).returning();
      createdCCs.push({ id: row.id, code: cc.code });
    }
    // Sub-departments under Engineering
    const engCC = createdCCs.find((c) => c.code === "DEPT-ENG");
    if (engCC) {
      await db.insert(costCenter).values([
        { organizationId: org.id, code: "ENG-FE", name: "Frontend", parentId: engCC.id },
        { organizationId: org.id, code: "ENG-BE", name: "Backend", parentId: engCC.id },
        { organizationId: org.id, code: "ENG-INFRA", name: "Infrastructure", parentId: engCC.id },
      ]);
    }
    console.log(`  ${ccData.length + 3} cost centers`);
  }

  // 20. Tags
  const existingTags = await db.query.tag.findFirst({
    where: eq(tag.organizationId, org.id),
  });
  if (!existingTags) {
    console.log("Creating tags...");
    const tagData = [
      { name: "Q1 2026", color: "#3b82f6", description: "First quarter transactions" },
      { name: "Recurring", color: "#10b981", description: "Recurring transactions" },
      { name: "Marketing", color: "#f59e0b", description: "Marketing related" },
      { name: "Client Project", color: "#8b5cf6", description: "Client project expenses" },
      { name: "Tax Deductible", color: "#ef4444", description: "Tax deductible items" },
      { name: "Needs Review", color: "#f97316", description: "Items needing review" },
      { name: "Auto-imported", color: "#6b7280", description: "Automatically imported transactions" },
    ];
    for (const t of tagData) {
      await db.insert(tag).values({
        organizationId: org.id,
        name: t.name,
        color: t.color,
        description: t.description,
      });
    }
    console.log(`  ${tagData.length} tags`);
  }

  // 21. Number Sequences
  const existingSeq = await db.query.numberSequence.findFirst({
    where: eq(numberSequence.organizationId, org.id),
  });
  if (!existingSeq) {
    console.log("Creating number sequences...");
    const seqData = [
      { entityType: "invoice", prefix: "INV-", lastNumber: 10 },
      { entityType: "bill", prefix: "BILL-", lastNumber: 10 },
      { entityType: "quote", prefix: "QT-", lastNumber: 5 },
      { entityType: "credit_note", prefix: "CN-", lastNumber: 3 },
      { entityType: "debit_note", prefix: "DN-", lastNumber: 2 },
      { entityType: "purchase_order", prefix: "PO-", lastNumber: 5 },
      { entityType: "payment", prefix: "PAY-", lastNumber: 15 },
      { entityType: "journal", prefix: "JE-", lastNumber: 20 },
      { entityType: "expense_claim", prefix: "EXP-", lastNumber: 2 },
    ];
    for (const s of seqData) {
      await db.insert(numberSequence).values({
        organizationId: org.id,
        entityType: s.entityType,
        prefix: s.prefix,
        lastNumber: s.lastNumber,
      });
    }
    console.log(`  ${seqData.length} sequences`);
  }

  // 22. Custom Roles
  const existingRoles = await db.query.customRole.findFirst({
    where: eq(customRole.organizationId, org.id),
  });
  if (!existingRoles) {
    console.log("Creating custom roles...");
    await db.insert(customRole).values([
      {
        organizationId: org.id,
        name: "Bookkeeper",
        description: "Can manage day-to-day accounting tasks",
        permissions: ["transactions:read", "transactions:write", "contacts:read", "contacts:write", "reports:read", "banking:read", "banking:write"],
      },
      {
        organizationId: org.id,
        name: "Sales Manager",
        description: "Full access to sales, invoices, and CRM",
        permissions: ["invoices:read", "invoices:write", "contacts:read", "contacts:write", "crm:read", "crm:write", "quotes:read", "quotes:write", "reports:read"],
      },
      {
        organizationId: org.id,
        name: "Viewer",
        description: "Read-only access to all financial data",
        permissions: ["transactions:read", "contacts:read", "invoices:read", "bills:read", "reports:read", "banking:read", "inventory:read"],
        isSystem: true,
      },
    ]);
    console.log("  3 custom roles");
  }

  // 23. Teams
  const existingTeams = await db.query.team.findFirst({
    where: eq(team.organizationId, org.id),
  });
  if (!existingTeams) {
    console.log("Creating teams...");
    const [engTeam] = await db.insert(team).values({
      organizationId: org.id,
      name: "Engineering",
      description: "Product engineering team",
      color: "#3b82f6",
    }).returning();
    const [finTeam] = await db.insert(team).values({
      organizationId: org.id,
      name: "Finance",
      description: "Finance and accounting team",
      color: "#10b981",
    }).returning();
    await db.insert(team).values({
      organizationId: org.id,
      name: "Leadership",
      description: "Executive leadership",
      color: "#8b5cf6",
    });

    // Add demo member to teams
    const demoMem = await db.query.member.findFirst({
      where: eq(member.organizationId, org.id),
    });
    if (demoMem) {
      await db.insert(teamMember).values([
        { teamId: engTeam.id, memberId: demoMem.id },
        { teamId: finTeam.id, memberId: demoMem.id },
      ]);
    }
    console.log("  3 teams");
  }

  // 24. Contact Persons
  const existingContactPersons = await db.query.contactPerson.findFirst({});
  if (!existingContactPersons) {
    console.log("Creating contact persons...");
    const contacts = await db.query.contact.findMany({
      where: eq(contact.organizationId, org.id),
      limit: 6,
    });
    const personData = [
      { name: "John Anderson", email: "john@acme.com", phone: "+1-555-0101", jobTitle: "CFO", isPrimary: true },
      { name: "Sarah Mitchell", email: "sarah@acme.com", phone: "+1-555-0102", jobTitle: "AP Manager", isPrimary: false },
      { name: "Michael Chen", email: "michael@globalind.com", phone: "+1-555-0201", jobTitle: "Procurement Director", isPrimary: true },
      { name: "Emily Davis", email: "emily@techstart.io", phone: "+1-555-0301", jobTitle: "CEO", isPrimary: true },
      { name: "Robert Wilson", email: "robert@brightsolutions.com", phone: "+1-555-0401", jobTitle: "Finance Manager", isPrimary: true },
      { name: "Lisa Thompson", email: "lisa@metroservices.com", phone: "+1-555-0501", jobTitle: "Operations Lead", isPrimary: true },
    ];
    for (let i = 0; i < Math.min(personData.length, contacts.length); i++) {
      await db.insert(contactPerson).values({
        contactId: contacts[i].id,
        ...personData[i],
      });
    }
    console.log(`  ${Math.min(personData.length, contacts.length)} contact persons`);
  }

  // 25. Quotes
  const existingQuotes = await db.query.quote.findFirst({
    where: eq(quote.organizationId, org.id),
  });
  if (!existingQuotes) {
    console.log("Creating quotes...");
    const allContacts = await db.query.contact.findMany({
      where: eq(contact.organizationId, org.id),
      limit: 10,
    });
    const allAccounts = await db.query.chartAccount.findMany({
      where: eq(chartAccount.organizationId, org.id),
    });
    const serviceAcct = allAccounts.find((a) => a.code === "4010");

    const quoteData = [
      { contact: 0, number: "QT-00001", date: "2026-02-01", expiry: "2026-03-01", status: "accepted" as const, desc: "Website Redesign Phase 3", price: 3500000 },
      { contact: 2, number: "QT-00002", date: "2026-02-10", expiry: "2026-03-10", status: "sent" as const, desc: "Mobile App Enhancement", price: 2800000 },
      { contact: 5, number: "QT-00003", date: "2026-02-15", expiry: "2026-03-15", status: "draft" as const, desc: "Data Analytics Dashboard", price: 1500000 },
      { contact: 8, number: "QT-00004", date: "2026-02-20", expiry: "2026-03-20", status: "sent" as const, desc: "Cloud Migration Project", price: 4200000 },
      { contact: 9, number: "QT-00005", date: "2026-02-25", expiry: "2026-03-25", status: "declined" as const, desc: "Security Audit", price: 800000 },
    ];

    for (const q of quoteData) {
      if (!allContacts[q.contact]) continue;
      const [row] = await db.insert(quote).values({
        organizationId: org.id,
        contactId: allContacts[q.contact].id,
        quoteNumber: q.number,
        issueDate: q.date,
        expiryDate: q.expiry,
        status: q.status,
        subtotal: q.price,
        taxTotal: 0,
        total: q.price,
        currencyCode: "USD",
        createdBy: userId,
        sentAt: q.status !== "draft" ? new Date(q.date) : undefined,
      }).returning();

      await db.insert(quoteLine).values({
        quoteId: row.id,
        description: q.desc,
        quantity: 100,
        unitPrice: q.price,
        amount: q.price,
        accountId: serviceAcct?.id,
        sortOrder: 0,
      });
    }
    console.log(`  ${quoteData.length} quotes`);
  }

  // 26. Purchase Orders
  const existingPOs = await db.query.purchaseOrder.findFirst({
    where: eq(purchaseOrder.organizationId, org.id),
  });
  if (!existingPOs) {
    console.log("Creating purchase orders...");
    const supplierContacts2 = await db.query.contact.findMany({
      where: eq(contact.organizationId, org.id),
    });
    const suppliers = supplierContacts2.filter((c) => c.type === "supplier" || c.type === "both");
    const allAccounts2 = await db.query.chartAccount.findMany({
      where: eq(chartAccount.organizationId, org.id),
    });
    const cogsAcct = allAccounts2.find((a) => a.code === "5000");

    const poData = [
      { contact: 0, number: "PO-00001", date: "2026-02-01", delivery: "2026-02-15", status: "received" as const, desc: "Office Supplies Q1", amount: 45000 },
      { contact: 1, number: "PO-00002", date: "2026-02-05", delivery: "2026-02-20", status: "sent" as const, desc: "Cloud Services March", amount: 52000 },
      { contact: 2, number: "PO-00003", date: "2026-02-10", delivery: "2026-03-01", status: "sent" as const, desc: "Office Lease March", amount: 350000 },
      { contact: 3, number: "PO-00004", date: "2026-02-15", delivery: "2026-03-15", status: "draft" as const, desc: "New Monitors x5", amount: 750000 },
      { contact: 4, number: "PO-00005", date: "2026-02-20", delivery: "2026-03-20", status: "draft" as const, desc: "Annual Insurance Renewal", amount: 300000 },
    ];

    for (const po of poData) {
      if (!suppliers[po.contact]) continue;
      const [row] = await db.insert(purchaseOrder).values({
        organizationId: org.id,
        contactId: suppliers[po.contact].id,
        poNumber: po.number,
        issueDate: po.date,
        deliveryDate: po.delivery,
        status: po.status,
        subtotal: po.amount,
        taxTotal: 0,
        total: po.amount,
        currencyCode: "USD",
        createdBy: userId,
        sentAt: po.status !== "draft" ? new Date(po.date) : undefined,
      }).returning();

      await db.insert(purchaseOrderLine).values({
        purchaseOrderId: row.id,
        description: po.desc,
        quantity: 100,
        unitPrice: po.amount,
        amount: po.amount,
        accountId: cogsAcct?.id,
        sortOrder: 0,
      });
    }
    console.log(`  ${poData.length} purchase orders`);
  }

  // 27. Debit Notes
  const existingDNs = await db.query.debitNote.findFirst({
    where: eq(debitNote.organizationId, org.id),
  });
  if (!existingDNs) {
    console.log("Creating debit notes...");
    const supplierContacts3 = await db.query.contact.findMany({
      where: eq(contact.organizationId, org.id),
    });
    const suppliers2 = supplierContacts3.filter((c) => c.type === "supplier" || c.type === "both");
    const allAccounts3 = await db.query.chartAccount.findMany({
      where: eq(chartAccount.organizationId, org.id),
    });
    const cogsAcct2 = allAccounts3.find((a) => a.code === "5000");

    if (suppliers2.length >= 2) {
      const dnData = [
        { contact: 0, number: "DN-00001", date: "2026-02-05", status: "sent" as const, desc: "Defective supplies return", amount: 8500 },
        { contact: 1, number: "DN-00002", date: "2026-02-12", status: "draft" as const, desc: "Overcharge on hosting", amount: 5000 },
      ];

      for (const dn of dnData) {
        const [row] = await db.insert(debitNote).values({
          organizationId: org.id,
          contactId: suppliers2[dn.contact].id,
          debitNoteNumber: dn.number,
          issueDate: dn.date,
          status: dn.status,
          subtotal: dn.amount,
          taxTotal: 0,
          total: dn.amount,
          amountApplied: 0,
          amountRemaining: dn.amount,
          currencyCode: "USD",
          createdBy: userId,
          sentAt: dn.status !== "draft" ? new Date(dn.date) : undefined,
        }).returning();

        await db.insert(debitNoteLine).values({
          debitNoteId: row.id,
          description: dn.desc,
          quantity: 100,
          unitPrice: dn.amount,
          amount: dn.amount,
          accountId: cogsAcct2?.id,
          sortOrder: 0,
        });
      }
      console.log("  2 debit notes");
    }
  }

  // 28. Bank Rules
  const existingBankRules = await db.query.bankRule.findFirst({
    where: eq(bankRule.organizationId, org.id),
  });
  if (!existingBankRules) {
    console.log("Creating bank rules...");
    const allAccounts4 = await db.query.chartAccount.findMany({
      where: eq(chartAccount.organizationId, org.id),
    });
    const acctMap: Record<string, string> = {};
    for (const a of allAccounts4) acctMap[a.code] = a.id;

    await db.insert(bankRule).values([
      { organizationId: org.id, name: "AWS Hosting", priority: 1, matchField: "description", matchType: "contains" as const, matchValue: "AWS", accountId: acctMap["5220"] },
      { organizationId: org.id, name: "Payroll", priority: 2, matchField: "description", matchType: "contains" as const, matchValue: "Payroll", accountId: acctMap["5100"] },
      { organizationId: org.id, name: "Rent Payment", priority: 3, matchField: "description", matchType: "contains" as const, matchValue: "Rent", accountId: acctMap["5200"] },
      { organizationId: org.id, name: "Client Deposits", priority: 4, matchField: "description", matchType: "contains" as const, matchValue: "Client payment", accountId: acctMap["4010"] },
      { organizationId: org.id, name: "Insurance", priority: 5, matchField: "description", matchType: "contains" as const, matchValue: "Insurance", accountId: acctMap["5400"] },
    ]);
    console.log("  5 bank rules");
  }

  // 29. Bank Reconciliation
  const existingRecon = await db.query.bankReconciliation.findFirst({});
  if (!existingRecon) {
    console.log("Creating bank reconciliation...");
    const bankAccts = await db.query.bankAccount.findMany({
      where: eq(bankAccount.organizationId, org.id),
      limit: 1,
    });
    if (bankAccts.length > 0) {
      await db.insert(bankReconciliation).values({
        bankAccountId: bankAccts[0].id,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        startBalance: 0,
        endBalance: 5878100,
        status: "completed",
      });
      await db.insert(bankReconciliation).values({
        bankAccountId: bankAccts[0].id,
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        startBalance: 5878100,
        endBalance: 5028200,
        status: "in_progress",
      });
      console.log("  2 reconciliations");
    }
  }

  // 30. CRM: Pipelines & Deals
  const existingPipeline = await db.query.pipeline.findFirst({
    where: eq(pipeline.organizationId, org.id),
  });
  if (!existingPipeline) {
    console.log("Creating CRM pipelines and deals...");
    const [salesPipeline] = await db.insert(pipeline).values({
      organizationId: org.id,
      name: "Sales Pipeline",
      isDefault: true,
      stages: [
        { id: "lead", name: "Lead", color: "#6b7280" },
        { id: "qualified", name: "Qualified", color: "#3b82f6" },
        { id: "proposal", name: "Proposal", color: "#f59e0b" },
        { id: "negotiation", name: "Negotiation", color: "#f97316" },
        { id: "closed_won", name: "Closed Won", color: "#10b981" },
        { id: "closed_lost", name: "Closed Lost", color: "#ef4444" },
      ],
    }).returning();

    await db.insert(pipeline).values({
      organizationId: org.id,
      name: "Partnership Pipeline",
      stages: [
        { id: "inquiry", name: "Inquiry", color: "#6b7280" },
        { id: "evaluation", name: "Evaluation", color: "#3b82f6" },
        { id: "agreement", name: "Agreement", color: "#f59e0b" },
        { id: "signed", name: "Signed", color: "#10b981" },
        { id: "declined", name: "Declined", color: "#ef4444" },
      ],
    });

    // Deals
    const allContacts2 = await db.query.contact.findMany({
      where: eq(contact.organizationId, org.id),
      limit: 10,
    });

    const dealData = [
      { contact: 0, title: "Acme Corp - Enterprise Package", stage: "negotiation", value: 12000000, prob: 75, source: "referral" as const, close: "2026-04-15" },
      { contact: 2, title: "TechStart - Annual Contract", stage: "proposal", value: 4800000, prob: 50, source: "website" as const, close: "2026-05-01" },
      { contact: 5, title: "Pinnacle Group - Consulting", stage: "qualified", value: 2400000, prob: 25, source: "cold_outreach" as const, close: "2026-06-01" },
      { contact: 7, title: "Summit Digital - Platform License", stage: "lead", value: 3600000, prob: 10, source: "event" as const, close: "2026-07-01" },
      { contact: 8, title: "CloudBase - Infrastructure", stage: "closed_won", value: 8000000, prob: 100, source: "referral" as const, close: "2026-02-28", won: true },
      { contact: 1, title: "Global Industries - Migration", stage: "closed_lost", value: 5500000, prob: 0, source: "website" as const, close: "2026-02-15", lost: true },
      { contact: 6, title: "Riverdale - Support Plan", stage: "proposal", value: 1800000, prob: 50, source: "referral" as const, close: "2026-04-30" },
      { contact: 9, title: "Sterling - Custom Development", stage: "negotiation", value: 15000000, prob: 75, source: "cold_outreach" as const, close: "2026-05-15" },
    ];

    const dealIds: string[] = [];
    for (const d of dealData) {
      if (!allContacts2[d.contact]) continue;
      const [row] = await db.insert(deal).values({
        organizationId: org.id,
        pipelineId: salesPipeline.id,
        stageId: d.stage,
        contactId: allContacts2[d.contact].id,
        title: d.title,
        valueCents: d.value,
        currency: "USD",
        probability: d.prob,
        expectedCloseDate: d.close,
        assignedTo: userId,
        source: d.source,
        wonAt: "won" in d ? new Date("2026-02-28") : undefined,
        lostAt: "lost" in d ? new Date("2026-02-15") : undefined,
        lostReason: "lost" in d ? "Budget constraints - decided to go with in-house solution" : undefined,
      }).returning();
      dealIds.push(row.id);
    }

    // Deal activities
    const activities = [
      { dealIdx: 0, type: "call" as const, content: "Initial discovery call - discussed requirements and timeline" },
      { dealIdx: 0, type: "email" as const, content: "Sent detailed proposal with pricing tiers" },
      { dealIdx: 0, type: "meeting" as const, content: "Demo session with stakeholders - very positive feedback" },
      { dealIdx: 1, type: "note" as const, content: "Contact is evaluating 3 vendors, decision by end of month" },
      { dealIdx: 1, type: "email" as const, content: "Sent case study and reference contacts" },
      { dealIdx: 4, type: "meeting" as const, content: "Contract signing meeting - deal closed!" },
      { dealIdx: 7, type: "call" as const, content: "Scope review call - additional modules requested" },
      { dealIdx: 7, type: "task" as const, content: "Prepare revised proposal with additional scope" },
    ];

    for (const act of activities) {
      if (!dealIds[act.dealIdx]) continue;
      await db.insert(dealActivity).values({
        dealId: dealIds[act.dealIdx],
        userId,
        type: act.type,
        content: act.content,
        completedAt: new Date(),
      });
    }
    console.log(`  2 pipelines, ${dealData.length} deals, ${activities.length} activities`);
  }

  // 31. Loans
  const existingLoans = await db.query.loan.findFirst({
    where: eq(loan.organizationId, org.id),
  });
  if (!existingLoans) {
    console.log("Creating loans...");
    const allAccounts5 = await db.query.chartAccount.findMany({
      where: eq(chartAccount.organizationId, org.id),
    });
    const acctMap2: Record<string, string> = {};
    for (const a of allAccounts5) acctMap2[a.code] = a.id;

    const bankAccts2 = await db.query.bankAccount.findMany({
      where: eq(bankAccount.organizationId, org.id),
      limit: 1,
    });

    const [equipLoan] = await db.insert(loan).values({
      organizationId: org.id,
      name: "Equipment Financing",
      bankAccountId: bankAccts2[0]?.id,
      principalAmount: 5000000, // $50,000
      interestRate: 650, // 6.5%
      termMonths: 36,
      startDate: "2026-01-01",
      monthlyPayment: 153300,
      status: "active",
      principalAccountId: acctMap2["2700"],
      interestAccountId: acctMap2["5910"],
    }).returning();

    // Generate loan schedule (first 6 months)
    let remaining = 5000000;
    for (let i = 1; i <= 6; i++) {
      const interest = Math.round((remaining * 650) / (12 * 10000));
      const principal = 153300 - interest;
      remaining -= principal;
      await db.insert(loanSchedule).values({
        loanId: equipLoan.id,
        periodNumber: i,
        date: `2026-${String(i).padStart(2, "0")}-01`,
        principalAmount: principal,
        interestAmount: interest,
        totalPayment: 153300,
        remainingBalance: remaining,
        posted: i <= 2,
        sortOrder: i,
      });
    }

    await db.insert(loan).values({
      organizationId: org.id,
      name: "Office Renovation Loan",
      bankAccountId: bankAccts2[0]?.id,
      principalAmount: 2500000, // $25,000
      interestRate: 550, // 5.5%
      termMonths: 24,
      startDate: "2026-02-01",
      monthlyPayment: 110200,
      status: "active",
      principalAccountId: acctMap2["2700"],
      interestAccountId: acctMap2["5910"],
    });

    console.log("  2 loans with amortization schedule");
  }

  // 32. Depreciation Entries
  const existingDepEntries = await db.query.depreciationEntry.findFirst({});
  if (!existingDepEntries) {
    console.log("Creating depreciation entries...");
    const assets = await db.query.fixedAsset.findMany({
      where: eq(fixedAsset.organizationId, org.id),
    });
    for (const asset of assets) {
      const monthlyDep = Math.round((asset.purchasePrice - (asset.residualValue ?? 0)) / asset.usefulLifeMonths);
      for (let m = 1; m <= 2; m++) {
        await db.insert(depreciationEntry).values({
          fixedAssetId: asset.id,
          date: `2026-${String(m).padStart(2, "0")}-28`,
          amount: monthlyDep,
        });
      }
    }
    console.log(`  ${assets.length * 2} depreciation entries`);
  }

  // 33. Reminder Rules
  const existingReminders = await db.query.reminderRule.findFirst({
    where: eq(reminderRule.organizationId, org.id),
  });
  if (!existingReminders) {
    console.log("Creating reminder rules...");
    await db.insert(reminderRule).values([
      {
        organizationId: org.id,
        name: "Invoice Due in 7 Days",
        triggerType: "before_due",
        triggerDays: 7,
        enabled: true,
        documentType: "invoice",
        recipientType: "contact_email",
        subjectTemplate: "Payment reminder: Invoice {{invoiceNumber}} due in 7 days",
        bodyTemplate: "Dear {{contactName}},\n\nThis is a friendly reminder that invoice {{invoiceNumber}} for {{amount}} is due on {{dueDate}}.\n\nPlease arrange payment at your earliest convenience.\n\nBest regards,\n{{orgName}}",
      },
      {
        organizationId: org.id,
        name: "Invoice Overdue - 3 Days",
        triggerType: "after_due",
        triggerDays: 3,
        enabled: true,
        documentType: "invoice",
        recipientType: "contact_email",
        subjectTemplate: "Overdue: Invoice {{invoiceNumber}} was due {{dueDate}}",
        bodyTemplate: "Dear {{contactName}},\n\nInvoice {{invoiceNumber}} for {{amount}} was due on {{dueDate}} and remains unpaid.\n\nPlease process this payment as soon as possible.\n\nBest regards,\n{{orgName}}",
      },
      {
        organizationId: org.id,
        name: "Invoice Overdue - 14 Days",
        triggerType: "after_due",
        triggerDays: 14,
        enabled: true,
        documentType: "invoice",
        recipientType: "contact_email",
        subjectTemplate: "URGENT: Invoice {{invoiceNumber}} is 14 days overdue",
        bodyTemplate: "Dear {{contactName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is now 14 days overdue.\n\nPlease contact us immediately if there are any issues with payment.\n\nBest regards,\n{{orgName}}",
      },
      {
        organizationId: org.id,
        name: "Bill Due Tomorrow",
        triggerType: "before_due",
        triggerDays: 1,
        enabled: true,
        documentType: "bill",
        recipientType: "custom",
        customEmails: ["finance@demo.com"],
        subjectTemplate: "Bill {{billNumber}} due tomorrow",
        bodyTemplate: "Bill {{billNumber}} for {{amount}} to {{contactName}} is due tomorrow ({{dueDate}}). Please ensure payment is scheduled.",
      },
    ]);
    console.log("  4 reminder rules");
  }

  // 34. Notifications
  const existingNotifs = await db.query.notification.findFirst({
    where: eq(notification.organizationId, org.id),
  });
  if (!existingNotifs) {
    console.log("Creating notifications...");
    await db.insert(notification).values([
      { organizationId: org.id, userId, type: "invoice_overdue", title: "Invoice INV-00004 is overdue", body: "Invoice to Bright Solutions for $5,000.00 was due Feb 8", channel: "in_app" },
      { organizationId: org.id, userId, type: "payment_received", title: "Payment received from Acme Corp", body: "Payment of $15,000.00 received for INV-00001", channel: "in_app", readAt: new Date() },
      { organizationId: org.id, userId, type: "inventory_low", title: "Low stock: Noise Cancelling Headphones", body: "Only 5 units remaining (reorder point: 8)", channel: "in_app" },
      { organizationId: org.id, userId, type: "payroll_due", title: "Payroll run due in 3 days", body: "March 2026 payroll needs to be processed by March 15", channel: "in_app" },
      { organizationId: org.id, userId, type: "task_assigned", title: "Task assigned: Build contact page", body: "You were assigned to 'Build contact page' in Website Redesign", channel: "in_app", readAt: new Date() },
      { organizationId: org.id, userId, type: "system_alert", title: "Bank sync completed", body: "17 new transactions imported from Business Checking", channel: "in_app", readAt: new Date() },
      { organizationId: org.id, userId, type: "approval_needed", title: "Expense claim needs approval", body: "Software Subscriptions claim for $159.00 submitted", channel: "in_app" },
    ]);
    console.log("  7 notifications");
  }

  // 35. Document Templates
  const existingTemplates = await db.query.documentTemplate.findFirst({
    where: eq(documentTemplate.organizationId, org.id),
  });
  if (!existingTemplates) {
    console.log("Creating document templates...");
    await db.insert(documentTemplate).values([
      {
        organizationId: org.id,
        name: "Standard Invoice",
        type: "invoice",
        isDefault: true,
        accentColor: "#10b981",
        showTaxBreakdown: true,
        showPaymentTerms: true,
        notes: "Thank you for your business. Payment is due within the terms specified above.",
        headerHtml: "<h1 style=\"color: #10b981;\">{{orgName}}</h1>",
        footerHtml: "<p style=\"color: #6b7280; font-size: 10px;\">{{orgName}} · {{orgAddress}}</p>",
      },
      {
        organizationId: org.id,
        name: "Professional Quote",
        type: "quote",
        isDefault: true,
        accentColor: "#3b82f6",
        showTaxBreakdown: true,
        showPaymentTerms: false,
        notes: "This quote is valid for 30 days from the issue date.",
      },
      {
        organizationId: org.id,
        name: "Payment Receipt",
        type: "receipt",
        isDefault: true,
        accentColor: "#10b981",
        showTaxBreakdown: false,
        showPaymentTerms: false,
      },
      {
        organizationId: org.id,
        name: "Purchase Order",
        type: "purchase_order",
        isDefault: true,
        accentColor: "#f59e0b",
        showTaxBreakdown: true,
        showPaymentTerms: true,
        notes: "Please confirm receipt of this purchase order.",
      },
    ]);
    console.log("  4 document templates");
  }

  // 36. Document Folders
  const existingFolders = await db.query.documentFolder.findFirst({
    where: eq(documentFolder.organizationId, org.id),
  });
  if (!existingFolders) {
    console.log("Creating document folders...");
    const [invoicesFolder] = await db.insert(documentFolder).values({
      organizationId: org.id,
      name: "Invoices",
    }).returning();
    const [receiptsFolder] = await db.insert(documentFolder).values({
      organizationId: org.id,
      name: "Receipts",
    }).returning();
    await db.insert(documentFolder).values([
      { organizationId: org.id, name: "Contracts" },
      { organizationId: org.id, name: "Tax Documents" },
      { organizationId: org.id, name: "2026", parentId: invoicesFolder.id },
      { organizationId: org.id, name: "2025", parentId: invoicesFolder.id },
      { organizationId: org.id, name: "Expense Receipts", parentId: receiptsFolder.id },
    ]);
    console.log("  7 document folders");
  }

  // 37. Saved Reports
  const existingReports = await db.query.savedReport.findFirst({
    where: eq(savedReport.organizationId, org.id),
  });
  if (!existingReports) {
    console.log("Creating saved reports...");
    const reportData: { name: string; description: string; config: ReportConfig }[] = [
      { name: "Monthly P&L", description: "Profit & Loss report by month", config: { dataSource: "profit_loss", filters: [], groupBy: ["month"], columns: ["revenue", "expenses", "net"], dateRange: { from: "2026-01-01", to: "2026-12-31" } } },
      { name: "AR Aging Summary", description: "Accounts receivable aging buckets", config: { dataSource: "ar_aging", filters: [], groupBy: ["contact"], columns: ["current", "30days", "60days", "90days", "120plus"] } },
      { name: "Cash Flow Forecast", description: "12-month cash flow projection", config: { dataSource: "cash_flow", filters: [], groupBy: ["month"], columns: ["inflows", "outflows", "net"], chartType: "line" } },
      { name: "Expense by Department", description: "Expenses broken down by cost center", config: { dataSource: "expense_by_cost_center", filters: [], groupBy: ["cost_center"], columns: ["category", "amount", "percentage"], chartType: "bar" } },
    ];
    for (const r of reportData) {
      await db.insert(savedReport).values({
        organizationId: org.id,
        name: r.name,
        description: r.description,
        config: r.config,
      });
    }
    console.log("  4 saved reports");
  }

  // 38. Scheduled Payments
  const existingScheduledPay = await db.query.scheduledPayment.findFirst({
    where: eq(scheduledPayment.organizationId, org.id),
  });
  if (!existingScheduledPay) {
    console.log("Creating scheduled payments...");
    const unpaidBills = await db.query.bill.findMany({
      where: eq(bill.organizationId, org.id),
    });
    const pendingBills = unpaidBills.filter((b) => b.status !== "paid" && b.status !== "draft" && b.status !== "void");

    for (const b of pendingBills.slice(0, 3)) {
      await db.insert(scheduledPayment).values({
        organizationId: org.id,
        billId: b.id,
        contactId: b.contactId,
        amount: b.amountDue,
        currencyCode: "USD",
        scheduledDate: b.dueDate,
        status: "pending",
        notes: `Scheduled payment for ${b.billNumber}`,
      });
    }
    console.log(`  ${Math.min(pendingBills.length, 3)} scheduled payments`);
  }

  // 39. Workflows
  const existingWorkflows = await db.query.workflow.findFirst({
    where: eq(workflow.organizationId, org.id),
  });
  if (!existingWorkflows) {
    console.log("Creating workflows...");
    const workflowData: { name: string; description: string; trigger: "invoice_overdue" | "payment_received" | "inventory_low" | "contact_created"; conditions: WorkflowCondition[]; actions: WorkflowAction[]; isActive: boolean; triggerCount?: number }[] = [
      {
        name: "Invoice Overdue Notification",
        description: "Send notification when invoice becomes overdue",
        trigger: "invoice_overdue",
        conditions: [{ field: "amountDue", operator: "gt", value: "0" }],
        actions: [{ type: "send_notification", config: { title: "Invoice overdue", body: "Invoice {{invoiceNumber}} is now overdue" } }],
        isActive: true,
        triggerCount: 3,
      },
      {
        name: "Payment Thank You",
        description: "Send thank you email when payment received",
        trigger: "payment_received",
        conditions: [],
        actions: [{ type: "send_email", config: { subject: "Thank you for your payment", template: "payment_thanks" } }],
        isActive: true,
        triggerCount: 5,
      },
      {
        name: "Low Stock Alert",
        description: "Alert when inventory drops below reorder point",
        trigger: "inventory_low",
        conditions: [],
        actions: [{ type: "send_notification", config: { title: "Low stock alert", body: "{{itemName}} is below reorder point" } }, { type: "create_task", config: { title: "Reorder {{itemName}}", priority: "high" } }],
        isActive: true,
        triggerCount: 1,
      },
      {
        name: "New Contact Welcome",
        description: "Create onboarding task when new contact added",
        trigger: "contact_created",
        conditions: [],
        actions: [{ type: "create_task", config: { title: "Onboard: {{contactName}}", description: "Review payment terms and set up portal access" } }],
        isActive: false,
      },
    ];
    for (const w of workflowData) {
      await db.insert(workflow).values({
        organizationId: org.id,
        name: w.name,
        description: w.description,
        trigger: w.trigger,
        conditions: w.conditions,
        actions: w.actions,
        isActive: w.isActive,
        triggerCount: w.triggerCount,
      });
    }
    console.log("  4 workflows");
  }

  // 40. Payroll Settings
  const existingPayrollSettings = await db.query.payrollSettings.findFirst({
    where: eq(payrollSettings.organizationId, org.id),
  });
  if (!existingPayrollSettings) {
    console.log("Creating payroll settings and runs...");
    await db.insert(payrollSettings).values({
      organizationId: org.id,
      defaultTaxRate: 2200,
      overtimeThresholdHours: 40,
      overtimeMultiplier: 1.5,
      defaultCurrency: "USD",
      salaryExpenseAccountCode: "5100",
      taxPayableAccountCode: "2200",
      bankAccountCode: "1100",
    });

    // Payroll runs
    const demoMem2 = await db.query.member.findFirst({
      where: eq(member.organizationId, org.id),
    });

    const [janRun] = await db.insert(payrollRun).values({
      organizationId: org.id,
      payPeriodStart: "2026-01-01",
      payPeriodEnd: "2026-01-31",
      status: "completed",
      totalGross: 3300000,
      totalDeductions: 726000,
      totalNet: 2574000,
      processedAt: new Date("2026-01-31"),
      approvedBy: demoMem2?.id,
      approvedAt: new Date("2026-01-30"),
      approvalStatus: "approved",
    }).returning();

    const [febRun] = await db.insert(payrollRun).values({
      organizationId: org.id,
      payPeriodStart: "2026-02-01",
      payPeriodEnd: "2026-02-28",
      status: "completed",
      totalGross: 3300000,
      totalDeductions: 726000,
      totalNet: 2574000,
      processedAt: new Date("2026-02-28"),
      approvedBy: demoMem2?.id,
      approvedAt: new Date("2026-02-27"),
      approvalStatus: "approved",
    }).returning();

    await db.insert(payrollRun).values({
      organizationId: org.id,
      payPeriodStart: "2026-03-01",
      payPeriodEnd: "2026-03-31",
      status: "draft",
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
    });

    // Payroll items for Jan/Feb
    const empList = await db.query.payrollEmployee.findMany({
      where: eq(payrollEmployee.organizationId, org.id),
    });

    for (const run of [janRun, febRun]) {
      for (const emp of empList) {
        const monthly = Math.round(emp.salary / 12);
        const tax = Math.round(monthly * (emp.taxRate ?? 2200) / 10000);
        await db.insert(payrollItem).values({
          payrollRunId: run.id,
          employeeId: emp.id,
          type: "regular_salary",
          description: `Monthly salary - ${emp.name}`,
          grossAmount: monthly,
          taxAmount: tax,
          deductions: 0,
          netAmount: monthly - tax,
        });
      }
    }
    console.log(`  payroll settings, 3 runs, ${empList.length * 2} items`);
  }

  // 41. Exchange Rates
  const existingFx = await db.query.exchangeRate.findFirst({
    where: eq(exchangeRate.organizationId, org.id),
  });
  if (!existingFx) {
    console.log("Creating exchange rates...");
    const fxData = [
      { base: "USD", target: "EUR", rate: 92000, date: "2026-03-01" },
      { base: "USD", target: "GBP", rate: 79000, date: "2026-03-01" },
      { base: "USD", target: "JPY", rate: 150200, date: "2026-03-01" },
      { base: "USD", target: "CAD", rate: 136500, date: "2026-03-01" },
      { base: "USD", target: "AUD", rate: 154800, date: "2026-03-01" },
      { base: "USD", target: "CHF", rate: 88500, date: "2026-03-01" },
    ];
    for (const fx of fxData) {
      await db.insert(exchangeRate).values({
        organizationId: org.id,
        baseCurrency: fx.base,
        targetCurrency: fx.target,
        rate: fx.rate,
        date: fx.date,
        source: "manual",
      });
    }
    console.log(`  ${fxData.length} exchange rates`);
  }

  // 42. Period Lock
  const existingLock = await db.query.periodLock.findFirst({
    where: eq(periodLock.organizationId, org.id),
  });
  if (!existingLock) {
    console.log("Creating period lock...");
    await db.insert(periodLock).values({
      organizationId: org.id,
      lockDate: "2025-12-31",
      lockedBy: userId,
      reason: "Year-end close for FY 2025",
    });
    console.log("  1 period lock (through 2025-12-31)");
  }

  // 43. Revenue Recognition
  const existingRevSchedule = await db.query.revenueSchedule.findFirst({
    where: eq(revenueSchedule.organizationId, org.id),
  });
  if (!existingRevSchedule) {
    console.log("Creating revenue recognition schedules...");
    const invoices2 = await db.query.invoice.findMany({
      where: eq(invoice.organizationId, org.id),
      limit: 2,
    });

    if (invoices2.length >= 2) {
      // Service revenue recognized over 3 months
      const [schedule1] = await db.insert(revenueSchedule).values({
        organizationId: org.id,
        invoiceId: invoices2[0].id,
        totalAmount: invoices2[0].total,
        recognizedAmount: Math.round(invoices2[0].total * 2 / 3),
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        method: "straight_line",
        status: "active",
        createdBy: userId,
      }).returning();

      const monthlyAmount = Math.round(invoices2[0].total / 3);
      for (let m = 1; m <= 3; m++) {
        await db.insert(revenueEntry).values({
          scheduleId: schedule1.id,
          periodDate: `2026-${String(m).padStart(2, "0")}-01`,
          amount: monthlyAmount,
          recognized: m <= 2,
          sortOrder: m,
        });
      }

      // Second schedule
      const [schedule2] = await db.insert(revenueSchedule).values({
        organizationId: org.id,
        invoiceId: invoices2[1].id,
        totalAmount: invoices2[1].total,
        recognizedAmount: Math.round(invoices2[1].total / 6),
        startDate: "2026-01-15",
        endDate: "2026-06-15",
        method: "straight_line",
        status: "active",
        createdBy: userId,
      }).returning();

      const monthly2 = Math.round(invoices2[1].total / 6);
      for (let m = 1; m <= 6; m++) {
        await db.insert(revenueEntry).values({
          scheduleId: schedule2.id,
          periodDate: `2026-${String(m).padStart(2, "0")}-15`,
          amount: monthly2,
          recognized: m <= 1,
          sortOrder: m,
        });
      }
      console.log("  2 revenue schedules with entries");
    }
  }

  console.log(`\nSeed complete! Organization: ${org.name}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
