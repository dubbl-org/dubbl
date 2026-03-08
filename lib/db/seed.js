"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var index_1 = require("./index");
var schema_1 = require("./schema");
var bcryptjs_1 = require("bcryptjs");
var CURRENCIES = [
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
var ACCOUNTS = [
    // Assets (1xxx)
    { code: "1000", name: "Cash", type: "asset", subType: "current" },
    { code: "1010", name: "Petty Cash", type: "asset", subType: "current" },
    { code: "1100", name: "Checking Account", type: "asset", subType: "bank" },
    { code: "1110", name: "Savings Account", type: "asset", subType: "bank" },
    { code: "1200", name: "Accounts Receivable", type: "asset", subType: "current" },
    { code: "1300", name: "Inventory", type: "asset", subType: "current" },
    { code: "1310", name: "Raw Materials", type: "asset", subType: "current" },
    { code: "1400", name: "Prepaid Expenses", type: "asset", subType: "current" },
    { code: "1410", name: "Prepaid Insurance", type: "asset", subType: "current" },
    { code: "1500", name: "Input Tax Credits", type: "asset", subType: "current" },
    { code: "1600", name: "Equipment", type: "asset", subType: "fixed" },
    { code: "1610", name: "Furniture & Fixtures", type: "asset", subType: "fixed" },
    { code: "1620", name: "Computer Equipment", type: "asset", subType: "fixed" },
    { code: "1630", name: "Vehicles", type: "asset", subType: "fixed" },
    { code: "1640", name: "Buildings", type: "asset", subType: "fixed" },
    { code: "1650", name: "Land", type: "asset", subType: "fixed" },
    { code: "1700", name: "Accumulated Depreciation - Equipment", type: "asset", subType: "fixed" },
    { code: "1710", name: "Accumulated Depreciation - Furniture", type: "asset", subType: "fixed" },
    { code: "1720", name: "Accumulated Depreciation - Computers", type: "asset", subType: "fixed" },
    { code: "1730", name: "Accumulated Depreciation - Vehicles", type: "asset", subType: "fixed" },
    // Liabilities (2xxx)
    { code: "2000", name: "Accounts Payable", type: "liability", subType: "current" },
    { code: "2100", name: "Accounts Payable - Trade", type: "liability", subType: "current" },
    { code: "2200", name: "Tax Payable", type: "liability", subType: "current" },
    { code: "2210", name: "GST/VAT Payable", type: "liability", subType: "current" },
    { code: "2220", name: "Income Tax Payable", type: "liability", subType: "current" },
    { code: "2300", name: "Accrued Expenses", type: "liability", subType: "current" },
    { code: "2310", name: "Wages Payable", type: "liability", subType: "current" },
    { code: "2400", name: "Unearned Revenue", type: "liability", subType: "current" },
    { code: "2500", name: "Short-Term Loans", type: "liability", subType: "current" },
    { code: "2600", name: "Credit Card Payable", type: "liability", subType: "current" },
    { code: "2700", name: "Long-Term Debt", type: "liability", subType: "non_current" },
    { code: "2800", name: "Mortgage Payable", type: "liability", subType: "non_current" },
    // Equity (3xxx)
    { code: "3000", name: "Owner's Equity", type: "equity", subType: "equity" },
    { code: "3100", name: "Retained Earnings", type: "equity", subType: "retained" },
    { code: "3200", name: "Owner's Drawings", type: "equity", subType: "equity" },
    { code: "3300", name: "Common Stock", type: "equity", subType: "equity" },
    // Revenue (4xxx)
    { code: "4000", name: "Sales Revenue", type: "revenue", subType: "operating" },
    { code: "4010", name: "Service Revenue", type: "revenue", subType: "operating" },
    { code: "4020", name: "Consulting Revenue", type: "revenue", subType: "operating" },
    { code: "4100", name: "Interest Income", type: "revenue", subType: "non_operating" },
    { code: "4200", name: "Rental Income", type: "revenue", subType: "non_operating" },
    { code: "4300", name: "Gain on Asset Disposal", type: "revenue", subType: "non_operating" },
    { code: "4900", name: "Other Revenue", type: "revenue", subType: "non_operating" },
    // Expenses (5xxx)
    { code: "5000", name: "Cost of Goods Sold", type: "expense", subType: "cogs" },
    { code: "5100", name: "Wages & Salaries", type: "expense", subType: "operating" },
    { code: "5110", name: "Employee Benefits", type: "expense", subType: "operating" },
    { code: "5120", name: "Payroll Tax", type: "expense", subType: "operating" },
    { code: "5200", name: "Rent Expense", type: "expense", subType: "operating" },
    { code: "5210", name: "Utilities", type: "expense", subType: "operating" },
    { code: "5220", name: "Internet & Phone", type: "expense", subType: "operating" },
    { code: "5300", name: "Office Supplies", type: "expense", subType: "operating" },
    { code: "5310", name: "Postage & Shipping", type: "expense", subType: "operating" },
    { code: "5400", name: "Insurance", type: "expense", subType: "operating" },
    { code: "5500", name: "Depreciation Expense", type: "expense", subType: "operating" },
    { code: "5600", name: "Marketing & Advertising", type: "expense", subType: "operating" },
    { code: "5700", name: "Professional Fees", type: "expense", subType: "operating" },
    { code: "5710", name: "Legal Fees", type: "expense", subType: "operating" },
    { code: "5720", name: "Accounting Fees", type: "expense", subType: "operating" },
    { code: "5800", name: "Travel Expense", type: "expense", subType: "operating" },
    { code: "5810", name: "Meals & Entertainment", type: "expense", subType: "operating" },
    { code: "5900", name: "Bank Fees & Charges", type: "expense", subType: "operating" },
    { code: "5910", name: "Interest Expense", type: "expense", subType: "non_operating" },
    { code: "5920", name: "Loss on Asset Disposal", type: "expense", subType: "non_operating" },
    { code: "5990", name: "Miscellaneous Expense", type: "expense", subType: "operating" },
];
// Contacts seed data
var CONTACTS = [
    { name: "Acme Corp", email: "accounts@acme.com", type: "customer", paymentTermsDays: 30 },
    { name: "Global Industries", email: "billing@globalind.com", type: "customer", paymentTermsDays: 14 },
    { name: "TechStart Inc", email: "finance@techstart.io", type: "customer", paymentTermsDays: 30 },
    { name: "Bright Solutions", email: "ap@brightsolutions.com", type: "customer", paymentTermsDays: 7 },
    { name: "Metro Services", email: "pay@metroservices.com", type: "customer", paymentTermsDays: 30 },
    { name: "Pinnacle Group", email: "invoices@pinnacle.com", type: "customer", paymentTermsDays: 45 },
    { name: "Riverdale Co", email: "ar@riverdale.co", type: "customer", paymentTermsDays: 30 },
    { name: "Summit Digital", email: "billing@summitdigital.com", type: "customer", paymentTermsDays: 14 },
    { name: "CloudBase Systems", email: "finance@cloudbase.dev", type: "customer", paymentTermsDays: 30 },
    { name: "Sterling Enterprises", email: "pay@sterling.com", type: "customer", paymentTermsDays: 60 },
    { name: "Office Depot", email: "orders@officedepot.com", type: "supplier", paymentTermsDays: 30 },
    { name: "AWS", email: "billing@aws.amazon.com", type: "supplier", paymentTermsDays: 30 },
    { name: "Landlord Properties", email: "rent@landlordprop.com", type: "supplier", paymentTermsDays: 1 },
    { name: "City Power & Water", email: "billing@citypw.com", type: "supplier", paymentTermsDays: 14 },
    { name: "Insurance Co", email: "premiums@insco.com", type: "supplier", paymentTermsDays: 30 },
    { name: "Tech Hardware Ltd", email: "sales@techhw.com", type: "supplier", paymentTermsDays: 30 },
    { name: "Marketing Agency", email: "invoices@marketing.co", type: "supplier", paymentTermsDays: 14 },
    { name: "Legal Partners LLP", email: "accounts@legalpartners.com", type: "supplier", paymentTermsDays: 30 },
    { name: "Freelancer Jane", email: "jane@freelance.com", type: "both", paymentTermsDays: 14 },
    { name: "ConsultCo", email: "billing@consultco.com", type: "both", paymentTermsDays: 30 },
];
var TAX_RATES = [
    { name: "GST 10%", rate: 1000, type: "both", isDefault: true },
    { name: "GST 5%", rate: 500, type: "both", isDefault: false },
    { name: "Sales Tax 8%", rate: 800, type: "sales", isDefault: false },
    { name: "VAT 20%", rate: 2000, type: "both", isDefault: false },
    { name: "Tax Exempt", rate: 0, type: "both", isDefault: false },
];
function seed() {
    return __awaiter(this, void 0, void 0, function () {
        var _i, CURRENCIES_1, c, passwordHash, demoUser, org, fy, accountMap, _a, ACCOUNTS_1, acct, row, taxRateIds, _b, TAX_RATES_1, tr, row, contactIds, _c, CONTACTS_1, c, row, entryNum, openingEntry, months, descriptions, i, e, revenue, expenses, _d, expenses_1, exp, e, invoiceData, invoiceIds, _e, invoiceData_1, inv, lineAmount, row, billData, billIds, _f, billData_1, b, row, checkingBank, bankTxns, runBal, _g, bankTxns_1, tx, payNum, _h, _j, inv, p, _k, _l, b, p, recurringData, _m, recurringData_1, rt, tmpl, bud, budgetAccounts, monthLabels, _loop_1, _o, budgetAccounts_1, ba, projectData, _p, projectData_1, p, proj, entries, _q, entries_1, te, assetData, _r, assetData_1, a, employees, _s, employees_1, emp, items, _t, items_1, item, claim1, claim2;
        return __generator(this, function (_u) {
            switch (_u.label) {
                case 0:
                    console.log("Seeding dubbl demo data...\n");
                    // 1. Currencies
                    console.log("Seeding currencies...");
                    _i = 0, CURRENCIES_1 = CURRENCIES;
                    _u.label = 1;
                case 1:
                    if (!(_i < CURRENCIES_1.length)) return [3 /*break*/, 4];
                    c = CURRENCIES_1[_i];
                    return [4 /*yield*/, index_1.db.insert(schema_1.currency).values(c).onConflictDoNothing({ target: schema_1.currency.code })];
                case 2:
                    _u.sent();
                    _u.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    console.log("  ".concat(CURRENCIES.length, " currencies"));
                    // 2. Demo User
                    console.log("Creating demo user...");
                    return [4 /*yield*/, bcryptjs_1.default.hash("password123", 12)];
                case 5:
                    passwordHash = _u.sent();
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.users)
                            .values({
                            id: "demo-user-001",
                            name: "Demo User",
                            email: "demo@dubbl.app",
                            passwordHash: passwordHash,
                        })
                            .onConflictDoNothing()
                            .returning()];
                case 6:
                    demoUser = (_u.sent())[0];
                    if (!demoUser) {
                        console.log("  Demo user already exists, skipping...");
                        process.exit(0);
                    }
                    // 3. Organization
                    console.log("Creating demo organization...");
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.organization)
                            .values({
                            id: "demo-org-001",
                            name: "Demo Company",
                            slug: "demo-company",
                            defaultCurrency: "USD",
                            fiscalYearStartMonth: 1,
                        })
                            .returning()];
                case 7:
                    org = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.member).values({
                            organizationId: org.id,
                            userId: demoUser.id,
                            role: "owner",
                        })];
                case 8:
                    _u.sent();
                    return [4 /*yield*/, index_1.db.insert(schema_1.subscription).values({
                            organizationId: org.id,
                            plan: "business",
                            status: "active",
                        })];
                case 9:
                    _u.sent();
                    // 4. Fiscal Year
                    console.log("Creating fiscal year...");
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.fiscalYear)
                            .values({
                            organizationId: org.id,
                            name: "FY 2026",
                            startDate: "2026-01-01",
                            endDate: "2026-12-31",
                        })
                            .returning()];
                case 10:
                    fy = (_u.sent())[0];
                    // 5. Chart of Accounts
                    console.log("Creating chart of accounts...");
                    accountMap = new Map();
                    _a = 0, ACCOUNTS_1 = ACCOUNTS;
                    _u.label = 11;
                case 11:
                    if (!(_a < ACCOUNTS_1.length)) return [3 /*break*/, 14];
                    acct = ACCOUNTS_1[_a];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.chartAccount)
                            .values({
                            organizationId: org.id,
                            code: acct.code,
                            name: acct.name,
                            type: acct.type,
                            subType: acct.subType,
                        })
                            .returning()];
                case 12:
                    row = (_u.sent())[0];
                    accountMap.set(acct.code, row.id);
                    _u.label = 13;
                case 13:
                    _a++;
                    return [3 /*break*/, 11];
                case 14:
                    console.log("  ".concat(ACCOUNTS.length, " accounts"));
                    // 6. Tax Rates
                    console.log("Creating tax rates...");
                    taxRateIds = [];
                    _b = 0, TAX_RATES_1 = TAX_RATES;
                    _u.label = 15;
                case 15:
                    if (!(_b < TAX_RATES_1.length)) return [3 /*break*/, 18];
                    tr = TAX_RATES_1[_b];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.taxRate)
                            .values({
                            organizationId: org.id,
                            name: tr.name,
                            rate: tr.rate,
                            type: tr.type,
                            isDefault: tr.isDefault,
                        })
                            .returning()];
                case 16:
                    row = (_u.sent())[0];
                    taxRateIds.push(row.id);
                    _u.label = 17;
                case 17:
                    _b++;
                    return [3 /*break*/, 15];
                case 18:
                    console.log("  ".concat(TAX_RATES.length, " tax rates"));
                    // 7. Contacts
                    console.log("Creating contacts...");
                    contactIds = [];
                    _c = 0, CONTACTS_1 = CONTACTS;
                    _u.label = 19;
                case 19:
                    if (!(_c < CONTACTS_1.length)) return [3 /*break*/, 22];
                    c = CONTACTS_1[_c];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.contact)
                            .values({
                            organizationId: org.id,
                            name: c.name,
                            email: c.email,
                            type: c.type,
                            paymentTermsDays: c.paymentTermsDays,
                        })
                            .returning()];
                case 20:
                    row = (_u.sent())[0];
                    contactIds.push(row.id);
                    _u.label = 21;
                case 21:
                    _c++;
                    return [3 /*break*/, 19];
                case 22:
                    console.log("  ".concat(CONTACTS.length, " contacts"));
                    // 8. Journal Entries (manual entries for opening balances)
                    console.log("Creating journal entries...");
                    entryNum = 1;
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.journalEntry)
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
                            .returning()];
                case 23:
                    openingEntry = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.journalLine).values([
                            { journalEntryId: openingEntry.id, accountId: accountMap.get("1100"), debitAmount: 5000000, creditAmount: 0 }, // $50,000 checking
                            { journalEntryId: openingEntry.id, accountId: accountMap.get("1110"), debitAmount: 2500000, creditAmount: 0 }, // $25,000 savings
                            { journalEntryId: openingEntry.id, accountId: accountMap.get("1200"), debitAmount: 1200000, creditAmount: 0 }, // $12,000 AR
                            { journalEntryId: openingEntry.id, accountId: accountMap.get("1620"), debitAmount: 800000, creditAmount: 0 }, // $8,000 computers
                            { journalEntryId: openingEntry.id, accountId: accountMap.get("3000"), debitAmount: 0, creditAmount: 9500000 }, // $95,000 equity
                        ])];
                case 24:
                    _u.sent();
                    months = ["2026-01-15", "2026-01-31", "2026-02-15", "2026-02-28"];
                    descriptions = [
                        "Service revenue - Acme Corp",
                        "Consulting income - Global Industries",
                        "Service revenue - TechStart",
                        "Software development - Summit Digital",
                    ];
                    i = 0;
                    _u.label = 25;
                case 25:
                    if (!(i < months.length)) return [3 /*break*/, 29];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.journalEntry)
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
                            .returning()];
                case 26:
                    e = (_u.sent())[0];
                    revenue = 250000 + Math.floor(Math.random() * 300000);
                    return [4 /*yield*/, index_1.db.insert(schema_1.journalLine).values([
                            { journalEntryId: e.id, accountId: accountMap.get("1200"), debitAmount: revenue, creditAmount: 0 },
                            { journalEntryId: e.id, accountId: accountMap.get("4010"), debitAmount: 0, creditAmount: revenue },
                        ])];
                case 27:
                    _u.sent();
                    _u.label = 28;
                case 28:
                    i++;
                    return [3 /*break*/, 25];
                case 29:
                    expenses = [
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
                    _d = 0, expenses_1 = expenses;
                    _u.label = 30;
                case 30:
                    if (!(_d < expenses_1.length)) return [3 /*break*/, 34];
                    exp = expenses_1[_d];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.journalEntry)
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
                            .returning()];
                case 31:
                    e = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.journalLine).values([
                            { journalEntryId: e.id, accountId: accountMap.get(exp.account), debitAmount: exp.amount, creditAmount: 0 },
                            { journalEntryId: e.id, accountId: accountMap.get("1100"), debitAmount: 0, creditAmount: exp.amount },
                        ])];
                case 32:
                    _u.sent();
                    _u.label = 33;
                case 33:
                    _d++;
                    return [3 /*break*/, 30];
                case 34:
                    console.log("  ".concat(entryNum - 1, " journal entries"));
                    // 9. Invoices
                    console.log("Creating invoices...");
                    invoiceData = [
                        { contact: 0, number: "INV-00001", date: "2026-01-10", due: "2026-02-09", status: "paid", desc: "Web Development", qty: 100, price: 15000, paid: 1500000 },
                        { contact: 1, number: "INV-00002", date: "2026-01-15", due: "2026-01-29", status: "paid", desc: "Consulting Services", qty: 100, price: 20000, paid: 2000000 },
                        { contact: 2, number: "INV-00003", date: "2026-01-20", due: "2026-02-19", status: "sent", desc: "API Integration", qty: 100, price: 800000, paid: 0 },
                        { contact: 3, number: "INV-00004", date: "2026-02-01", due: "2026-02-08", status: "overdue", desc: "Support Contract", qty: 100, price: 500000, paid: 0 },
                        { contact: 4, number: "INV-00005", date: "2026-02-05", due: "2026-03-07", status: "sent", desc: "Monthly Retainer", qty: 100, price: 300000, paid: 0 },
                        { contact: 5, number: "INV-00006", date: "2026-02-10", due: "2026-03-27", status: "draft", desc: "Data Migration", qty: 100, price: 1200000, paid: 0 },
                        { contact: 0, number: "INV-00007", date: "2026-02-15", due: "2026-03-17", status: "sent", desc: "Phase 2 Development", qty: 100, price: 2500000, paid: 0 },
                        { contact: 6, number: "INV-00008", date: "2026-02-18", due: "2026-03-20", status: "partial", desc: "Training Sessions", qty: 300, price: 50000, paid: 500000 },
                        { contact: 7, number: "INV-00009", date: "2026-02-20", due: "2026-03-06", status: "sent", desc: "UX Design", qty: 100, price: 350000, paid: 0 },
                        { contact: 8, number: "INV-00010", date: "2026-02-25", due: "2026-03-27", status: "draft", desc: "Cloud Architecture", qty: 100, price: 450000, paid: 0 },
                    ];
                    invoiceIds = [];
                    _e = 0, invoiceData_1 = invoiceData;
                    _u.label = 35;
                case 35:
                    if (!(_e < invoiceData_1.length)) return [3 /*break*/, 39];
                    inv = invoiceData_1[_e];
                    lineAmount = (inv.qty / 100) * inv.price;
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.invoice)
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
                            .returning()];
                case 36:
                    row = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.invoiceLine).values({
                            invoiceId: row.id,
                            description: inv.desc,
                            quantity: inv.qty,
                            unitPrice: inv.price,
                            amount: lineAmount,
                            accountId: accountMap.get("4010"),
                            sortOrder: 0,
                        })];
                case 37:
                    _u.sent();
                    invoiceIds.push({ id: row.id, contactIdx: inv.contact, status: inv.status, paid: inv.paid, total: lineAmount });
                    _u.label = 38;
                case 38:
                    _e++;
                    return [3 /*break*/, 35];
                case 39:
                    console.log("  ".concat(invoiceData.length, " invoices"));
                    // 10. Bills
                    console.log("Creating bills...");
                    billData = [
                        { contact: 10, number: "BILL-00001", date: "2026-01-03", due: "2026-02-02", status: "paid", desc: "Office Supplies Jan", amount: 15000, paid: 15000 },
                        { contact: 11, number: "BILL-00002", date: "2026-01-10", due: "2026-02-09", status: "paid", desc: "AWS January", amount: 45000, paid: 45000 },
                        { contact: 12, number: "BILL-00003", date: "2026-01-01", due: "2026-01-02", status: "paid", desc: "Rent January", amount: 350000, paid: 350000 },
                        { contact: 13, number: "BILL-00004", date: "2026-01-15", due: "2026-01-29", status: "paid", desc: "Utilities January", amount: 22000, paid: 22000 },
                        { contact: 14, number: "BILL-00005", date: "2026-02-01", due: "2026-03-03", status: "received", desc: "Insurance Q1", amount: 75000, paid: 0 },
                        { contact: 15, number: "BILL-00006", date: "2026-02-05", due: "2026-03-07", status: "received", desc: "New Laptop", amount: 150000, paid: 0 },
                        { contact: 16, number: "BILL-00007", date: "2026-02-10", due: "2026-02-24", status: "overdue", desc: "Marketing Campaign", amount: 75000, paid: 0 },
                        { contact: 17, number: "BILL-00008", date: "2026-02-15", due: "2026-03-17", status: "draft", desc: "Legal Consultation", amount: 50000, paid: 0 },
                        { contact: 11, number: "BILL-00009", date: "2026-02-10", due: "2026-03-12", status: "received", desc: "AWS February", amount: 48000, paid: 0 },
                        { contact: 12, number: "BILL-00010", date: "2026-02-01", due: "2026-02-02", status: "paid", desc: "Rent February", amount: 350000, paid: 350000 },
                    ];
                    billIds = [];
                    _f = 0, billData_1 = billData;
                    _u.label = 40;
                case 40:
                    if (!(_f < billData_1.length)) return [3 /*break*/, 44];
                    b = billData_1[_f];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.bill)
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
                            .returning()];
                case 41:
                    row = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.billLine).values({
                            billId: row.id,
                            description: b.desc,
                            quantity: 100,
                            unitPrice: b.amount,
                            amount: b.amount,
                            accountId: accountMap.get("5000"),
                            sortOrder: 0,
                        })];
                case 42:
                    _u.sent();
                    billIds.push({ id: row.id, contactIdx: b.contact, status: b.status, paid: b.paid });
                    _u.label = 43;
                case 43:
                    _f++;
                    return [3 /*break*/, 40];
                case 44:
                    console.log("  ".concat(billData.length, " bills"));
                    // 11. Bank Accounts + Transactions
                    console.log("Creating bank accounts...");
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.bankAccount)
                            .values({
                            organizationId: org.id,
                            accountName: "Business Checking",
                            accountNumber: "****4567",
                            bankName: "First National Bank",
                            currencyCode: "USD",
                            chartAccountId: accountMap.get("1100"),
                            balance: 5000000,
                        })
                            .returning()];
                case 45:
                    checkingBank = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.bankAccount)
                            .values({
                            organizationId: org.id,
                            accountName: "Business Savings",
                            accountNumber: "****8901",
                            bankName: "First National Bank",
                            currencyCode: "USD",
                            chartAccountId: accountMap.get("1110"),
                            balance: 2500000,
                        })];
                case 46:
                    _u.sent();
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.bankAccount)
                            .values({
                            organizationId: org.id,
                            accountName: "Business Credit Card",
                            accountNumber: "****2345",
                            bankName: "Capital One",
                            currencyCode: "USD",
                            chartAccountId: accountMap.get("2600"),
                            balance: -125000,
                        })];
                case 47:
                    _u.sent();
                    bankTxns = [
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
                    runBal = 0;
                    _g = 0, bankTxns_1 = bankTxns;
                    _u.label = 48;
                case 48:
                    if (!(_g < bankTxns_1.length)) return [3 /*break*/, 51];
                    tx = bankTxns_1[_g];
                    runBal += tx.amount;
                    return [4 /*yield*/, index_1.db.insert(schema_1.bankTransaction).values({
                            bankAccountId: checkingBank.id,
                            date: tx.date,
                            description: tx.desc,
                            amount: tx.amount,
                            balance: runBal,
                            reference: tx.ref,
                            status: tx.amount > 0 ? "reconciled" : "unreconciled",
                        })];
                case 49:
                    _u.sent();
                    _u.label = 50;
                case 50:
                    _g++;
                    return [3 /*break*/, 48];
                case 51:
                    console.log("  3 bank accounts, ".concat(bankTxns.length, " transactions"));
                    // 11b. Payments (received for paid invoices, made for paid bills)
                    console.log("Creating payments...");
                    payNum = 1;
                    _h = 0, _j = invoiceIds.filter(function (i) { return i.paid > 0; });
                    _u.label = 52;
                case 52:
                    if (!(_h < _j.length)) return [3 /*break*/, 56];
                    inv = _j[_h];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.payment)
                            .values({
                            organizationId: org.id,
                            contactId: contactIds[inv.contactIdx],
                            paymentNumber: "PAY-R".concat(String(payNum++).padStart(4, "0")),
                            type: "received",
                            date: "2026-01-25",
                            amount: inv.paid,
                            method: payNum % 2 === 0 ? "bank_transfer" : "card",
                            reference: "REF-".concat(payNum),
                            bankAccountId: checkingBank.id,
                            currencyCode: "USD",
                            createdBy: demoUser.id,
                        })
                            .returning()];
                case 53:
                    p = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.paymentAllocation).values({
                            paymentId: p.id,
                            documentType: "invoice",
                            documentId: inv.id,
                            amount: inv.paid,
                        })];
                case 54:
                    _u.sent();
                    _u.label = 55;
                case 55:
                    _h++;
                    return [3 /*break*/, 52];
                case 56:
                    _k = 0, _l = billIds.filter(function (b) { return b.paid > 0; });
                    _u.label = 57;
                case 57:
                    if (!(_k < _l.length)) return [3 /*break*/, 61];
                    b = _l[_k];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.payment)
                            .values({
                            organizationId: org.id,
                            contactId: contactIds[b.contactIdx],
                            paymentNumber: "PAY-M".concat(String(payNum++).padStart(4, "0")),
                            type: "made",
                            date: "2026-02-01",
                            amount: b.paid,
                            method: "bank_transfer",
                            reference: "CHK-".concat(payNum),
                            bankAccountId: checkingBank.id,
                            currencyCode: "USD",
                            createdBy: demoUser.id,
                        })
                            .returning()];
                case 58:
                    p = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.paymentAllocation).values({
                            paymentId: p.id,
                            documentType: "bill",
                            documentId: b.id,
                            amount: b.paid,
                        })];
                case 59:
                    _u.sent();
                    _u.label = 60;
                case 60:
                    _k++;
                    return [3 /*break*/, 57];
                case 61:
                    console.log("  ".concat(payNum - 1, " payments"));
                    // 11c. Recurring Templates
                    console.log("Creating recurring templates...");
                    recurringData = [
                        { name: "Monthly Retainer - Metro Services", type: "invoice", contactIdx: 4, freq: "monthly", desc: "Monthly Retainer", price: 300000 },
                        { name: "Quarterly Consulting - Pinnacle", type: "invoice", contactIdx: 5, freq: "quarterly", desc: "Quarterly Consulting", price: 600000 },
                        { name: "Monthly Rent", type: "bill", contactIdx: 12, freq: "monthly", desc: "Office Rent", price: 350000 },
                        { name: "Monthly AWS", type: "bill", contactIdx: 11, freq: "monthly", desc: "Cloud Hosting", price: 48000 },
                    ];
                    _m = 0, recurringData_1 = recurringData;
                    _u.label = 62;
                case 62:
                    if (!(_m < recurringData_1.length)) return [3 /*break*/, 66];
                    rt = recurringData_1[_m];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.recurringTemplate)
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
                            createdBy: demoUser.id,
                        })
                            .returning()];
                case 63:
                    tmpl = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.recurringTemplateLine).values({
                            templateId: tmpl.id,
                            description: rt.desc,
                            quantity: 100,
                            unitPrice: rt.price,
                            accountId: accountMap.get(rt.type === "invoice" ? "4010" : "5200"),
                            sortOrder: 0,
                        })];
                case 64:
                    _u.sent();
                    _u.label = 65;
                case 65:
                    _m++;
                    return [3 /*break*/, 62];
                case 66:
                    console.log("  ".concat(recurringData.length, " recurring templates"));
                    // 12. Budget
                    console.log("Creating budget...");
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.budget)
                            .values({
                            organizationId: org.id,
                            name: "FY 2026 Operating Budget",
                            fiscalYearId: fy.id,
                            startDate: "2026-01-01",
                            endDate: "2026-12-31",
                        })
                            .returning()];
                case 67:
                    bud = (_u.sent())[0];
                    budgetAccounts = [
                        { code: "4010", monthly: 500000 }, // $5,000/mo revenue
                        { code: "5100", monthly: 1200000 }, // $12,000/mo wages
                        { code: "5200", monthly: 350000 }, // $3,500/mo rent
                        { code: "5220", monthly: 10000 }, // $100/mo internet
                        { code: "5300", monthly: 15000 }, // $150/mo supplies
                        { code: "5400", monthly: 25000 }, // $250/mo insurance
                        { code: "5600", monthly: 50000 }, // $500/mo marketing
                    ];
                    monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    _loop_1 = function (ba) {
                        var bl;
                        return __generator(this, function (_v) {
                            switch (_v.label) {
                                case 0: return [4 /*yield*/, index_1.db.insert(schema_1.budgetLine).values({
                                        budgetId: bud.id,
                                        accountId: accountMap.get(ba.code),
                                        total: ba.monthly * 12,
                                    }).returning()];
                                case 1:
                                    bl = (_v.sent())[0];
                                    return [4 /*yield*/, index_1.db.insert(schema_1.budgetPeriod).values(monthLabels.map(function (label, i) { return ({
                                            budgetLineId: bl.id,
                                            label: "".concat(label, " 2026"),
                                            startDate: "2026-".concat(String(i + 1).padStart(2, "0"), "-01"),
                                            endDate: "2026-".concat(String(i + 1).padStart(2, "0"), "-").concat(new Date(2026, i + 1, 0).getDate()),
                                            amount: ba.monthly,
                                            sortOrder: i,
                                        }); }))];
                                case 2:
                                    _v.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _o = 0, budgetAccounts_1 = budgetAccounts;
                    _u.label = 68;
                case 68:
                    if (!(_o < budgetAccounts_1.length)) return [3 /*break*/, 71];
                    ba = budgetAccounts_1[_o];
                    return [5 /*yield**/, _loop_1(ba)];
                case 69:
                    _u.sent();
                    _u.label = 70;
                case 70:
                    _o++;
                    return [3 /*break*/, 68];
                case 71:
                    console.log("  1 budget with ".concat(budgetAccounts.length, " line items"));
                    // 13. Projects + Time Entries
                    console.log("Creating projects...");
                    projectData = [
                        { name: "Website Redesign", contactIdx: 0, budget: 2000000, rate: 15000, status: "active" },
                        { name: "Mobile App MVP", contactIdx: 2, budget: 5000000, rate: 17500, status: "active" },
                        { name: "API Integration", contactIdx: 8, budget: 800000, rate: 12500, status: "completed" },
                    ];
                    _p = 0, projectData_1 = projectData;
                    _u.label = 72;
                case 72:
                    if (!(_p < projectData_1.length)) return [3 /*break*/, 78];
                    p = projectData_1[_p];
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.project)
                            .values({
                            organizationId: org.id,
                            name: p.name,
                            contactId: contactIds[p.contactIdx],
                            budget: p.budget,
                            hourlyRate: p.rate,
                            status: p.status,
                            startDate: "2026-01-01",
                        })
                            .returning()];
                case 73:
                    proj = (_u.sent())[0];
                    entries = [
                        { date: "2026-01-15", desc: "Initial setup and planning", mins: 120 },
                        { date: "2026-01-20", desc: "Development work", mins: 480 },
                        { date: "2026-01-25", desc: "Code review and testing", mins: 180 },
                        { date: "2026-02-01", desc: "Feature implementation", mins: 360 },
                        { date: "2026-02-10", desc: "Bug fixes and polish", mins: 240 },
                    ];
                    _q = 0, entries_1 = entries;
                    _u.label = 74;
                case 74:
                    if (!(_q < entries_1.length)) return [3 /*break*/, 77];
                    te = entries_1[_q];
                    return [4 /*yield*/, index_1.db.insert(schema_1.timeEntry).values({
                            projectId: proj.id,
                            userId: demoUser.id,
                            date: te.date,
                            description: te.desc,
                            minutes: te.mins,
                            isBillable: true,
                            hourlyRate: p.rate,
                        })];
                case 75:
                    _u.sent();
                    _u.label = 76;
                case 76:
                    _q++;
                    return [3 /*break*/, 74];
                case 77:
                    _p++;
                    return [3 /*break*/, 72];
                case 78:
                    console.log("  ".concat(projectData.length, " projects with time entries"));
                    // 14. Fixed Assets
                    console.log("Creating fixed assets...");
                    assetData = [
                        { name: "MacBook Pro 16\"", number: "FA-001", date: "2026-01-15", price: 350000, life: 36, residual: 50000 },
                        { name: "Office Furniture Set", number: "FA-002", date: "2026-01-10", price: 250000, life: 60, residual: 25000 },
                    ];
                    _r = 0, assetData_1 = assetData;
                    _u.label = 79;
                case 79:
                    if (!(_r < assetData_1.length)) return [3 /*break*/, 82];
                    a = assetData_1[_r];
                    return [4 /*yield*/, index_1.db.insert(schema_1.fixedAsset).values({
                            organizationId: org.id,
                            name: a.name,
                            assetNumber: a.number,
                            purchaseDate: a.date,
                            purchasePrice: a.price,
                            residualValue: a.residual,
                            usefulLifeMonths: a.life,
                            depreciationMethod: "straight_line",
                            netBookValue: a.price,
                            assetAccountId: accountMap.get("1620"),
                            depreciationAccountId: accountMap.get("5500"),
                            accumulatedDepAccountId: accountMap.get("1720"),
                        })];
                case 80:
                    _u.sent();
                    _u.label = 81;
                case 81:
                    _r++;
                    return [3 /*break*/, 79];
                case 82:
                    console.log("  ".concat(assetData.length, " fixed assets"));
                    // 15. Payroll Employees
                    console.log("Creating payroll employees...");
                    employees = [
                        { name: "Alice Johnson", email: "alice@demo.com", number: "EMP-001", position: "Senior Developer", salary: 12000000, freq: "monthly" },
                        { name: "Bob Smith", email: "bob@demo.com", number: "EMP-002", position: "Designer", salary: 9600000, freq: "monthly" },
                        { name: "Carol Williams", email: "carol@demo.com", number: "EMP-003", position: "Project Manager", salary: 10800000, freq: "monthly" },
                        { name: "David Brown", email: "david@demo.com", number: "EMP-004", position: "Junior Developer", salary: 7200000, freq: "biweekly" },
                    ];
                    _s = 0, employees_1 = employees;
                    _u.label = 83;
                case 83:
                    if (!(_s < employees_1.length)) return [3 /*break*/, 86];
                    emp = employees_1[_s];
                    return [4 /*yield*/, index_1.db.insert(schema_1.payrollEmployee).values({
                            organizationId: org.id,
                            name: emp.name,
                            email: emp.email,
                            employeeNumber: emp.number,
                            position: emp.position,
                            salary: emp.salary,
                            payFrequency: emp.freq,
                            taxRate: 2200, // 22%
                            startDate: "2026-01-01",
                        })];
                case 84:
                    _u.sent();
                    _u.label = 85;
                case 85:
                    _s++;
                    return [3 /*break*/, 83];
                case 86:
                    console.log("  ".concat(employees.length, " employees"));
                    // 16. Inventory Items
                    console.log("Creating inventory items...");
                    items = [
                        { code: "PROD-001", name: "Widget A", sku: "WA-100", purchase: 1500, sale: 2999, qty: 150, reorder: 25 },
                        { code: "PROD-002", name: "Widget B", sku: "WB-200", purchase: 2500, sale: 4999, qty: 75, reorder: 10 },
                        { code: "PROD-003", name: "Gadget X", sku: "GX-300", purchase: 5000, sale: 9999, qty: 30, reorder: 5 },
                        { code: "PROD-004", name: "Accessory Pack", sku: "AP-400", purchase: 500, sale: 1499, qty: 200, reorder: 50 },
                        { code: "PROD-005", name: "Premium Kit", sku: "PK-500", purchase: 8000, sale: 14999, qty: 8, reorder: 10 },
                    ];
                    _t = 0, items_1 = items;
                    _u.label = 87;
                case 87:
                    if (!(_t < items_1.length)) return [3 /*break*/, 90];
                    item = items_1[_t];
                    return [4 /*yield*/, index_1.db.insert(schema_1.inventoryItem).values({
                            organizationId: org.id,
                            code: item.code,
                            name: item.name,
                            sku: item.sku,
                            purchasePrice: item.purchase,
                            salePrice: item.sale,
                            quantityOnHand: item.qty,
                            reorderPoint: item.reorder,
                        })];
                case 88:
                    _u.sent();
                    _u.label = 89;
                case 89:
                    _t++;
                    return [3 /*break*/, 87];
                case 90:
                    console.log("  ".concat(items.length, " inventory items"));
                    // 17. Expense Claims
                    console.log("Creating expense claims...");
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.expenseClaim)
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
                            .returning()];
                case 91:
                    claim1 = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.expenseItem).values([
                            {
                                expenseClaimId: claim1.id,
                                date: "2026-01-20",
                                description: "Flight - Round trip",
                                amount: 45000,
                                category: "Travel",
                                accountId: accountMap.get("5800"),
                                sortOrder: 0,
                            },
                            {
                                expenseClaimId: claim1.id,
                                date: "2026-01-21",
                                description: "Hotel - 2 nights",
                                amount: 30000,
                                category: "Accommodation",
                                accountId: accountMap.get("5800"),
                                sortOrder: 1,
                            },
                            {
                                expenseClaimId: claim1.id,
                                date: "2026-01-21",
                                description: "Client dinner",
                                amount: 10000,
                                category: "Meals",
                                accountId: accountMap.get("5810"),
                                sortOrder: 2,
                            },
                        ])];
                case 92:
                    _u.sent();
                    return [4 /*yield*/, index_1.db
                            .insert(schema_1.expenseClaim)
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
                            .returning()];
                case 93:
                    claim2 = (_u.sent())[0];
                    return [4 /*yield*/, index_1.db.insert(schema_1.expenseItem).values([
                            {
                                expenseClaimId: claim2.id,
                                date: "2026-02-01",
                                description: "GitHub Enterprise",
                                amount: 4900,
                                category: "Software",
                                accountId: accountMap.get("5220"),
                                sortOrder: 0,
                            },
                            {
                                expenseClaimId: claim2.id,
                                date: "2026-02-01",
                                description: "Figma Pro",
                                amount: 4500,
                                category: "Software",
                                accountId: accountMap.get("5220"),
                                sortOrder: 1,
                            },
                            {
                                expenseClaimId: claim2.id,
                                date: "2026-02-01",
                                description: "Slack Business+",
                                amount: 6500,
                                category: "Software",
                                accountId: accountMap.get("5220"),
                                sortOrder: 2,
                            },
                        ])];
                case 94:
                    _u.sent();
                    console.log("  2 expense claims");
                    console.log("\nSeed complete! Demo credentials:");
                    console.log("  Email: demo@dubbl.app");
                    console.log("  Password: password123");
                    console.log("  Organization: Demo Company");
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
seed().catch(function (err) {
    console.error("Seed failed:", err);
    process.exit(1);
});
