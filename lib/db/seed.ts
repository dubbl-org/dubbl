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
  invoice,
  invoiceLine,
  creditNote,
  creditNoteLine,
  bill,
  billLine,
  bankAccount,
  bankTransaction,
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
  payrollEmployee,
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
} from "./schema";
import { eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

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

// Chart of Accounts template
const ACCOUNTS = [
  // Assets (1xxx)
  { code: "1000", name: "Cash", type: "asset" as const, subType: "current" },
  { code: "1010", name: "Petty Cash", type: "asset" as const, subType: "current" },
  { code: "1100", name: "Checking Account", type: "asset" as const, subType: "bank" },
  { code: "1110", name: "Savings Account", type: "asset" as const, subType: "bank" },
  { code: "1200", name: "Accounts Receivable", type: "asset" as const, subType: "current" },
  { code: "1300", name: "Inventory", type: "asset" as const, subType: "current" },
  { code: "1310", name: "Raw Materials", type: "asset" as const, subType: "current" },
  { code: "1400", name: "Prepaid Expenses", type: "asset" as const, subType: "current" },
  { code: "1410", name: "Prepaid Insurance", type: "asset" as const, subType: "current" },
  { code: "1500", name: "Input Tax Credits", type: "asset" as const, subType: "current" },
  { code: "1600", name: "Equipment", type: "asset" as const, subType: "fixed" },
  { code: "1610", name: "Furniture & Fixtures", type: "asset" as const, subType: "fixed" },
  { code: "1620", name: "Computer Equipment", type: "asset" as const, subType: "fixed" },
  { code: "1630", name: "Vehicles", type: "asset" as const, subType: "fixed" },
  { code: "1640", name: "Buildings", type: "asset" as const, subType: "fixed" },
  { code: "1650", name: "Land", type: "asset" as const, subType: "fixed" },
  { code: "1700", name: "Accumulated Depreciation - Equipment", type: "asset" as const, subType: "fixed" },
  { code: "1710", name: "Accumulated Depreciation - Furniture", type: "asset" as const, subType: "fixed" },
  { code: "1720", name: "Accumulated Depreciation - Computers", type: "asset" as const, subType: "fixed" },
  { code: "1730", name: "Accumulated Depreciation - Vehicles", type: "asset" as const, subType: "fixed" },

  // Liabilities (2xxx)
  { code: "2000", name: "Accounts Payable", type: "liability" as const, subType: "current" },
  { code: "2100", name: "Accounts Payable - Trade", type: "liability" as const, subType: "current" },
  { code: "2200", name: "Tax Payable", type: "liability" as const, subType: "current" },
  { code: "2210", name: "GST/VAT Payable", type: "liability" as const, subType: "current" },
  { code: "2220", name: "Income Tax Payable", type: "liability" as const, subType: "current" },
  { code: "2300", name: "Accrued Expenses", type: "liability" as const, subType: "current" },
  { code: "2310", name: "Wages Payable", type: "liability" as const, subType: "current" },
  { code: "2400", name: "Unearned Revenue", type: "liability" as const, subType: "current" },
  { code: "2500", name: "Short-Term Loans", type: "liability" as const, subType: "current" },
  { code: "2600", name: "Credit Card Payable", type: "liability" as const, subType: "current" },
  { code: "2700", name: "Long-Term Debt", type: "liability" as const, subType: "non_current" },
  { code: "2800", name: "Mortgage Payable", type: "liability" as const, subType: "non_current" },

  // Equity (3xxx)
  { code: "3000", name: "Owner's Equity", type: "equity" as const, subType: "equity" },
  { code: "3100", name: "Retained Earnings", type: "equity" as const, subType: "retained" },
  { code: "3200", name: "Owner's Drawings", type: "equity" as const, subType: "equity" },
  { code: "3300", name: "Common Stock", type: "equity" as const, subType: "equity" },

  // Revenue (4xxx)
  { code: "4000", name: "Sales Revenue", type: "revenue" as const, subType: "operating" },
  { code: "4010", name: "Service Revenue", type: "revenue" as const, subType: "operating" },
  { code: "4020", name: "Consulting Revenue", type: "revenue" as const, subType: "operating" },
  { code: "4100", name: "Interest Income", type: "revenue" as const, subType: "non_operating" },
  { code: "4200", name: "Rental Income", type: "revenue" as const, subType: "non_operating" },
  { code: "4300", name: "Gain on Asset Disposal", type: "revenue" as const, subType: "non_operating" },
  { code: "4900", name: "Other Revenue", type: "revenue" as const, subType: "non_operating" },

  // Expenses (5xxx)
  { code: "5000", name: "Cost of Goods Sold", type: "expense" as const, subType: "cogs" },
  { code: "5100", name: "Wages & Salaries", type: "expense" as const, subType: "operating" },
  { code: "5110", name: "Employee Benefits", type: "expense" as const, subType: "operating" },
  { code: "5120", name: "Payroll Tax", type: "expense" as const, subType: "operating" },
  { code: "5200", name: "Rent Expense", type: "expense" as const, subType: "operating" },
  { code: "5210", name: "Utilities", type: "expense" as const, subType: "operating" },
  { code: "5220", name: "Internet & Phone", type: "expense" as const, subType: "operating" },
  { code: "5300", name: "Office Supplies", type: "expense" as const, subType: "operating" },
  { code: "5310", name: "Postage & Shipping", type: "expense" as const, subType: "operating" },
  { code: "5400", name: "Insurance", type: "expense" as const, subType: "operating" },
  { code: "5500", name: "Depreciation Expense", type: "expense" as const, subType: "operating" },
  { code: "5600", name: "Marketing & Advertising", type: "expense" as const, subType: "operating" },
  { code: "5700", name: "Professional Fees", type: "expense" as const, subType: "operating" },
  { code: "5710", name: "Legal Fees", type: "expense" as const, subType: "operating" },
  { code: "5720", name: "Accounting Fees", type: "expense" as const, subType: "operating" },
  { code: "5800", name: "Travel Expense", type: "expense" as const, subType: "operating" },
  { code: "5810", name: "Meals & Entertainment", type: "expense" as const, subType: "operating" },
  { code: "5900", name: "Bank Fees & Charges", type: "expense" as const, subType: "operating" },
  { code: "5910", name: "Interest Expense", type: "expense" as const, subType: "non_operating" },
  { code: "5920", name: "Loss on Asset Disposal", type: "expense" as const, subType: "non_operating" },
  { code: "5990", name: "Miscellaneous Expense", type: "expense" as const, subType: "operating" },
];

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
  const existingMember =
    (await db.query.member.findFirst({
      where: eq(member.userId, (
        await db.query.users.findFirst({
          where: eq(users.email, "dev@dubbl.local"),
          columns: { id: true },
        })
      )?.id ?? ""),
      with: { user: true, organization: true },
    })) ??
    (await db.query.member.findFirst({
      where: eq(member.role, "owner"),
      with: { user: true, organization: true },
    }));

  let userId: string;
  let org: { id: string; name: string };

  if (existingMember) {
    userId = existingMember.userId;
    org = { id: existingMember.organizationId, name: existingMember.organization.name };
    console.log(`  Using existing user: ${existingMember.user.email}`);
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
      plan: "business",
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
  const existingCreditNotes = await db.query.creditNote.findFirst({
    where: eq(creditNote.organizationId, org.id),
  });
  const hasTransactionalData = !!existingEntries;

  const invoiceIds: { id: string; contactIdx: number; status: string; paid: number; total: number }[] = [];

  if (hasTransactionalData) {
    console.log("\nTransactional data already exists, skipping journal entries, invoices, bills, etc.");
  }

  if (!hasTransactionalData) {
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

  // 9. Invoices
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
  } // end if (!hasTransactionalData) - invoices block

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

  if (!hasTransactionalData) {
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

  const billIds: { id: string; contactIdx: number; status: string; paid: number }[] = [];
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

  // 11. Bank Accounts + Transactions
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

  // 12. Budget
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

  // 13. Projects + Time Entries + Tasks + Milestones + Notes
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

  // 14. Fixed Assets
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

  // 15. Payroll Employees
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

  // 17. Expense Claims
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
  } // end if (!hasTransactionalData) - bills through expense claims

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

  console.log(`\nSeed complete! Organization: ${org.name}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
