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
  bill,
  billLine,
  bankAccount,
  bankTransaction,
  budget,
  budgetLine,
  budgetPeriod,
  project,
  timeEntry,
  fixedAsset,
  payrollEmployee,
  inventoryItem,
  expenseClaim,
  expenseItem,
} from "./schema";
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

  // 2. Demo User
  console.log("Creating demo user...");
  const passwordHash = await bcrypt.hash("password123", 12);
  const [demoUser] = await db
    .insert(users)
    .values({
      id: "demo-user-001",
      name: "Demo User",
      email: "demo@dubbl.app",
      passwordHash,
    })
    .onConflictDoNothing()
    .returning();

  if (!demoUser) {
    console.log("  Demo user already exists, skipping...");
    process.exit(0);
  }

  // 3. Organization
  console.log("Creating demo organization...");
  const [org] = await db
    .insert(organization)
    .values({
      id: "demo-org-001",
      name: "Demo Company",
      slug: "demo-company",
      defaultCurrency: "USD",
      fiscalYearStartMonth: 1,
    })
    .returning();

  await db.insert(member).values({
    organizationId: org.id,
    userId: demoUser.id,
    role: "owner",
  });

  await db.insert(subscription).values({
    organizationId: org.id,
    plan: "business",
    status: "active",
  });

  // 4. Fiscal Year
  console.log("Creating fiscal year...");
  const [fy] = await db
    .insert(fiscalYear)
    .values({
      organizationId: org.id,
      name: "FY 2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })
    .returning();

  // 5. Chart of Accounts
  console.log("Creating chart of accounts...");
  const accountMap = new Map<string, string>(); // code -> id
  for (const acct of ACCOUNTS) {
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
  }
  console.log(`  ${ACCOUNTS.length} accounts`);

  // 6. Tax Rates
  console.log("Creating tax rates...");
  const taxRateIds: string[] = [];
  for (const tr of TAX_RATES) {
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
  console.log(`  ${TAX_RATES.length} tax rates`);

  // 7. Contacts
  console.log("Creating contacts...");
  const contactIds: string[] = [];
  for (const c of CONTACTS) {
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
  console.log(`  ${CONTACTS.length} contacts`);

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
      createdBy: demoUser.id,
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
        createdBy: demoUser.id,
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
        createdBy: demoUser.id,
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
  }
  console.log(`  ${invoiceData.length} invoices`);

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

  // 13. Projects + Time Entries
  console.log("Creating projects...");
  const projectData = [
    { name: "Website Redesign", contactIdx: 0, budget: 2000000, rate: 15000, status: "active" as const },
    { name: "Mobile App MVP", contactIdx: 2, budget: 5000000, rate: 17500, status: "active" as const },
    { name: "API Integration", contactIdx: 8, budget: 800000, rate: 12500, status: "completed" as const },
  ];

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
        userId: demoUser.id,
        date: te.date,
        description: te.desc,
        minutes: te.mins,
        isBillable: true,
        hourlyRate: p.rate,
      });
    }
  }
  console.log(`  ${projectData.length} projects with time entries`);

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

  // 16. Inventory Items
  console.log("Creating inventory items...");
  const items = [
    { code: "PROD-001", name: "Widget A", sku: "WA-100", purchase: 1500, sale: 2999, qty: 150, reorder: 25 },
    { code: "PROD-002", name: "Widget B", sku: "WB-200", purchase: 2500, sale: 4999, qty: 75, reorder: 10 },
    { code: "PROD-003", name: "Gadget X", sku: "GX-300", purchase: 5000, sale: 9999, qty: 30, reorder: 5 },
    { code: "PROD-004", name: "Accessory Pack", sku: "AP-400", purchase: 500, sale: 1499, qty: 200, reorder: 50 },
    { code: "PROD-005", name: "Premium Kit", sku: "PK-500", purchase: 8000, sale: 14999, qty: 8, reorder: 10 },
  ];

  for (const item of items) {
    await db.insert(inventoryItem).values({
      organizationId: org.id,
      code: item.code,
      name: item.name,
      sku: item.sku,
      purchasePrice: item.purchase,
      salePrice: item.sale,
      quantityOnHand: item.qty,
      reorderPoint: item.reorder,
    });
  }
  console.log(`  ${items.length} inventory items`);

  // 17. Expense Claims
  console.log("Creating expense claims...");
  const [claim1] = await db
    .insert(expenseClaim)
    .values({
      organizationId: org.id,
      title: "January Travel Expenses",
      description: "Business trip to client site",
      submittedBy: demoUser.id,
      status: "approved",
      totalAmount: 85000,
      currencyCode: "USD",
      submittedAt: new Date("2026-01-28"),
      approvedAt: new Date("2026-01-30"),
      approvedBy: demoUser.id,
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
      submittedBy: demoUser.id,
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

  console.log("\nSeed complete! Demo credentials:");
  console.log("  Email: demo@dubbl.app");
  console.log("  Password: password123");
  console.log("  Organization: Demo Company");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
