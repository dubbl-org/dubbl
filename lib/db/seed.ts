/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Demo data seed for the "Demo Company" (demo@dubbl.dev / password123).
 *
 *   pnpm db:seed            seed a database that has no Demo Company yet
 *   pnpm db:seed --reset    delete the Demo Company (and everything in it) and rebuild it
 *
 * The demo is a small Austin, TX software & hardware reseller with six closed
 * months of history plus the current month to date. Every date is relative to
 * the day the seed runs, so the data never goes stale.
 *
 * Almost everything is created through the app's own API route handlers
 * (called in-process with a temporary API key) or its shared helpers, so the
 * seeded books are exactly what the app itself would post: balanced journal
 * entries, payroll through the real payroll calculation/posting code,
 * depreciation through postAssetDepreciation, opening balances through the
 * Opening balances feature, bank lines imported from statement files and then
 * matched/categorized, and statement checks that balance. Only things the app
 * has no write path for (users, the org shell, notification/delivery/reminder
 * logs, W-9 details) are inserted directly.
 */
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import {
  apiKey,
  bankTransaction,
  chartAccount,
  contact,
  currency,
  fixedAsset,
  invoice,
  invoiceLine,
  bill,
  journalEntry,
  journalLine,
  member,
  notification,
  organization,
  payrollRun,
  reminderLog,
  subscription,
  taxRate,
  users,
  webhookDelivery,
} from "./schema";
import { getIsoCurrencies } from "../currency/iso4217";
import { syncSystemAccounts } from "./system-accounts";
import { ensureTaxRatesSeeded } from "../api/tax-profiles";
import { postAssetDepreciation } from "../fixed-assets/post-depreciation";
import { deleteOrganization } from "../api/delete-organization";
import { resolveMemberContext, type AuthContext } from "../api/auth-context";

const RESET = process.argv.includes("--reset");

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000002";
const DEMO_EMAIL = "demo@dubbl.dev";
const ORG = DEMO_ORG_ID;

// ---------------------------------------------------------------------------
// Dates: six closed months (0..5) plus the current month (6) up to today.
// ---------------------------------------------------------------------------
const NOW = new Date();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = isoDate(NOW);
const CUR = 6;
const LAST = CUR - 1;

function monthStart(i: number): Date {
  return new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - CUR + i, 1));
}
function day(i: number, dd: number): string {
  const s = monthStart(i);
  const last = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), Math.min(dd, last))));
}
const monthEnd = (i: number) => day(i, 31);
function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
const weekday = (date: string) => new Date(date + "T00:00:00Z").getUTCDay();
/** A banking day in month i near day dd (weekends roll forward, or back at month end). */
function bizDay(i: number, dd: number): string {
  let d = day(i, dd);
  const wd = weekday(d);
  if (wd === 6) d = addDays(d, 2);
  else if (wd === 0) d = addDays(d, 1);
  if (d.slice(0, 7) !== day(i, 1).slice(0, 7)) {
    d = day(i, dd);
    d = addDays(d, weekday(d) === 6 ? -1 : -2);
  }
  return d;
}
function monthIndexOf(date: string): number {
  const s = monthStart(0);
  const [y, m] = date.split("-").map(Number);
  return (y - s.getUTCFullYear()) * 12 + (m - 1 - s.getUTCMonth());
}
const monthName = (i: number) =>
  monthStart(i).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
const monthLabel = (i: number) =>
  monthStart(i).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const OPENING_DATE = addDays(day(0, 1), -1);

// Deterministic pseudo-random numbers so every seed run looks the same.
let rngState = 20260401;
function rand(): number {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

// ---------------------------------------------------------------------------
// In-process API calls through the real route handlers.
// ---------------------------------------------------------------------------
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/v1");
let API_TOKEN = "";
const routeCache = new Map<string, any>();

async function loadRoute(p: string): Promise<any> {
  let mod = routeCache.get(p);
  if (!mod) {
    mod = await import(pathToFileURL(path.join(API_ROOT, p, "route.ts")).href);
    routeCache.set(p, mod);
  }
  return mod;
}

async function api(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  p: string,
  body?: unknown,
  params: Record<string, string> = {},
  query = ""
): Promise<any> {
  const mod = await loadRoute(p);
  const handler = mod[method];
  if (!handler) throw new Error(`No ${method} handler for ${p}`);
  const url =
    "http://localhost/api/v1/" + p.replace(/\[(\w+)\]/g, (_, k) => params[k] ?? k) + (query ? `?${query}` : "");
  const req = new Request(url, {
    method,
    headers: {
      authorization: `Bearer ${API_TOKEN}`,
      "x-organization-id": ORG,
      "content-type": "application/json",
    },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
  });
  const res: Response = await handler(req, { params: Promise.resolve(params) });
  const text = await res.text();
  let json: any = text;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // keep raw text
  }
  if (!res.ok) {
    throw new Error(`${method} /${p} ${JSON.stringify(params)} -> ${res.status}: ${text.slice(0, 600)}`);
  }
  return json;
}
const post = (p: string, body?: unknown, params?: Record<string, string>) => api("POST", p, body ?? {}, params);
const patch = (p: string, body: unknown, params?: Record<string, string>) => api("PATCH", p, body, params);
const get = (p: string, params?: Record<string, string>, query?: string) => api("GET", p, undefined, params, query);
const del = (p: string, params?: Record<string, string>) => api("DELETE", p, undefined, params);

/** The first object with an id in a response ({ invoice }, { data: {...} }, ...). */
function ent(json: any): any {
  if (json && typeof json === "object") {
    if (typeof json.id === "string") return json;
    for (const v of Object.values(json)) {
      if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).id === "string") return v;
    }
    for (const v of Object.values(json)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner = ent(v);
        if (inner) return inner;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lookups filled in during setup.
// ---------------------------------------------------------------------------
const A: Record<string, string> = {}; // account code -> id
const C: Record<string, string> = {}; // contact key -> id
const TERMS: Record<string, number> = {};
const T: Record<string, string> = {}; // tax key -> id
const I: Record<string, { id: string; sale: number; cost: number }> = {}; // item code -> item
const W: Record<string, string> = {}; // warehouse key -> id
const BANK: Record<Bank, string> = { checking: "", savings: "", card: "" };
const BANK_CODE: Record<Bank, string> = { checking: "1100", savings: "1110", card: "2600" };
const INV: Record<string, any> = {};
const BILLS: Record<string, any> = {};
const PROJ: Record<string, string> = {};
const CC: Record<string, string> = {};
const ASSETS: string[] = [];
let ctx: AuthContext;
let memberId = "";

const acct = (code: string) => {
  const id = A[code];
  if (!id) throw new Error(`Account ${code} not found`);
  return id;
};

// ---------------------------------------------------------------------------
// Dated task queue + bank statement feed.
// ---------------------------------------------------------------------------
interface Task {
  date: string;
  seq: number;
  label: string;
  fn: () => Promise<void>;
}
const tasks: Task[] = [];
let taskSeq = 0;
function at(date: string, label: string, fn: () => Promise<void>) {
  if (date > TODAY) return;
  tasks.push({ date, seq: taskSeq++, label, fn });
}

type Bank = "checking" | "savings" | "card";
type Action =
  | { kind: "invoice"; key: string }
  | { kind: "bill"; key: string }
  | { kind: "journal"; jeId: string }
  | { kind: "payment"; paymentId: string }
  | { kind: "categorize"; code: string; contact?: string; memo?: string }
  | { kind: "transfer"; pair: string; to: Bank }
  | { kind: "counter"; pair: string }
  | { kind: "open" };
interface FeedLine {
  bank: Bank;
  date: string;
  description: string;
  amount: number | null; // signed cents; null = the open amount of the matched document
  payee: string;
  ref: string;
  seq: number;
  action: Action;
  txId?: string;
}
const feed: FeedLine[] = [];
let refSeq = 0;
function bankLine(bank: Bank, date: string, description: string, amount: number | null, action: Action, payee = "") {
  if (date > TODAY) return;
  refSeq++;
  feed.push({
    bank,
    date,
    description,
    amount,
    payee,
    ref: `${bank === "checking" ? "CHK" : bank === "savings" ? "SAV" : "CC"}${String(refSeq).padStart(5, "0")}`,
    seq: refSeq,
    action,
  });
}

async function bankLeg(jeId: string, code: string): Promise<number> {
  const rows = await db
    .select({ d: journalLine.debitAmount, c: journalLine.creditAmount })
    .from(journalLine)
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(and(eq(journalLine.journalEntryId, jeId), eq(chartAccount.code, code)));
  return rows.reduce((s, r) => s + r.d - r.c, 0);
}
async function lastJeHitting(code: string): Promise<string> {
  const [row] = await db
    .select({ id: journalEntry.id })
    .from(journalEntry)
    .innerJoin(journalLine, eq(journalLine.journalEntryId, journalEntry.id))
    .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
    .where(and(eq(journalEntry.organizationId, ORG), eq(chartAccount.code, code)))
    .orderBy(desc(journalEntry.createdAt), desc(journalEntry.entryNumber))
    .limit(1);
  if (!row) throw new Error(`No journal entry on ${code}`);
  return row.id;
}
/** Push a checking line for a journal the app just posted to the bank ledger. */
async function bankLineForJournal(jeId: string, bank: Bank, date: string, description: string, payee = "") {
  const amount = await bankLeg(jeId, BANK_CODE[bank]);
  if (amount !== 0) bankLine(bank, date, description, amount, { kind: "journal", jeId }, payee);
}

// ---------------------------------------------------------------------------
// Document helpers (prices in the request are decimal dollars, like the UI).
// ---------------------------------------------------------------------------
interface Ln {
  d: string;
  q?: number;
  p: number; // unit price, dollars
  acct: string;
  tax?: "TX" | "EX" | "NONE";
  item?: string;
  wh?: string;
  project?: string;
  cc?: string;
  disc?: number; // basis points
}
function docLine(l: Ln) {
  return {
    description: l.d,
    quantity: l.q ?? 1,
    unitPrice: l.p,
    accountId: acct(l.acct),
    taxRateId: l.tax === "TX" ? T.tx : l.tax === "NONE" ? T.none : T.exempt,
    discountPercent: l.disc ?? 0,
    ...(l.item ? { inventoryItemId: I[l.item].id, warehouseId: W[l.wh ?? "main"] } : {}),
    ...(l.project ? { projectId: PROJ[l.project] } : {}),
    ...(l.cc ? { costCenterId: CC[l.cc] } : {}),
  };
}

async function salesInvoice(
  key: string,
  o: { contact: string; date: string; lines: Ln[]; ref?: string; notes?: string; currency?: string; terms?: number; send?: boolean }
) {
  const created = (
    await post("invoices", {
      contactId: C[o.contact],
      issueDate: o.date,
      dueDate: addDays(o.date, o.terms ?? TERMS[o.contact] ?? 30),
      reference: o.ref ?? null,
      notes: o.notes ?? null,
      currencyCode: o.currency ?? "USD",
      lines: o.lines.map(docLine),
    })
  ).invoice;
  INV[key] = o.send === false ? created : (await post("invoices/[id]/send", {}, { id: created.id })).invoice;
  return INV[key];
}

async function supplierBill(
  key: string,
  o: { contact: string; date: string; lines: Ln[]; ref?: string; notes?: string; terms?: number; po?: string[]; receive?: boolean }
) {
  const created = (
    await post("bills", {
      contactId: C[o.contact],
      issueDate: o.date,
      dueDate: addDays(o.date, o.terms ?? TERMS[o.contact] ?? 30),
      reference: o.ref ?? null,
      notes: o.notes ?? null,
      currencyCode: "USD",
      purchaseOrderIds: o.po,
      confirmDuplicate: true,
      lines: o.lines.map((l) => {
        const line: any = docLine(l);
        return line;
      }),
    })
  ).bill;
  BILLS[key] = o.receive === false ? created : (await post("bills/[id]/receive", {}, { id: created.id })).bill;
  return BILLS[key];
}

const invoicePaid = (key: string, bank: Bank, date: string, description: string, payee: string) =>
  bankLine(bank, date, description, null, { kind: "invoice", key }, payee);
const billPaid = (key: string, bank: Bank, date: string, description: string, payee: string) =>
  bankLine(bank, date, description, null, { kind: "bill", key }, payee);

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const CUSTOMERS = [
  { key: "acme", name: "Acme Corp", email: "accounts@acme.com", terms: 30, phone: "+1 512 555 0101", line1: "1200 Barton Springs Rd", city: "Austin", state: "TX", zip: "78704" },
  { key: "global", name: "Global Industries", email: "billing@globalind.com", terms: 14, phone: "+1 713 555 0142", line1: "800 Louisiana St", city: "Houston", state: "TX", zip: "77002" },
  { key: "techstart", name: "TechStart Inc", email: "finance@techstart.io", terms: 30, phone: "+1 415 555 0188", line1: "535 Mission St", city: "San Francisco", state: "CA", zip: "94105" },
  { key: "bright", name: "Bright Solutions", email: "ap@brightsolutions.com", terms: 7, phone: "+1 303 555 0119", line1: "1600 Wynkoop St", city: "Denver", state: "CO", zip: "80202" },
  { key: "metro", name: "Metro Services", email: "pay@metroservices.com", terms: 30, phone: "+1 214 555 0170", line1: "2100 Ross Ave", city: "Dallas", state: "TX", zip: "75201" },
  { key: "pinnacle", name: "Pinnacle Group", email: "invoices@pinnacle.com", terms: 45, phone: "+1 312 555 0133", line1: "233 S Wacker Dr", city: "Chicago", state: "IL", zip: "60606" },
  { key: "riverdale", name: "Riverdale Co", email: "ar@riverdale.co", terms: 30, phone: "+1 503 555 0107", line1: "1120 NW Couch St", city: "Portland", state: "OR", zip: "97209" },
  { key: "summit", name: "Summit Digital", email: "billing@summitdigital.com", terms: 14, phone: "+1 512 555 0164", line1: "301 Congress Ave", city: "Austin", state: "TX", zip: "78701" },
  { key: "cloudbase", name: "CloudBase Systems", email: "finance@cloudbase.dev", terms: 30, phone: "+1 206 555 0125", line1: "400 Pine St", city: "Seattle", state: "WA", zip: "98101" },
  { key: "sterling", name: "Sterling Enterprises", email: "pay@sterling.com", terms: 60, phone: "+1 212 555 0196", line1: "350 Park Ave", city: "New York", state: "NY", zip: "10022" },
  { key: "nordlicht", name: "Nordlicht GmbH", email: "buchhaltung@nordlicht.de", terms: 30, phone: "+49 30 5550 1234", line1: "Friedrichstrasse 68", city: "Berlin", state: "", zip: "10117", country: "DE", currency: "EUR", taxNumber: "DE298765432" },
  { key: "walkin", name: "Walk-in Customer", email: null, terms: 0, phone: null, line1: "", city: "", state: "", zip: "" },
];
const SUPPLIERS = [
  { key: "officedepot", name: "Office Depot", email: "orders@officedepot.com", terms: 30, city: "Austin", state: "TX" },
  { key: "aws", name: "AWS", email: "billing@aws.amazon.com", terms: 0, city: "Seattle", state: "WA" },
  { key: "landlord", name: "Landlord Properties", email: "rent@landlordprop.com", terms: 0, city: "Austin", state: "TX" },
  { key: "citypw", name: "City Power & Water", email: "billing@citypw.com", terms: 14, city: "Austin", state: "TX" },
  { key: "insurance", name: "Insurance Co", email: "premiums@insco.com", terms: 14, city: "Hartford", state: "CT" },
  { key: "techhw", name: "Tech Hardware Ltd", email: "sales@techhw.com", terms: 30, city: "San Jose", state: "CA" },
  { key: "marketing", name: "Marketing Agency", email: "invoices@marketing.co", terms: 14, city: "Austin", state: "TX" },
  { key: "legal", name: "Legal Partners LLP", email: "accounts@legalpartners.com", terms: 30, city: "Austin", state: "TX" },
  { key: "jane", name: "Freelancer Jane", email: "jane@freelance.com", terms: 14, city: "Round Rock", state: "TX" },
  { key: "consultco", name: "ConsultCo", email: "billing@consultco.com", terms: 30, city: "Dallas", state: "TX" },
];

const EMPLOYEES = [
  { name: "Alice Johnson", email: "alice@demo-company.com", num: "EMP-001", position: "Senior Developer", department: "Engineering", salary: 11000000, start: "2023-02-01" },
  { name: "Bob Smith", email: "bob@demo-company.com", num: "EMP-002", position: "Product Designer", department: "Design", salary: 7800000, start: "2023-06-12" },
  { name: "Carol Williams", email: "carol@demo-company.com", num: "EMP-003", position: "Project Manager", department: "Operations", salary: 8800000, start: "2024-01-08" },
  { name: "David Brown", email: "david@demo-company.com", num: "EMP-004", position: "Junior Developer", department: "Engineering", salary: 6200000, start: "2025-03-03" },
];

// Monthly drift on the USD base rates (scaled 1e6: 920000 = 0.92 EUR per USD).
const FX_BASE: Record<string, number> = {
  EUR: 920000,
  GBP: 790000,
  JPY: 150200000,
  CAD: 1365000,
  AUD: 1548000,
  CHF: 885000,
};

// ===========================================================================
// 1. Bootstrap: currencies, user, organization shell, temporary API key
// ===========================================================================
async function bootstrap() {
  console.log("Currencies...");
  const currencies = getIsoCurrencies();
  for (const c of currencies) {
    await db
      .insert(currency)
      .values(c)
      .onConflictDoUpdate({
        target: currency.code,
        set: { name: c.name, symbol: c.symbol, decimalPlaces: c.decimalPlaces },
      });
  }

  console.log("Demo user...");
  let user = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
  if (!user) {
    const passwordHash = await bcrypt.hash("password123", 12);
    [user] = await db
      .insert(users)
      .values({ id: DEMO_USER_ID, name: "Demo User", email: DEMO_EMAIL, passwordHash, isSiteAdmin: true })
      .returning();
  }
  const userId = user.id;

  const existing = await db.query.organization.findFirst({ where: eq(organization.id, ORG) });
  if (existing) {
    if (!RESET) {
      console.error(
        `\n"${existing.name}" already exists. Re-run with --reset to delete it and seed it again:\n  pnpm db:seed --reset\n`
      );
      process.exit(1);
    }
    console.log(`Deleting existing "${existing.name}" (--reset)...`);
    await deleteOrganization(ORG);
  }

  console.log("Demo Company...");
  await db.insert(organization).values({
    id: ORG,
    name: "Demo Company",
    slug: "demo-company",
    country: "United States",
    countryCode: "US",
    businessType: "company",
    legalEntityType: "llc",
    defaultCurrency: "USD",
    fiscalYearStartMonth: 1,
    taxId: "84-1234567",
    addressStreet: "500 Congress Ave, Suite 210",
    addressCity: "Austin",
    addressState: "TX",
    addressPostalCode: "78701",
    addressCountry: "US",
    contactPhone: "+1 512 555 0100",
    contactEmail: "hello@demo-company.com",
    contactWebsite: "https://demo-company.com",
    defaultPaymentTerms: "net_30",
    industrySector: "Software & IT services",
    taxRegime: "us_sales_tax",
    onboardingCompletedAt: new Date(),
  });
  await db.insert(member).values({ organizationId: ORG, userId, role: "owner" });
  await db.insert(subscription).values({ organizationId: ORG, plan: "premium", status: "active" });

  // Temporary API key: the route handlers authenticate it like any API client.
  API_TOKEN = `dk_${randomBytes(24).toString("hex")}`;
  await db.insert(apiKey).values({
    organizationId: ORG,
    name: "Demo seed (temporary)",
    keyHash: createHash("sha256").update(API_TOKEN).digest("hex"),
    keyPrefix: API_TOKEN.slice(0, 10),
    createdBy: userId,
  });

  const resolved = await resolveMemberContext(userId, ORG);
  if (!resolved) throw new Error("Could not resolve the demo member");
  ctx = resolved;
  const m = await db.query.member.findFirst({ where: and(eq(member.organizationId, ORG), eq(member.userId, userId)) });
  memberId = m!.id;
  return userId;
}

// ===========================================================================
// 2. Setup: chart, tax, contacts, banks, opening balances, catalogs
// ===========================================================================
async function setup() {
  console.log("Chart of accounts and tax rates...");
  await syncSystemAccounts(ORG, { currencyCode: "USD", countryCode: "US" });
  const accounts = await db.select({ id: chartAccount.id, code: chartAccount.code }).from(chartAccount).where(eq(chartAccount.organizationId, ORG));
  for (const a of accounts) A[a.code] = a.id;

  await ensureTaxRatesSeeded(ORG, "US");
  const tx = ent(
    await post("tax-rates", {
      name: "Texas Sales Tax 8.25%",
      rate: 825,
      type: "both",
      kind: "sales_tax_us",
      recoverablePercent: 0,
      isDefault: true,
    })
  );
  T.tx = tx.id;
  const rates = await db.select().from(taxRate).where(eq(taxRate.organizationId, ORG));
  T.exempt = rates.find((r) => r.name === "Tax Exempt")!.id;
  T.none = rates.find((r) => r.name === "No Tax")!.id;

  console.log("Fiscal years and exchange rates...");
  const years = new Set<number>();
  for (let i = -1; i <= CUR; i++) years.add(Number(day(i, 1).slice(0, 4)));
  for (const y of [...years].sort()) {
    await post("fiscal-years", { name: `FY ${y}`, startDate: `${y}-01-01`, endDate: `${y}-12-31` });
  }
  const fxRates: any[] = [];
  const fxDates = [OPENING_DATE, ...Array.from({ length: CUR + 1 }, (_, i) => day(i, 1)), TODAY];
  for (const date of [...new Set(fxDates)]) {
    for (const [code, base] of Object.entries(FX_BASE)) {
      const drift = 1 + (rand() - 0.5) * 0.02;
      fxRates.push({ baseCurrency: "USD", targetCurrency: code, rate: Math.round(base * drift), date });
    }
  }
  await post("exchange-rates", { rates: fxRates });

  console.log("Contacts...");
  for (const c of CUSTOMERS) {
    const created = ent(
      await post("contacts", {
        name: c.name,
        email: c.email,
        phone: c.phone,
        type: "customer",
        paymentTermsDays: c.terms,
        currencyCode: c.currency ?? "USD",
        taxNumber: c.taxNumber ?? null,
        addresses: c.line1
          ? { billing: { line1: c.line1, city: c.city, state: c.state, postalCode: c.zip, country: c.country ?? "US" } }
          : undefined,
      })
    );
    C[c.key] = created.id;
    TERMS[c.key] = c.terms;
  }
  for (const s of SUPPLIERS) {
    const created = ent(
      await post("contacts", {
        name: s.name,
        email: s.email,
        type: "supplier",
        paymentTermsDays: s.terms,
        currencyCode: "USD",
        addresses: { billing: { city: s.city, state: s.state, country: "US" } },
      })
    );
    C[s.key] = created.id;
    TERMS[s.key] = s.terms;
  }
  await patch("contacts/[id]", { creditLimit: 5000000, defaultRevenueAccountId: acct("4010") }, { id: C.acme });
  await patch("contacts/[id]", { creditLimit: 500000 }, { id: C.bright });
  await patch("contacts/[id]", { isTaxExempt: true, notes: "Out-of-state customer: no Texas sales tax." }, { id: C.cloudbase });
  await patch("contacts/[id]", { defaultExpenseAccountId: acct("5230") }, { id: C.aws });
  await patch("contacts/[id]", { defaultExpenseAccountId: acct("5200") }, { id: C.landlord });
  for (const k of ["jane", "consultco"]) {
    await patch("contacts/[id]", { is1099Vendor: true }, { id: C[k] });
  }
  // W-9 details have no REST route (the MCP tools set them directly).
  await db.update(contact).set({ w9TaxClassification: "individual", taxIdentifier: "XXX-XX-4821" }).where(eq(contact.id, C.jane));
  await db.update(contact).set({ w9TaxClassification: "llc", taxIdentifier: "75-3344556" }).where(eq(contact.id, C.consultco));
  const people: [string, any][] = [
    ["acme", { name: "Sarah Chen", email: "sarah.chen@acme.com", phone: "+1 512 555 0102", jobTitle: "Accounts Payable Lead", isPrimary: true }],
    ["acme", { name: "Tom Becker", email: "tom.becker@acme.com", jobTitle: "VP Engineering" }],
    ["sterling", { name: "Priya Patel", email: "priya@sterling.com", jobTitle: "Finance Director", isPrimary: true }],
    ["techstart", { name: "Leo Martins", email: "leo@techstart.io", jobTitle: "CTO", isPrimary: true }],
    ["nordlicht", { name: "Jonas Weber", email: "j.weber@nordlicht.de", jobTitle: "Leiter Buchhaltung", isPrimary: true }],
  ];
  for (const [k, p] of people) await post("contacts/[id]/people", p, { id: C[k] });

  console.log("Bank accounts and opening balances...");
  BANK.checking = ent(
    await post("bank-accounts", {
      accountName: "Business Checking",
      accountNumber: "****4521",
      bankName: "First National Bank",
      currencyCode: "USD",
      countryCode: "US",
      accountType: "checking",
      color: "#0f766e",
      chartAccountId: acct("1100"),
      balance: 4825000,
    })
  ).id;
  BANK.savings = ent(
    await post("bank-accounts", {
      accountName: "Business Savings",
      accountNumber: "****8832",
      bankName: "First National Bank",
      currencyCode: "USD",
      countryCode: "US",
      accountType: "savings",
      color: "#1d4ed8",
      chartAccountId: acct("1110"),
      balance: 2500000,
    })
  ).id;
  BANK.card = ent(
    await post("bank-accounts", {
      accountName: "Business Credit Card",
      accountNumber: "****9910",
      bankName: "Chase",
      currencyCode: "USD",
      countryCode: "US",
      accountType: "credit_card",
      color: "#b45309",
      chartAccountId: acct("2600"),
      balance: -125000,
    })
  ).id;
  stmtBal.checking = 4825000;
  stmtBal.savings = 2500000;
  stmtBal.card = -125000;

  await post("opening-balances", {
    date: OPENING_DATE,
    balances: [
      { accountId: acct("1100"), debitAmount: 4825000, creditAmount: 0 },
      { accountId: acct("1110"), debitAmount: 2500000, creditAmount: 0 },
      { accountId: acct("2600"), debitAmount: 0, creditAmount: 125000 },
      { accountId: acct("3000"), debitAmount: 0, creditAmount: 5000000 },
      { accountId: acct("3100"), debitAmount: 0, creditAmount: 2200000 },
    ],
  });

  console.log("Cost centers, tags, teams, roles...");
  for (const [key, code, name, parent] of [
    ["eng", "ENG", "Engineering", null],
    ["infra", "ENG-INFRA", "Engineering - Infrastructure", "eng"],
    ["sales", "SALES", "Sales & Marketing", null],
    ["ops", "OPS", "Operations", null],
  ] as const) {
    CC[key] = ent(await post("cost-centers", { code, name, parentId: parent ? CC[parent] : null })).id;
  }
  for (const [name, color, description] of [
    ["VIP", "#7c3aed", "Key accounts"],
    ["Hardware", "#0891b2", "Hardware resale"],
    ["Recurring", "#16a34a", "Recurring revenue"],
    ["Follow up", "#dc2626", "Needs a call"],
  ]) {
    await post("tags", { name, color, description });
  }
  for (const [name, description, color] of [
    ["Engineering", "Product and client engineering", "#2563eb"],
    ["Design", "Product and UX design", "#db2777"],
    ["Sales", "Sales and account management", "#16a34a"],
  ]) {
    const team = ent(await post("teams", { name, description, color }));
    // The demo user leads engineering and helps with sales.
    if (name !== "Design") await post("teams/[id]/members", { memberId }, { id: team.id });
  }
  await post("roles", {
    name: "Bookkeeper",
    description: "Day-to-day bookkeeping: entries, banking, invoices and bills",
    permissions: ["create:entries", "edit:entries", "manage:contacts", "manage:invoices", "manage:bills", "manage:banking", "manage:payments"],
  });
  await post("roles", {
    name: "Sales Rep",
    description: "Contacts, quotes and invoices",
    permissions: ["manage:contacts", "manage:invoices"],
  });

  console.log("Warehouses and inventory...");
  W.main = ent(await post("warehouses", { name: "Main Warehouse", code: "MAIN", address: "500 Congress Ave, Austin, TX 78701", isDefault: true })).id;
  W.east = ent(await post("warehouses", { name: "East Distribution Center", code: "EAST", address: "9800 E Parmer Ln, Manor, TX 78653" })).id;
  const cats: Record<string, string> = {};
  for (const [name, color, description] of [
    ["Displays", "#2563eb", "Monitors and stands"],
    ["Peripherals", "#16a34a", "Keyboards, mice and docks"],
    ["Cables", "#64748b", "Cables and adapters"],
    ["Kits", "#9333ea", "Assembled bundles"],
  ]) {
    cats[name] = ent(await post("inventory/categories", { name, color, description })).id;
  }
  const items = [
    { code: "MON-27", name: "27in 4K Monitor", sku: "MON-27-4K", cat: "Displays", cost: 28000, sale: 42000, reorder: 5 },
    { code: "STAND-01", name: "Monitor Stand", sku: "STD-ALU-01", cat: "Displays", cost: 3500, sale: 6500, reorder: 5 },
    { code: "KB-01", name: "Wireless Keyboard", sku: "KB-WL-01", cat: "Peripherals", cost: 4500, sale: 7900, reorder: 10 },
    { code: "MS-01", name: "Wireless Mouse", sku: "MS-WL-01", cat: "Peripherals", cost: 2200, sale: 3900, reorder: 10 },
    { code: "DOCK-01", name: "USB-C Docking Station", sku: "DCK-USBC-01", cat: "Peripherals", cost: 9500, sale: 15900, reorder: 4 },
    { code: "CBL-01", name: "HDMI Cable 2m", sku: "CBL-HDMI-2M", cat: "Cables", cost: 600, sale: 1500, reorder: 20 },
    { code: "KIT-001", name: "Workstation Starter Kit", sku: "KIT-WS-001", cat: "Kits", cost: 0, sale: 79900, reorder: 2 },
  ];
  for (const it of items) {
    // Stock arrives through supplier bills, so every item starts at zero.
    const created = ent(
      await post("inventory", {
        code: it.code,
        name: it.name,
        sku: it.sku,
        category: it.cat,
        categoryId: cats[it.cat],
        purchasePrice: it.cost,
        salePrice: it.sale,
        costAccountId: acct("5000"),
        revenueAccountId: acct("4000"),
        inventoryAccountId: acct("1300"),
        quantityOnHand: 0,
        reorderPoint: it.reorder,
      })
    );
    I[it.code] = { id: created.id, sale: it.sale, cost: it.cost };
  }
  for (const [name, sku] of [["US Layout", "KB-WL-01-US"], ["UK Layout", "KB-WL-01-UK"]]) {
    await post("inventory/[id]/variants", { name, sku, purchasePrice: 4500, salePrice: 7900, options: { Layout: name.replace(" Layout", "") } }, { id: I["KB-01"].id });
  }
  for (const code of ["MON-27", "KB-01", "MS-01", "DOCK-01", "CBL-01"]) {
    await post("inventory/[id]/suppliers", { contactId: C.techhw, supplierCode: `TH-${code}`, leadTimeDays: 7, purchasePrice: I[code].cost, isPreferred: true }, { id: I[code].id });
  }
  await post("inventory/[id]/suppliers", { contactId: C.techhw, supplierCode: "TH-STAND-01", leadTimeDays: 7, purchasePrice: 3500, isPreferred: true }, { id: I["STAND-01"].id });
  await post("inventory/[id]/suppliers", { contactId: C.officedepot, supplierCode: "OD-88412", leadTimeDays: 3, purchasePrice: 3900, isPreferred: false }, { id: I["STAND-01"].id });
  const bom = await post("inventory/bom", {
    assemblyItemId: I["KIT-001"].id,
    name: "Workstation Starter Kit v1",
    description: "Monitor, stand, keyboard, mouse and cable, boxed",
    laborCostCents: 2500,
    overheadCostCents: 500,
  });
  BOM_ID = ent(bom).id;
  for (const [code, qty] of [["MON-27", 1], ["STAND-01", 1], ["KB-01", 1], ["MS-01", 1], ["CBL-01", 1]] as const) {
    await post("inventory/bom/[id]/components", { componentItemId: I[code].id, quantity: qty }, { id: BOM_ID });
  }

  console.log("Fixed asset categories...");
  ASSET_CAT.furniture = ent(
    await post("asset-categories", {
      name: "Furniture & Fixtures",
      defaultDepreciationMethod: "straight_line",
      defaultConvention: "full_month",
      defaultUsefulLifeMonths: 84,
      defaultResidualValue: 0,
      assetAccountId: acct("1610"),
      depreciationAccountId: acct("5500"),
      accumulatedDepAccountId: acct("1710"),
    })
  ).id;
  ASSET_CAT.computers = ent(
    await post("asset-categories", {
      name: "Computer Equipment",
      defaultDepreciationMethod: "straight_line",
      defaultConvention: "full_month",
      defaultUsefulLifeMonths: 36,
      defaultResidualValue: 0,
      assetAccountId: acct("1620"),
      depreciationAccountId: acct("5500"),
      accumulatedDepAccountId: acct("1720"),
    })
  ).id;
  ASSET_CAT.equipment = ent(
    await post("asset-categories", {
      name: "Office Equipment",
      defaultDepreciationMethod: "straight_line",
      defaultConvention: "full_month",
      defaultUsefulLifeMonths: 60,
      defaultResidualValue: 0,
      assetAccountId: acct("1600"),
      depreciationAccountId: acct("5500"),
      accumulatedDepAccountId: acct("1700"),
    })
  ).id;

  console.log("Payroll setup...");
  await api("PUT", "payroll/settings", {
    defaultTaxRate: 2200,
    defaultCurrency: "USD",
    salaryExpenseAccountCode: "5100",
    taxPayableAccountCode: "2220",
    bankAccountCode: "1100",
    autoApprovalEnabled: true,
    sutaRateBp: 270,
    sutaWageBaseCents: 900000,
  });
  for (const e of EMPLOYEES) {
    await post("payroll/employees", {
      name: e.name,
      email: e.email,
      employeeNumber: e.num,
      position: e.position,
      department: e.department,
      salary: e.salary,
      payFrequency: "monthly",
      taxRate: 2200,
      startDate: e.start,
      compensationType: "salary",
      currency: "USD",
    });
  }
  CONTRACTOR_ID = ent(
    await post("payroll/contractors", {
      name: "Marco Rossi",
      email: "marco@rossi-research.com",
      company: "Rossi UX Research",
      taxId: "XX-XXX6620",
      hourlyRate: 9500,
      currency: "USD",
    })
  ).id;

  console.log("Projects, CRM, templates...");
  PROJ.mobile = ent(
    await post("projects", {
      name: "Mobile App",
      description: "iOS and Android app for TechStart's field teams",
      contactId: C.techstart,
      status: "active",
      priority: "high",
      billingType: "hourly",
      color: "#2563eb",
      budget: 6000000,
      hourlyRate: 16500,
      estimatedHours: 360,
      startDate: day(0, 1),
      endDate: day(CUR + 3, 28),
      category: "Client work",
      enableMilestones: true,
    })
  ).id;
  PROJ.website = ent(
    await post("projects", {
      name: "Website Redesign",
      description: "New marketing site and customer portal for Acme",
      contactId: C.acme,
      status: "active",
      priority: "medium",
      billingType: "milestone",
      color: "#16a34a",
      budget: 4500000,
      fixedPrice: 4500000,
      startDate: day(0, 1),
      endDate: day(CUR, 28),
      category: "Client work",
      enableMilestones: true,
    })
  ).id;
  PROJ.internal = ent(
    await post("projects", {
      name: "Internal Tools",
      description: "Ops dashboards and automation",
      status: "active",
      priority: "low",
      billingType: "non_billable",
      color: "#64748b",
      startDate: day(2, 1),
      category: "Internal",
    })
  ).id;
  for (const p of Object.values(PROJ)) {
    await post("projects/[id]/members", { memberId, role: "manager" }, { id: p }).catch(() => undefined);
  }
  const mobileTasks = [
    ["Auth and onboarding flow", "done", "high"],
    ["Offline sync for job sheets", "done", "urgent"],
    ["Push notifications", "in_progress", "medium"],
    ["Photo capture and upload", "in_review", "medium"],
    ["App Store submission", "todo", "high"],
    ["Analytics dashboard", "backlog", "low"],
  ] as const;
  for (const [title, status, priority] of mobileTasks) {
    await post("projects/[id]/tasks", { title, status, priority, estimatedMinutes: 960, dueDate: day(CUR + 1, 15) }, { id: PROJ.mobile });
  }
  for (const [title, dueDate, amount] of [
    ["Milestone 1: Discovery & design", day(0, 8), 1500000],
    ["Milestone 2: Build", day(2, 3), 2000000],
    ["Milestone 3: Launch & handover", day(4, 4), 1000000],
  ] as const) {
    await post("projects/[id]/milestones", { title, dueDate, amount, description: title }, { id: PROJ.website });
  }
  await post("projects/[id]/notes", { content: "Client prefers a weekly status email on Fridays.", isPinned: true }, { id: PROJ.mobile });
  await post("projects/[id]/labels", { name: "Client", color: "#2563eb" }, { id: PROJ.mobile });

  const stages = [
    { id: "lead", name: "Lead", color: "#94a3b8" },
    { id: "qualified", name: "Qualified", color: "#3b82f6" },
    { id: "proposal", name: "Proposal", color: "#8b5cf6" },
    { id: "negotiation", name: "Negotiation", color: "#f59e0b" },
    // Won and Lost (closed_won / closed_lost) are added by the API.
  ];
  const pipeline = ent(await post("crm/pipelines", { name: "Sales Pipeline", stages, isDefault: true }));
  const deals = [
    { title: "Sterling - process automation phase 2", contact: "sterling", stage: "proposal", value: 1800000, prob: 60, source: "referral" },
    { title: "Pinnacle - advisory renewal", contact: "pinnacle", stage: "negotiation", value: 4800000, prob: 75, source: "other" },
    { title: "TechStart - mobile app phase 2", contact: "techstart", stage: "qualified", value: 3500000, prob: 40, source: "referral" },
    { title: "CloudBase - hardware refresh", contact: "cloudbase", stage: "lead", value: 1200000, prob: 20, source: "website" },
    { title: "Acme - customer portal", contact: "acme", stage: "won", value: 650000, prob: 100, source: "referral", won: true },
    { title: "Summit - hardware refresh", contact: "summit", stage: "lost", value: 900000, prob: 0, source: "cold_outreach", lost: "Went with a cheaper supplier" },
  ];
  for (const d of deals) {
    const deal = ent(
      await post("crm/deals", {
        pipelineId: pipeline.id,
        stageId: d.stage === "won" || d.stage === "lost" ? "negotiation" : d.stage,
        contactId: C[d.contact],
        title: d.title,
        valueCents: d.value,
        currency: "USD",
        probability: d.prob,
        expectedCloseDate: day(CUR + 1, 15),
        source: d.source,
      })
    );
    await post("crm/deals/[id]/activities", { type: "call", content: "Intro call: scope, budget and timeline." }, { id: deal.id });
    if (d.won) await post("crm/deals/[id]/won", {}, { id: deal.id });
    if (d.lost) await post("crm/deals/[id]/lost", { reason: d.lost }, { id: deal.id });
  }

  await post("document-templates", {
    name: "Standard Invoice",
    type: "invoice",
    accentColor: "#0f172a",
    showTaxBreakdown: true,
    showPaymentTerms: true,
    notes: "Thank you for your business.",
    bankDetails: "First National Bank - Routing 111000025 - Account ****4521",
    paymentInstructions: "Pay by ACH or wire. Please quote the invoice number.",
    isDefault: true,
  });
  await post("document-templates", { name: "Quote", type: "quote", accentColor: "#0f172a", showTaxBreakdown: true, notes: "Valid for 30 days." });
  for (const [name, color] of [["Receipts", "blue"], ["Contracts", "green"], ["Tax filings", "orange"]]) {
    await post("documents/folders", { name, color }).catch(async () => post("documents/folders", { name }));
  }
}
let BOM_ID = "";
let CONTRACTOR_ID = "";
const ASSET_CAT: Record<string, string> = {};
const stmtBal: Record<Bank, number> = { checking: 0, savings: 0, card: 0 };

// ===========================================================================
// 3. The story: dated tasks for each month
// ===========================================================================
function schedule() {
  for (let i = 0; i <= CUR; i++) monthly(i);
  oneOffs();
}

function monthly(i: number) {
  const mn = monthName(i);
  const closed = i < CUR;

  // Rent, due on the 1st, paid by ACH.
  at(day(i, 1), "rent", async () => {
    await supplierBill(`rent-${i}`, {
      contact: "landlord",
      date: day(i, 1),
      terms: 0,
      ref: `RENT-${day(i, 1).slice(0, 7)}`,
      lines: [{ d: `Office rent - ${mn}`, p: 3500, acct: "5200" }],
    });
    billPaid(`rent-${i}`, "checking", bizDay(i, 1), "ACH DEBIT LANDLORD PROPERTIES RENT", "Landlord Properties");
  });

  // Metro Services monthly retainer.
  at(day(i, 1), "metro retainer", async () => {
    await salesInvoice(`metro-${i}`, {
      contact: "metro",
      date: day(i, 1),
      ref: "Retainer",
      lines: [{ d: `Monthly retainer - ${mn}`, p: 7500, acct: "4010", cc: "ops" }],
    });
    invoicePaid(`metro-${i}`, "checking", bizDay(i, 26), "ACH CREDIT METRO SERVICES", "Metro Services");
  });

  // AWS, charged to the card.
  at(day(i, 3), "aws", async () => {
    const amount = between(118000, 139000) / 100;
    await supplierBill(`aws-${i}`, {
      contact: "aws",
      date: day(i, 3),
      terms: 0,
      ref: `AWS-${day(i, 3).replace(/-/g, "").slice(0, 6)}`,
      lines: [{ d: `AWS usage - ${mn}`, p: amount, acct: "5230", cc: "infra" }],
    });
    billPaid(`aws-${i}`, "card", day(i, 3), "AWS EMEA AWS.AMAZON.COM", "AWS");
  });

  // Global Industries consulting hours.
  at(day(i, 5), "global consulting", async () => {
    const hours = between(28, 38);
    await salesInvoice(`global-${i}`, {
      contact: "global",
      date: day(i, 5),
      lines: [{ d: `Consulting - ${monthName(i - 1)} (${hours} hours)`, q: hours, p: 225, acct: "4020", cc: "eng" }],
    });
    invoicePaid(`global-${i}`, "checking", bizDay(i, 19), "ACH CREDIT GLOBAL INDUSTRIES", "Global Industries");
  });

  // Utilities.
  at(day(i, 8), "utilities", async () => {
    await supplierBill(`util-${i}`, {
      contact: "citypw",
      date: day(i, 8),
      ref: `CPW-${String(88000 + i)}`,
      lines: [{ d: `Electricity and water - ${monthName(i - 1)}`, p: between(36000, 46000) / 100, acct: "5210" }],
    });
    billPaid(`util-${i}`, "checking", bizDay(i, 20), "ACH DEBIT CITY POWER & WATER", "City Power & Water");
  });

  // TechStart Mobile App: weekly time, billed at month end.
  for (const dd of [3, 10, 17, 24]) {
    at(day(i, dd), "time entry", async () => {
      await post(
        "projects/[id]/time-entries",
        {
          date: day(i, dd),
          description: ["Sprint work: features and fixes", "API integration", "QA and release prep", "Client workshop and planning"][dd % 4],
          minutes: between(10, 15) * 60,
          isBillable: true,
          hourlyRate: 16500,
        },
        { id: PROJ.mobile }
      );
    });
  }
  if (closed) {
    at(monthEnd(i), "project invoice", async () => {
      const res = await post("projects/[id]/invoice", { issueDate: monthEnd(i), dueDate: addDays(monthEnd(i), 30), notes: `Mobile App development - ${mn}` }, { id: PROJ.mobile });
      const created = ent(res);
      // Project invoices come without an income account on their lines; book
      // the time to Service Revenue so sending posts a complete entry.
      await db
        .update(invoiceLine)
        .set({ accountId: acct("4010"), taxRateId: T.exempt })
        .where(and(eq(invoiceLine.invoiceId, created.id), isNull(invoiceLine.accountId)));
      INV[`techstart-${i}`] = (await post("invoices/[id]/send", {}, { id: created.id })).invoice;
      invoicePaid(`techstart-${i}`, "checking", bizDay(i + 1, 24), "WIRE IN TECHSTART INC", "TechStart Inc");
    });
  }

  // Walk-in counter sales (taxable), deposited the same day.
  for (const [dd, mix] of [
    [12, [["KB-01", 2], ["MS-01", 2]]],
    [22, [["CBL-01", 4], ["MS-01", 1], ["DOCK-01", 1]]],
  ] as const) {
    at(day(i, dd), "cash sale", async () => {
      const receipt = ent(
        await post("sales-receipts", {
          contactId: C.walkin,
          date: day(i, dd),
          reference: "Counter sale",
          currencyCode: "USD",
          bankAccountId: BANK.checking,
          lines: mix.map(([code, q]) => ({
            description: itemName(code),
            quantity: q,
            unitPrice: I[code].sale / 100,
            accountId: acct("4000"),
            taxRateId: T.tx,
            inventoryItemId: I[code].id,
            warehouseId: W.main,
          })),
        })
      );
      await post("sales-receipts/[id]/post", {}, { id: receipt.id });
      const je = await lastJeHitting("1100");
      await bankLineForJournal(je, "checking", day(i, dd), "SQUARE DEPOSIT COUNTER SALES", "Square");
    });
  }

  // Freelancer Jane (1099): design support, paid the following month.
  if (closed) {
    at(day(i, 25), "jane", async () => {
      await supplierBill(`jane-${i}`, {
        contact: "jane",
        date: day(i, 25),
        ref: `JD-${String(201 + i)}`,
        lines: [{ d: `UI design support - ${mn}`, p: 1800, acct: "5130", cc: "eng" }],
      });
      if (i < LAST) billPaid(`jane-${i}`, "checking", bizDay(i + 1, 8), "ACH DEBIT JANE DOE DESIGN", "Freelancer Jane");
    });
  }

  // ConsultCo (1099) every other month.
  if (i % 2 === 1 && closed) {
    at(day(i, 15), "consultco", async () => {
      await supplierBill(`consultco-${i}`, {
        contact: "consultco",
        date: day(i, 15),
        ref: `CC-${String(4410 + i)}`,
        lines: [{ d: `Finance systems advisory - ${mn}`, p: 2500, acct: "5700" }],
      });
      if (i < LAST) billPaid(`consultco-${i}`, "checking", bizDay(i + 1, 12), "ACH DEBIT CONSULTCO LLC", "ConsultCo");
    });
  }

  // Card spend categorized straight from the feed.
  const card = (dd: number, desc: string, cents: number, code: string, payee: string) =>
    at(day(i, dd), "card spend", async () => {
      bankLine("card", day(i, dd), desc, -cents, { kind: "categorize", code }, payee);
    });
  card(4, "ZOOM.US 888-799-9666", 14990, "5230", "Zoom");
  card(6, "GOOGLE WORKSPACE", 7200, "5230", "Google");
  card(9, "SLACK TECHNOLOGIES", 8750, "5230", "Slack");
  card(11, "STAPLES 00123 AUSTIN TX", between(3500, 9500), "5300", "Staples");
  card(14, "UBER TRIP HELP.UBER.COM", between(1800, 4200), "5800", "Uber");
  card(21, "UBER TRIP HELP.UBER.COM", between(1800, 4200), "5800", "Uber");
  if (i % 2 === 1) card(16, "LINKEDIN ADS", 30000, "5600", "LinkedIn");

  if (!closed) return;

  // Month end: payroll through the real run builder and posting code.
  at(monthEnd(i), "payroll", async () => {
    const run = ent(await post("payroll/runs", { payPeriodStart: day(i, 1), payPeriodEnd: monthEnd(i) }));
    await post("payroll/runs/[id]/process", {}, { id: run.id });
    const done = await db.query.payrollRun.findFirst({ where: eq(payrollRun.id, run.id) });
    if (!done?.journalEntryId) throw new Error("Payroll run was not posted");
    await bankLineForJournal(done.journalEntryId, "checking", monthEnd(i), "ACH PAYROLL NET PAY", "Payroll");
    // Deposit the withheld income tax and FICA (EFTPS) on the 15th.
    const incomeTax = -(await bankLeg(done.journalEntryId, "2220"));
    const fica = -(await bankLeg(done.journalEntryId, "2235"));
    const depositDate = bizDay(i + 1, 15);
    if (depositDate <= TODAY) {
      at(depositDate, "payroll tax deposit", async () => {
        const allocations = [
          ...(incomeTax > 0 ? [{ bucket: "income_tax", amount: incomeTax }] : []),
          ...(fica > 0 ? [{ bucket: "fica", amount: fica }] : []),
        ];
        if (!allocations.length) return;
        const res = await post("payroll/tax-payments", {
          periodStart: day(i, 1),
          periodEnd: monthEnd(i),
          jurisdictionLevel: "federal",
          taxKind: "941",
          allocations,
          bankAccountCode: "1100",
          paymentDate: depositDate,
          reference: `EFTPS-${depositDate.replace(/-/g, "")}`,
        });
        await bankLineForJournal(res.journalEntryId, "checking", depositDate, "IRS USATAXPYMT EFTPS", "IRS");
      });
    }
  });

  // Depreciation through the shared posting path (one charge per month).
  at(monthEnd(i), "depreciation", async () => {
    for (const id of ASSETS) {
      const asset = await db.query.fixedAsset.findFirst({ where: eq(fixedAsset.id, id) });
      if (!asset || asset.purchaseDate > monthEnd(i)) continue;
      await postAssetDepreciation(asset, { date: monthEnd(i), ctx });
    }
  });

  // Riverdale's annual plan is earned month by month.
  at(monthEnd(i), "revenue recognition", async () => {
    if (REV_SCHEDULE) await post("revenue-schedules/[id]/recognize", {}, { id: REV_SCHEDULE });
  });
  // Prepaid insurance amortization.
  at(monthEnd(i), "insurance amortization", async () => {
    if (ACCRUAL_SCHEDULE) await post("accrual-schedules/[id]/post", {}, { id: ACCRUAL_SCHEDULE });
  });

  // Savings interest and bank fees.
  at(monthEnd(i), "interest and fees", async () => {
    bankLine("savings", monthEnd(i), "INTEREST PAYMENT", Math.round((stmtBal.savings * 0.04) / 12), { kind: "categorize", code: "4100" }, "First National Bank");
    bankLine(
      "checking",
      monthEnd(i),
      "MONTHLY SERVICE FEE",
      -1500,
      i === LAST ? { kind: "open" } : { kind: "categorize", code: "5900", memo: "Account maintenance fee" },
      "First National Bank"
    );
  });

  // Monthly Texas sales tax return: file at month end, pay on the 20th.
  at(monthEnd(i), "sales tax return", async () => {
    const period = ent(await post("tax-periods", { name: `Sales tax - ${monthLabel(i)}`, startDate: day(i, 1), endDate: monthEnd(i), type: "monthly" }));
    const filed = await post("tax-periods/[id]/file", { mode: "file", filedReference: `TX-${day(i, 1).slice(0, 7)}`, basis: "accrual" }, { id: period.id });
    const net = Number(filed.net ?? 0);
    const payDate = bizDay(i + 1, 20);
    if (net > 0 && payDate <= TODAY) {
      at(payDate, "sales tax payment", async () => {
        const res = await post(
          "tax-periods/[id]/file",
          { mode: "settle", bankGlAccountId: acct("1100"), amount: net, date: payDate, reference: `TX-${day(i, 1).slice(0, 7)}` },
          { id: period.id }
        );
        await bankLineForJournal(res.settlementJournalEntryId, "checking", payDate, "TX COMPTROLLER SALES TAX", "Texas Comptroller");
      });
    }
  });

  // Loan repayment (first payment one month after the drawdown).
  if (i >= 1) {
    at(day(i, 2), "loan payment", async () => {
      if (!LOAN_ID) return;
      const res = await post("loans/[id]/post-payment", {}, { id: LOAN_ID });
      await bankLineForJournal(res.journalEntry.id, "checking", res.entry.date, "FIRST NATIONAL LOAN PMT", "First National Bank");
    });
  }
}
let REV_SCHEDULE = "";
let ACCRUAL_SCHEDULE = "";
let LOAN_ID = "";

function itemName(code: string): string {
  return (
    {
      "MON-27": "27in 4K Monitor",
      "STAND-01": "Monitor Stand",
      "KB-01": "Wireless Keyboard",
      "MS-01": "Wireless Mouse",
      "DOCK-01": "USB-C Docking Station",
      "CBL-01": "HDMI Cable 2m",
      "KIT-001": "Workstation Starter Kit",
    } as Record<string, string>
  )[code];
}
const stock = (code: string, q: number, wh = "main", price?: number, tax: Ln["tax"] = "EX", acctCode = "1300"): Ln => ({
  d: itemName(code),
  q,
  p: (price ?? I[code].cost) / 100,
  acct: acctCode,
  tax,
  item: code,
  wh,
});
const sale = (code: string, q: number, tax: Ln["tax"] = "TX"): Ln => ({
  d: itemName(code),
  q,
  p: I[code].sale / 100,
  acct: "4000",
  tax,
  item: code,
  wh: "main",
});

function oneOffs() {
  // ---------------- Month 0 ----------------
  at(day(0, 2), "insurance", async () => {
    await supplierBill("insurance", {
      contact: "insurance",
      date: day(0, 2),
      ref: "POL-BOP-221804",
      lines: [{ d: "Business owner's policy - 12 month premium", p: 4800, acct: "1410" }],
    });
    billPaid("insurance", "checking", bizDay(0, 15), "ACH DEBIT INSURANCE CO PREMIUM", "Insurance Co");
    ACCRUAL_SCHEDULE = ent(
      await post("accrual-schedules", {
        totalAmount: 4800,
        startDate: day(0, 1),
        endDate: addDays(day(12, 1), -1),
        periods: 12,
        accountId: acct("1410"),
        reverseAccountId: acct("5400"),
        description: "Business insurance - monthly amortization",
      })
    ).id;
  });

  at(day(0, 2), "loan", async () => {
    const res = await post("loans", {
      name: "Equipment Financing",
      bankAccountId: BANK.checking,
      principalAmount: 50000,
      interestRate: 650,
      termMonths: 36,
      startDate: day(0, 2),
      principalAccountId: acct("2700"),
      interestAccountId: acct("5910"),
    });
    LOAN_ID = res.loan.id;
    bankLine("checking", day(0, 2), "LOAN PROCEEDS FIRST NATIONAL BANK", 5000000, { kind: "categorize", code: "2700", memo: "Equipment Financing drawdown" }, "First National Bank");
  });

  at(day(0, 3), "riverdale annual", async () => {
    const inv = await salesInvoice("riverdale", {
      contact: "riverdale",
      date: day(0, 3),
      ref: "Annual plan",
      lines: [{ d: "Annual support & maintenance plan (12 months)", p: 24000, acct: "4010", cc: "ops" }],
    });
    REV_SCHEDULE = ent(
      await post("revenue-schedules", {
        invoiceId: inv.id,
        totalAmount: 2400000,
        startDate: day(0, 1),
        endDate: addDays(day(12, 1), -1),
        method: "straight_line",
      })
    ).id;
    invoicePaid("riverdale", "checking", bizDay(0, 28), "ACH CREDIT RIVERDALE CO", "Riverdale Co");
  });

  at(day(0, 5), "stock purchase 1", async () => {
    await supplierBill("stock-1", {
      contact: "techhw",
      date: day(0, 5),
      ref: "TH-INV-30211",
      notes: "Resale certificate on file: exempt from sales tax.",
      lines: [
        stock("MON-27", 20),
        stock("STAND-01", 25),
        stock("KB-01", 40),
        stock("MS-01", 40),
        stock("DOCK-01", 15),
        stock("CBL-01", 60),
        { d: "Freight", p: 120, acct: "5310" },
      ],
    });
    billPaid("stock-1", "checking", bizDay(1, 4), "ACH DEBIT TECH HARDWARE LTD", "Tech Hardware Ltd");
  });

  at(day(0, 8), "acme milestone 1", async () => {
    await salesInvoice("acme-m1", {
      contact: "acme",
      date: day(0, 8),
      ref: "Website Redesign",
      lines: [{ d: "Website redesign - Milestone 1: Discovery & design", p: 15000, acct: "4010", project: "website", cc: "eng" }],
    });
    invoicePaid("acme-m1", "checking", bizDay(1, 6), "ACH CREDIT ACME CORP", "Acme Corp");
  });

  at(day(0, 10), "furniture", async () => {
    const po = ent(
      await post("purchase-orders", {
        contactId: C.officedepot,
        issueDate: day(0, 10),
        deliveryDate: day(0, 12),
        reference: "Office fit-out",
        currencyCode: "USD",
        lines: [
          { description: "Standing desk", quantity: 6, unitPrice: 650, accountId: acct("1610"), taxRateId: T.tx },
          { description: "Ergonomic chair", quantity: 6, unitPrice: 420, accountId: acct("1610"), taxRateId: T.tx },
        ],
      })
    );
    await post("purchase-orders/[id]/send", {}, { id: po.id });
    const b = await supplierBill("furniture", {
      contact: "officedepot",
      date: day(0, 12),
      ref: "OD-7781204",
      po: [po.id],
      lines: [
        { d: "Standing desk", q: 6, p: 650, acct: "1610", tax: "TX" },
        { d: "Ergonomic chair", q: 6, p: 420, acct: "1610", tax: "TX" },
      ],
    });
    await addAsset("Office furniture - desks and chairs", "FA-0001", "furniture", day(0, 12), b.total, "1610", "1710", 84);
    billPaid("furniture", "checking", bizDay(1, 10), "ACH DEBIT OFFICE DEPOT", "Office Depot");
  });

  at(day(0, 10), "savings transfer", async () => {
    bankLine("checking", bizDay(0, 10), "TRANSFER TO SAVINGS ****8832", -1000000, { kind: "transfer", pair: "sav-0", to: "savings" }, "First National Bank");
    bankLine("savings", bizDay(0, 10), "TRANSFER FROM CHECKING ****4521", 1000000, { kind: "counter", pair: "sav-0" }, "First National Bank");
  });

  at(day(0, 15), "pinnacle q1", async () => {
    await salesInvoice("pinnacle-1", {
      contact: "pinnacle",
      date: day(0, 15),
      ref: "Advisory retainer",
      lines: [{ d: `Quarterly advisory - ${monthName(0)} to ${monthName(2)}`, p: 12000, acct: "4020", cc: "ops" }],
    });
    invoicePaid("pinnacle-1", "checking", bizDay(1, 28), "WIRE IN PINNACLE GROUP", "Pinnacle Group");
  });

  // ---------------- Month 1 ----------------
  at(day(1, 6), "acme hardware", async () => {
    await salesInvoice("acme-hw", {
      contact: "acme",
      date: day(1, 6),
      ref: "PO A-55102",
      lines: [sale("MON-27", 8), sale("STAND-01", 8), sale("KB-01", 8), sale("MS-01", 8)],
    });
    invoicePaid("acme-hw", "checking", bizDay(2, 5), "ACH CREDIT ACME CORP", "Acme Corp");
  });

  at(day(1, 8), "credit note 1", async () => {
    const cn = ent(
      await post("credit-notes", {
        contactId: C.global,
        invoiceId: INV["global-1"]?.id ?? null,
        issueDate: day(1, 8),
        reference: "Billing adjustment",
        currencyCode: "USD",
        lines: [{ description: "Hours adjustment - 2 hours billed twice", quantity: 2, unitPrice: 225, accountId: acct("4020"), taxRateId: T.exempt }],
      })
    );
    await post("credit-notes/[id]/send", {}, { id: cn.id });
    await post("credit-notes/[id]/apply", { invoiceId: INV["global-1"].id, amount: 45000 }, { id: cn.id });
  });

  at(day(1, 10), "sterling prepayment", async () => {
    const res = await post("customer-credits", {
      contactId: C.sterling,
      date: day(1, 10),
      amount: 500000,
      sourceType: "prepayment",
      currencyCode: "USD",
      notes: "Deposit for the operations review engagement",
      bankAccountId: BANK.checking,
    });
    STERLING_CREDIT = res.customerCredit.id;
    await bankLineForJournal(res.customerCredit.journalEntryId, "checking", day(1, 10), "WIRE IN STERLING ENTERPRISES", "Sterling Enterprises");
  });

  at(day(1, 12), "bright overdue", async () => {
    await salesInvoice("bright", {
      contact: "bright",
      date: day(1, 12),
      lines: [{ d: "Support hours - integration troubleshooting", q: 8, p: 225, acct: "4010" }],
    });
  });

  at(day(1, 14), "voided invoice", async () => {
    const inv = await salesInvoice("summit-void", {
      contact: "summit",
      date: day(1, 14),
      lines: [{ d: "Website hosting setup", p: 950, acct: "4010" }],
    });
    await post("invoices/[id]/void", { reason: "Duplicate - issued in error" }, { id: inv.id });
  });

  at(day(1, 18), "nordlicht 1", async () => {
    await salesInvoice("nordlicht-1", {
      contact: "nordlicht",
      date: day(1, 18),
      currency: "EUR",
      ref: "PO 4500012871",
      lines: [{ d: `Data platform consulting - ${monthName(1)}`, q: 32, p: 250, acct: "4020" }],
    });
  });

  // ---------------- Month 2 ----------------
  at(day(2, 3), "acme milestone 2", async () => {
    await salesInvoice("acme-m2", {
      contact: "acme",
      date: day(2, 3),
      ref: "Website Redesign",
      lines: [{ d: "Website redesign - Milestone 2: Build", p: 20000, acct: "4010", project: "website", cc: "eng" }],
    });
    invoicePaid("acme-m2", "checking", bizDay(3, 4), "ACH CREDIT ACME CORP", "Acme Corp");
  });

  at(day(2, 8), "macbooks", async () => {
    const po = ent(
      await post("purchase-orders", {
        contactId: C.techhw,
        issueDate: day(2, 8),
        deliveryDate: day(2, 10),
        reference: "New hire laptops",
        currencyCode: "USD",
        lines: [{ description: "MacBook Pro 16in M4 Pro 48GB", quantity: 2, unitPrice: 3199, accountId: acct("1620"), taxRateId: T.tx }],
      })
    );
    await post("purchase-orders/[id]/send", {}, { id: po.id });
    const b = await supplierBill("macbooks", {
      contact: "techhw",
      date: day(2, 10),
      ref: "TH-INV-30877",
      po: [po.id],
      lines: [{ d: "MacBook Pro 16in M4 Pro 48GB", q: 2, p: 3199, acct: "1620", tax: "TX" }],
    });
    await addAsset("MacBook Pro 16in (x2)", "FA-0002", "computers", day(2, 10), b.total, "1620", "1720", 36);
    billPaid("macbooks", "checking", bizDay(2, 24), "ACH DEBIT TECH HARDWARE LTD", "Tech Hardware Ltd");
  });

  at(day(2, 9), "cloudbase hardware", async () => {
    await salesInvoice("cloudbase-hw", {
      contact: "cloudbase",
      date: day(2, 9),
      notes: "Shipped to Seattle, WA: no Texas sales tax.",
      lines: [sale("MON-27", 4, "EX"), sale("KB-01", 4, "EX"), sale("MS-01", 4, "EX"), sale("DOCK-01", 4, "EX")],
    });
    invoicePaid("cloudbase-hw", "checking", bizDay(3, 15), "ACH CREDIT CLOUDBASE SYSTEMS", "CloudBase Systems");
  });

  at(day(2, 12), "nordlicht payment", async () => {
    const inv = INV["nordlicht-1"];
    const res = await post("invoices/[id]/pay", { amount: inv.amountDue, date: bizDay(2, 12), method: "bank_transfer", reference: "SEPA 88124", bankAccountId: BANK.checking }, { id: inv.id });
    const pay = await db.query.payment.findFirst({ where: (p, { eq: e }) => e(p.id, res.payment.id) });
    if (pay?.journalEntryId) {
      const amount = await bankLeg(pay.journalEntryId, "1100");
      bankLine("checking", bizDay(2, 12), "INTL WIRE IN NORDLICHT GMBH", amount, { kind: "payment", paymentId: pay.id }, "Nordlicht GmbH");
    }
  });

  at(day(2, 12), "marketing 1", async () => {
    await supplierBill("marketing-1", {
      contact: "marketing",
      date: day(2, 12),
      ref: "MA-2291",
      lines: [{ d: "Paid social campaign - management fee", p: 2200, acct: "5600", cc: "sales" }],
    });
    billPaid("marketing-1", "checking", bizDay(3, 2), "ACH DEBIT MARKETING AGENCY", "Marketing Agency");
  });

  at(day(2, 15), "owner contribution", async () => {
    bankLine("checking", bizDay(2, 15), "DEPOSIT OWNER CAPITAL CONTRIBUTION", 2000000, { kind: "categorize", code: "3210", memo: "Owner capital contribution" }, "Owner");
  });

  at(day(2, 18), "sterling invoice", async () => {
    const inv = await salesInvoice("sterling-1", {
      contact: "sterling",
      date: day(2, 18),
      ref: "Operations review",
      lines: [{ d: "Operations review & 12-month roadmap", p: 15000, acct: "4020", cc: "ops" }],
    });
    await post("customer-credits/[id]/apply", { invoiceId: inv.id, amount: 500000, date: day(2, 18) }, { id: STERLING_CREDIT });
    invoicePaid("sterling-1", "checking", bizDay(4, 5), "WIRE IN STERLING ENTERPRISES", "Sterling Enterprises");
  });

  // ---------------- Month 3 ----------------
  at(day(3, 2), "credit note 2", async () => {
    const cn = ent(
      await post("credit-notes", {
        contactId: C.cloudbase,
        invoiceId: INV["cloudbase-hw"].id,
        issueDate: day(3, 2),
        reference: "RMA-1042",
        currencyCode: "USD",
        lines: [{ description: "Returned: Wireless Keyboard (damaged in transit)", quantity: 1, unitPrice: 79, accountId: acct("4000"), taxRateId: T.exempt }],
      })
    );
    await post("credit-notes/[id]/send", {}, { id: cn.id });
    await post("credit-notes/[id]/apply", { invoiceId: INV["cloudbase-hw"].id, amount: 7900 }, { id: cn.id });
  });

  at(day(3, 4), "pinnacle q2", async () => {
    await salesInvoice("pinnacle-2", {
      contact: "pinnacle",
      date: day(3, 4),
      ref: "Advisory retainer",
      lines: [{ d: `Quarterly advisory - ${monthName(3)} to ${monthName(5)}`, p: 12000, acct: "4020", cc: "ops" }],
    });
    invoicePaid("pinnacle-2", "checking", bizDay(4, 20), "WIRE IN PINNACLE GROUP", "Pinnacle Group");
  });

  at(day(3, 6), "stock purchase 2", async () => {
    await supplierBill("stock-2", {
      contact: "techhw",
      date: day(3, 6),
      ref: "TH-INV-31452",
      notes: "Resale certificate on file: exempt from sales tax.",
      lines: [stock("MON-27", 15), stock("KB-01", 20), stock("MS-01", 20), stock("CBL-01", 40, "east"), { d: "Freight", p: 95, acct: "5310" }],
    });
  });

  at(day(3, 9), "debit note", async () => {
    const dn = ent(
      await post("debit-notes", {
        contactId: C.techhw,
        billId: BILLS["stock-2"].id,
        issueDate: day(3, 9),
        reference: "Freight overcharge",
        currencyCode: "USD",
        lines: [{ description: "Freight overcharge refund", quantity: 1, unitPrice: 45, accountId: acct("5310"), taxRateId: T.exempt }],
      })
    );
    await post("debit-notes/[id]/send", {}, { id: dn.id });
    await post("debit-notes/[id]/apply", { billId: BILLS["stock-2"].id, amount: 4500 }, { id: dn.id });
    billPaid("stock-2", "checking", bizDay(4, 6), "ACH DEBIT TECH HARDWARE LTD", "Tech Hardware Ltd");
  });

  at(day(3, 10), "legal", async () => {
    await supplierBill("legal-1", {
      contact: "legal",
      date: day(3, 10),
      ref: "LP-10992",
      lines: [{ d: "Contract review - customer MSA template", p: 1500, acct: "5710" }],
    });
    billPaid("legal-1", "checking", bizDay(4, 10), "ACH DEBIT LEGAL PARTNERS LLP", "Legal Partners LLP");
  });

  at(day(3, 12), "office supplies", async () => {
    await supplierBill("supplies", {
      contact: "officedepot",
      date: day(3, 12),
      terms: 0,
      ref: "OD-7790551",
      lines: [
        { d: "Printer paper (10 reams)", p: 64, acct: "5300", tax: "TX" },
        { d: "Toner cartridges", p: 122, acct: "5300", tax: "TX" },
      ],
    });
    billPaid("supplies", "card", day(3, 13), "OFFICE DEPOT #1142 AUSTIN TX", "Office Depot");
  });

  at(day(3, 18), "summit quote", async () => {
    const q = ent(
      await post("quotes", {
        contactId: C.summit,
        issueDate: day(3, 18),
        expiryDate: addDays(day(3, 18), 30),
        reference: "Hardware refresh",
        currencyCode: "USD",
        lines: [
          { description: itemName("MON-27"), quantity: 10, unitPrice: 420, accountId: acct("4000"), taxRateId: T.tx, inventoryItemId: I["MON-27"].id },
          { description: itemName("DOCK-01"), quantity: 10, unitPrice: 159, accountId: acct("4000"), taxRateId: T.tx, inventoryItemId: I["DOCK-01"].id },
        ],
      })
    );
    await post("quotes/[id]/send", {}, { id: q.id });
    await post("quotes/[id]/decline", {}, { id: q.id });
  });

  at(day(3, 20), "nordlicht 2", async () => {
    await salesInvoice("nordlicht-2", {
      contact: "nordlicht",
      date: day(3, 20),
      currency: "EUR",
      ref: "PO 4500013340",
      lines: [{ d: `Data platform consulting - ${monthName(3)}`, q: 26, p: 250, acct: "4020" }],
    });
  });

  // ---------------- Month 4 ----------------
  at(day(4, 4), "acme milestone 3", async () => {
    await salesInvoice("acme-m3", {
      contact: "acme",
      date: day(4, 4),
      ref: "Website Redesign",
      lines: [{ d: "Website redesign - Milestone 3: Launch & handover", p: 10000, acct: "4010", project: "website", cc: "eng" }],
    });
    invoicePaid("acme-m3", "checking", bizDay(5, 6), "ACH CREDIT ACME CORP", "Acme Corp");
  });

  at(day(4, 7), "summit hardware", async () => {
    await salesInvoice("summit-hw", {
      contact: "summit",
      date: day(4, 7),
      lines: [sale("MON-27", 3), sale("DOCK-01", 3)],
    });
    invoicePaid("summit-hw", "checking", bizDay(4, 21), "ACH CREDIT SUMMIT DIGITAL", "Summit Digital");
  });

  at(day(4, 12), "av system", async () => {
    const b = await supplierBill("av", {
      contact: "techhw",
      date: day(4, 12),
      ref: "TH-INV-31990",
      lines: [{ d: "Conference room AV system (display, camera, mics)", p: 4200, acct: "1600", tax: "TX" }],
    });
    await addAsset("Conference room AV system", "FA-0003", "equipment", day(4, 12), b.total, "1600", "1700", 60);
    billPaid("av", "checking", bizDay(5, 10), "ACH DEBIT TECH HARDWARE LTD", "Tech Hardware Ltd");
  });

  at(day(4, 20), "sterling invoice 2", async () => {
    await salesInvoice("sterling-2", {
      contact: "sterling",
      date: day(4, 20),
      ref: "Process automation",
      lines: [{ d: "Process automation - phase 1", p: 12500, acct: "4020", cc: "ops" }],
    });
  });

  at(day(4, 24), "acme phase 2 quote", async () => {
    const q = ent(
      await post("quotes", {
        contactId: C.acme,
        issueDate: day(4, 24),
        expiryDate: addDays(TODAY, 21),
        reference: "Website Redesign - Phase 2",
        currencyCode: "USD",
        lines: [{ description: "Phase 2 - e-commerce integration", quantity: 1, unitPrice: 6500, accountId: acct("4010"), taxRateId: T.exempt }],
      })
    );
    await post("quotes/[id]/send", {}, { id: q.id });
    ACME_QUOTE = q.id;
  });

  // ---------------- Month 5 ----------------
  at(day(5, 1), "marketing 2", async () => {
    await supplierBill("marketing-2", {
      contact: "marketing",
      date: day(5, 1),
      ref: "MA-2350",
      lines: [{ d: "Q4 campaign planning and creative", p: 2200, acct: "5600", cc: "sales" }],
    });
  });

  at(day(5, 2), "acme accepts quote", async () => {
    if (ACME_QUOTE) await post("quotes/[id]/accept", {}, { id: ACME_QUOTE });
  });

  at(day(5, 2), "sterling quote", async () => {
    const q = ent(
      await post("quotes", {
        contactId: C.sterling,
        issueDate: day(5, 2),
        expiryDate: addDays(TODAY, 30),
        reference: "Process automation - phase 2",
        currencyCode: "USD",
        lines: [
          { description: "Process automation - phase 2 build", quantity: 1, unitPrice: 15000, accountId: acct("4020"), taxRateId: T.exempt },
          { description: "Training and handover", quantity: 1, unitPrice: 3000, accountId: acct("4020"), taxRateId: T.exempt },
        ],
      })
    );
    await post("quotes/[id]/send", {}, { id: q.id });
  });

  at(day(5, 5), "cloudbase support", async () => {
    await salesInvoice("cloudbase-support", {
      contact: "cloudbase",
      date: day(5, 5),
      lines: [{ d: `Platform support - ${monthName(5)}`, p: 2000, acct: "4010" }],
    });
  });

  at(day(5, 20), "displays po", async () => {
    const po = ent(
      await post("purchase-orders", {
        contactId: C.techhw,
        issueDate: day(5, 20),
        deliveryDate: day(5, 30),
        reference: "Meeting room displays",
        currencyCode: "USD",
        lines: [
          { description: "55in meeting room display", quantity: 4, unitPrice: 650, accountId: acct("1600"), taxRateId: T.tx },
          { description: "Wall mount kit", quantity: 4, unitPrice: 45, accountId: acct("1600"), taxRateId: T.tx },
        ],
      })
    );
    await post("purchase-orders/[id]/send", {}, { id: po.id });
    DISPLAYS_PO = po.id;
  });

  at(day(5, 22), "credit note 3", async () => {
    const cn = ent(
      await post("credit-notes", {
        contactId: C.acme,
        issueDate: day(5, 22),
        reference: "Service credit",
        currencyCode: "USD",
        lines: [{ description: "Service credit - staging downtime", quantity: 1, unitPrice: 250, accountId: acct("4010"), taxRateId: T.exempt }],
      })
    );
    await post("credit-notes/[id]/send", {}, { id: cn.id });
  });

  at(day(5, 28), "partial goods receipt", async () => {
    if (!DISPLAYS_PO) return;
    const po = await get("purchase-orders/[id]", { id: DISPLAYS_PO });
    const lines = ent(po).lines ?? po.purchaseOrder?.lines ?? [];
    const display = lines.find((l: any) => String(l.description).startsWith("55in"));
    const mount = lines.find((l: any) => String(l.description).startsWith("Wall mount"));
    await post("goods-receipts", {
      purchaseOrderId: DISPLAYS_PO,
      date: day(5, 28),
      notes: "First 2 displays delivered; 2 on back order",
      lines: [
        { purchaseOrderLineId: display.id, quantity: 2 },
        { purchaseOrderLineId: mount.id, quantity: 2 },
      ],
    });
  });

  // ---------------- Current month (to date) ----------------
  currentMonth();
}
let STERLING_CREDIT = "";
let ACME_QUOTE = "";
let DISPLAYS_PO = "";

async function addAsset(name: string, assetNumber: string, cat: string, date: string, cost: number, assetCode: string, accumCode: string, life: number) {
  const res = await post("fixed-assets", {
    name,
    assetNumber,
    categoryId: ASSET_CAT[cat],
    purchaseDate: date,
    purchasePrice: cost,
    residualValue: 0,
    usefulLifeMonths: life,
    depreciationMethod: "straight_line",
    convention: "full_month",
    assetAccountId: acct(assetCode),
    depreciationAccountId: acct("5500"),
    accumulatedDepAccountId: acct(accumCode),
  });
  ASSETS.push(res.asset.id);
}

function currentMonth() {
  // Today's work happens on today's date (several app actions are dated "today").
  const d = (dd: number) => (day(CUR, dd) < TODAY ? day(CUR, dd) : TODAY);

  at(d(2), "requisitions", async () => {
    const draft = ent(
      await post("purchase-requisitions", {
        contactId: C.techhw,
        requestDate: d(2),
        requiredDate: addDays(TODAY, 21),
        reference: "Spare chargers",
        notes: "For the loaner laptop pool",
        lines: [{ description: "USB-C 96W charger", quantity: 10, unitPrice: 49, accountId: acct("5300"), taxRateId: T.tx }],
      })
    );
    void draft;
    const submitted = ent(
      await post("purchase-requisitions", {
        contactId: C.officedepot,
        requestDate: d(2),
        requiredDate: addDays(TODAY, 14),
        reference: "New starter chairs",
        notes: "Two new hires next month",
        lines: [{ description: "Ergonomic chair", quantity: 4, unitPrice: 420, accountId: acct("1610"), taxRateId: T.tx }],
      })
    );
    await post("purchase-requisitions/[id]/submit", {}, { id: submitted.id });
    const approved = ent(
      await post("purchase-requisitions", {
        contactId: C.techhw,
        requestDate: d(2),
        requiredDate: addDays(TODAY, 10),
        reference: "Stock top-up",
        lines: [
          { description: "Wireless Keyboard", quantity: 20, unitPrice: 45, accountId: acct("1300"), taxRateId: T.exempt },
          { description: "Wireless Mouse", quantity: 20, unitPrice: 22, accountId: acct("1300"), taxRateId: T.exempt },
        ],
      })
    );
    await post("purchase-requisitions/[id]/submit", {}, { id: approved.id });
    await post("purchase-requisitions/[id]/approve", {}, { id: approved.id });
    await post("purchase-requisitions/[id]/convert", { contactId: C.techhw }, { id: approved.id });
  });

  at(TODAY, "quotes", async () => {
    if (ACME_QUOTE) {
      const res = await post("quotes/[id]/convert", {}, { id: ACME_QUOTE });
      const inv = res.invoice ?? null;
      if (inv?.id && inv.status === "draft") await post("invoices/[id]/send", {}, { id: inv.id });
    }
    await post("quotes", {
      contactId: C.techstart,
      issueDate: TODAY,
      expiryDate: addDays(TODAY, 30),
      reference: "Mobile app - phase 2",
      currencyCode: "USD",
      lines: [
        { description: "Phase 2: offline maps and route planning", quantity: 120, unitPrice: 165, accountId: acct("4010"), taxRateId: T.exempt },
        { description: "Phase 2: admin web console", quantity: 80, unitPrice: 165, accountId: acct("4010"), taxRateId: T.exempt },
      ],
    });
    const q5 = ent(
      await post("quotes", {
        contactId: C.pinnacle,
        issueDate: TODAY,
        expiryDate: addDays(TODAY, 30),
        reference: "Advisory renewal",
        currencyCode: "USD",
        lines: [{ description: "Quarterly advisory retainer - next 4 quarters", quantity: 4, unitPrice: 12000, accountId: acct("4020"), taxRateId: T.exempt }],
      })
    );
    await post("quotes/[id]/send", {}, { id: q5.id });
  });

  // Work in progress on any given day: a draft invoice, an accepted quote, an
  // order with the supplier, credit still to use, and a few things binned.
  at(TODAY, "drafts and open documents", async () => {
    await salesInvoice("cloudbase-draft", {
      contact: "cloudbase",
      date: TODAY,
      ref: "CB-Q4-support",
      send: false,
      lines: [
        { d: "Managed support - November", p: 2400, acct: "4020", cc: "ops" },
        { d: "Additional support hours", q: 6, p: 150, acct: "4020", cc: "ops" },
      ],
    });
    const accepted = ent(
      await post("quotes", {
        contactId: C.bright,
        issueDate: d(6),
        expiryDate: addDays(d(6), 30),
        reference: "Brand refresh",
        currencyCode: "USD",
        lines: [
          { description: "Brand refresh - logo and identity", quantity: 1, unitPrice: 6500, accountId: acct("4010"), taxRateId: T.exempt },
          { description: "Marketing site templates", quantity: 1, unitPrice: 3200, accountId: acct("4010"), taxRateId: T.exempt },
        ],
      })
    );
    await post("quotes/[id]/send", {}, { id: accepted.id });
    await post("quotes/[id]/accept", {}, { id: accepted.id });

    const po = ent(
      await post("purchase-orders", {
        contactId: C.techhw,
        issueDate: d(8),
        deliveryDate: addDays(TODAY, 7),
        reference: "Q4 monitor restock",
        currencyCode: "USD",
        lines: [
          { description: '27" 4K Monitor', quantity: 10, unitPrice: 240, accountId: acct("1300"), taxRateId: T.exempt, inventoryItemId: I["MON-27"].id },
          { description: "HDMI Cable 2m", quantity: 30, unitPrice: 6, accountId: acct("1300"), taxRateId: T.exempt, inventoryItemId: I["CBL-01"].id },
        ],
      })
    );
    await post("purchase-orders/[id]/send", {}, { id: po.id });

    const aws = BILLS["aws-" + CUR] ?? BILLS["aws-" + LAST];
    const credit = ent(
      await post("debit-notes", {
        contactId: C.aws,
        billId: aws?.id ?? null,
        issueDate: d(9),
        reference: "Service credit - outage",
        currencyCode: "USD",
        lines: [{ description: "SLA service credit for the September outage", quantity: 1, unitPrice: 120, accountId: acct("5230"), taxRateId: T.exempt }],
      })
    );
    await post("debit-notes/[id]/send", {}, { id: credit.id });

    await post("inventory/transfers", {
      fromWarehouseId: W.main,
      toWarehouseId: W.east,
      notes: "Keyboards for the east showroom",
      lines: [{ inventoryItemId: I["KB-01"].id, quantity: 4 }],
    });

    // Binned this week, still in Trash.
    const dupe = ent(
      await post("quotes", {
        contactId: C.techstart,
        issueDate: d(5),
        expiryDate: addDays(d(5), 30),
        reference: "Duplicate - mobile app phase 2",
        currencyCode: "USD",
        lines: [{ description: "Phase 2 estimate", quantity: 1, unitPrice: 18000, accountId: acct("4010"), taxRateId: T.exempt }],
      })
    );
    await del("quotes/[id]", { id: dupe.id });
    const lead = ent(await post("contacts", { name: "Oakridge Bakery", email: "hello@oakridgebakery.com", type: "customer" }));
    await del("contacts/[id]", { id: lead.id });
  });

  at(TODAY, "customer portal", async () => {
    for (const key of ["acme", "sterling", "techstart"]) {
      const res = await post("portal/invite", { contactId: C[key], expiresInDays: 60 });
      // Acme and Sterling have opened their links.
      if (key !== "techstart") await api("GET", "../portal/[token]", undefined, { token: res.access.token });
    }
  });

  at(TODAY, "legal draft bill", async () => {
    await supplierBill("legal-2", {
      contact: "legal",
      date: TODAY,
      ref: "LP-11240",
      receive: false,
      lines: [{ d: "Trademark filing - dubbl wordmark", p: 950, acct: "5710" }],
    });
  });

  at(TODAY, "scheduled payment", async () => {
    const b = BILLS["marketing-2"];
    if (!b) return;
    await post("scheduled-payments", {
      billId: b.id,
      contactId: C.marketing,
      amount: b.amountDue ?? b.total,
      currencyCode: "USD",
      scheduledDate: addDays(TODAY, 3),
      notes: "Agreed to pay after the campaign review",
      bankAccountId: BANK.checking,
    });
  });

  at(TODAY, "payment batch", async () => {
    const items = ["jane-" + LAST, "consultco-" + LAST]
      .map((k) => BILLS[k])
      .filter(Boolean)
      .map((b) => ({ billId: b.id, contactId: b.contactId, amount: b.amountDue ?? b.total, currencyCode: "USD" }));
    if (!items.length) return;
    const batch = ent(await post("payment-batches", { name: `Supplier run ${TODAY}`, currencyCode: "USD", bankAccountId: BANK.checking, items }));
    await post("payment-batches/[id]/submit", {}, { id: batch.id });
    // The ACH debits already show on today's statement, waiting to be matched.
    for (const [k, desc, payee] of [
      ["jane-" + LAST, "ACH DEBIT JANE DOE DESIGN", "Freelancer Jane"],
      ["consultco-" + LAST, "ACH DEBIT CONSULTCO LLC", "ConsultCo"],
    ]) {
      const b = BILLS[k];
      if (b) bankLine("checking", TODAY, desc, -(b.amountDue ?? b.total), { kind: "open" }, payee);
    }
  });

  at(TODAY, "expense claims", async () => {
    const paid = ent(
      await post("expenses", {
        title: "Client visit - Dallas",
        description: "Metro Services quarterly review",
        currencyCode: "USD",
        items: [
          { date: d(3), description: "Hotel - 1 night", amount: 189, category: "Travel", accountId: acct("5800"), taxRateId: T.none },
          { date: d(3), description: "Client dinner", amount: 86.4, category: "Meals", accountId: acct("5810"), taxRateId: T.none },
          { date: d(4), description: "Parking", amount: 24, category: "Travel", accountId: acct("5800"), taxRateId: T.none },
        ],
      })
    );
    await post("expenses/[id]/submit", {}, { id: paid.id });
    await post("expenses/[id]/approve", { comment: "OK" }, { id: paid.id });
    await post("expenses/[id]/pay", { date: TODAY, bankAccountCode: "1100" }, { id: paid.id });
    const pending = ent(
      await post("expenses", {
        title: "SaaS Summit conference",
        description: "Conference pass and meals",
        currencyCode: "USD",
        items: [
          { date: d(8), description: "Conference pass", amount: 695, category: "Travel", accountId: acct("5800"), taxRateId: T.none },
          { date: d(9), description: "Team lunch", amount: 64.5, category: "Meals", accountId: acct("5810"), taxRateId: T.none },
        ],
      })
    );
    await post("expenses/[id]/submit", {}, { id: pending.id });
    await post("expenses", {
      title: "Office snacks",
      currencyCode: "USD",
      items: [{ date: d(10), description: "Coffee and snacks", amount: 42.75, category: "Office", accountId: acct("5300"), taxRateId: T.none }],
    });
  });

  at(TODAY, "inventory today", async () => {
    // Move stock to the east warehouse; one transfer arrived, one on the road.
    const t1 = ent(
      await post("inventory/transfers", {
        fromWarehouseId: W.main,
        toWarehouseId: W.east,
        notes: "Stock for east-side customers",
        lines: [
          { inventoryItemId: I["MON-27"].id, quantity: 3 },
          { inventoryItemId: I["KB-01"].id, quantity: 6 },
        ],
      })
    );
    await patch("inventory/transfers/[id]", { status: "in_transit" }, { id: t1.id });
    await post("inventory/transfers/[id]/complete", {}, { id: t1.id });
    const t2 = ent(
      await post("inventory/transfers", {
        fromWarehouseId: W.east,
        toWarehouseId: W.main,
        notes: "Return excess cables to main",
        lines: [{ inventoryItemId: I["CBL-01"].id, quantity: 10 }],
      })
    );
    await patch("inventory/transfers/[id]", { status: "in_transit" }, { id: t2.id });

    // Build three starter kits from components (posts the assembly entry).
    const order = ent(await post("inventory/assembly-orders", { bomId: BOM_ID, quantity: 3, notes: "Kits for walk-in customers" }));
    await post("inventory/assembly-orders/[id]/complete", {}, { id: order.id });
    await post("inventory/assembly-orders", { bomId: BOM_ID, quantity: 5, notes: "Planned build for next month" });

    // Stocktake: counted and applied (small shrinkage), plus one in progress.
    const st = ent(await post("stock-takes", { name: `Quarterly count - Main Warehouse`, warehouseId: W.main, notes: "Full count" }));
    await patch("stock-takes/[id]", { status: "in_progress" }, { id: st.id });
    const full = await get("stock-takes/[id]", { id: st.id });
    const lines = full.stockTake?.lines ?? full.lines ?? [];
    for (const l of lines) {
      const expected = Number(l.expectedQuantity ?? l.systemQuantity ?? 0);
      const short = l.inventoryItemId === I["CBL-01"].id ? 2 : l.inventoryItemId === I["MS-01"].id ? 1 : 0;
      await patch("stock-takes/[id]/lines/[lineId]", { countedQuantity: Math.max(0, expected - short) }, { id: st.id, lineId: l.id });
    }
    await post("stock-takes/[id]/apply", {}, { id: st.id });
    const st2 = ent(await post("stock-takes", { name: "Cycle count - East Distribution Center", warehouseId: W.east }));
    await patch("stock-takes/[id]", { status: "in_progress" }, { id: st2.id });
  });

  at(TODAY, "contractor", async () => {
    const p1 = await post("payroll/contractors/[id]/payments", {
      amount: 342000,
      currency: "USD",
      description: "Usability study - field app (36 hours)",
      invoiceNumber: "RUX-0912",
      periodStart: day(LAST, 1),
      periodEnd: monthEnd(LAST),
    }, { id: CONTRACTOR_ID });
    await post("payroll/contractors/[id]/payments/[paymentId]/process", {}, { id: CONTRACTOR_ID, paymentId: p1.payment.id });
    await post("payroll/contractors/[id]/payments", {
      amount: 190000,
      currency: "USD",
      description: "Interview synthesis (20 hours)",
      invoiceNumber: "RUX-0927",
      periodStart: day(CUR, 1),
      periodEnd: TODAY,
    }, { id: CONTRACTOR_ID });
  });

  at(TODAY, "draft pay run", async () => {
    await post("payroll/runs", { payPeriodStart: day(CUR, 1), payPeriodEnd: monthEnd(CUR) });
  });
}

// ===========================================================================
// 4. Bank statements: import, process, statement checks
// ===========================================================================
async function importStatements(i: number) {
  // Card bill from last month's statement, paid from checking on the 26th.
  if (i >= 0) {
    const owed = -stmtBal.card;
    const payDate = bizDay(i, 26);
    if (owed > 0 && payDate <= TODAY) {
      bankLine("checking", payDate, "CHASE CARD AUTOPAY", -owed, { kind: "transfer", pair: `card-${i}`, to: "card" }, "Chase");
      bankLine("card", payDate, "AUTOPAY PAYMENT - THANK YOU", owed, { kind: "counter", pair: `card-${i}` }, "Chase");
    }
  }

  const monthLines = feed.filter((l) => monthIndexOf(l.date) === i);
  for (const bank of ["checking", "savings", "card"] as Bank[]) {
    const lines = monthLines.filter((l) => l.bank === bank).sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));
    if (!lines.length) continue;
    for (const l of lines) {
      if (l.amount === null) l.amount = await openAmount(l);
    }
    let bal = stmtBal[bank];
    const rows = ["Date,Description,Amount,Balance,Reference,Payee"];
    for (const l of lines) {
      bal += l.amount!;
      rows.push([l.date, l.description, (l.amount! / 100).toFixed(2), (bal / 100).toFixed(2), l.ref, l.payee].join(","));
    }
    await post(
      "bank-accounts/[id]/transactions/import",
      {
        mode: "commit",
        fileName: `${bank}-${day(i, 1).slice(0, 7)}.csv`,
        content: rows.join("\n"),
        format: "csv",
        mapping: { date: "Date", description: "Description", amount: "Amount", balance: "Balance", reference: "Reference", payee: "Payee" },
      },
      { id: BANK[bank] }
    );
    const imported = await db
      .select({ id: bankTransaction.id, reference: bankTransaction.reference })
      .from(bankTransaction)
      .where(and(eq(bankTransaction.bankAccountId, BANK[bank]), inArray(bankTransaction.reference, lines.map((l) => l.ref))));
    const byRef = new Map(imported.map((r) => [r.reference, r.id]));
    for (const l of lines) {
      l.txId = byRef.get(l.ref);
      if (!l.txId) throw new Error(`Imported line not found: ${l.ref} ${l.description}`);
    }
    monthOpen[bank][i] = stmtBal[bank];
    stmtBal[bank] = bal;
    monthClose[bank][i] = bal;
  }
}
const monthOpen: Record<Bank, Record<number, number>> = { checking: {}, savings: {}, card: {} };
const monthClose: Record<Bank, Record<number, number>> = { checking: {}, savings: {}, card: {} };

async function openAmount(l: FeedLine): Promise<number> {
  if (l.action.kind === "invoice") {
    const key = l.action.key;
    const row = await db.query.invoice.findFirst({ where: eq(invoice.id, INV[key].id) });
    return row!.amountDue;
  }
  if (l.action.kind === "bill") {
    const key = l.action.key;
    const row = await db.query.bill.findFirst({ where: eq(bill.id, BILLS[key].id) });
    return -row!.amountDue;
  }
  throw new Error(`Line ${l.description} has no amount`);
}

async function processStatements(i: number) {
  // Leave the newest few days of the current month in the To do list.
  const cutoff = i === CUR ? [addDays(TODAY, -5), day(CUR, 7)].sort()[0] : "9999-12-31";
  const lines = feed
    .filter((l) => monthIndexOf(l.date) === i && l.txId)
    .sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));
  const pairs = new Map<string, FeedLine>();
  for (const l of lines) if (l.action.kind === "counter") pairs.set(l.action.pair, l);

  for (const l of lines) {
    if (l.date > cutoff) continue;
    const a = l.action;
    const id = l.txId!;
    switch (a.kind) {
      case "invoice":
        await post("bank-transactions/[id]/match", { matchType: "invoice", invoiceId: INV[a.key].id, amount: Math.abs(l.amount!), date: l.date, method: "bank_transfer" }, { id });
        break;
      case "bill":
        await post("bank-transactions/[id]/match", { matchType: "bill", billId: BILLS[a.key].id, amount: Math.abs(l.amount!), date: l.date, method: l.bank === "card" ? "card" : "bank_transfer" }, { id });
        break;
      case "journal":
        await post("bank-transactions/[id]/match", { matchType: "existing_journal", journalEntryId: a.jeId }, { id });
        break;
      case "payment":
        await post("bank-transactions/[id]/match", { matchType: "existing_payment", paymentId: a.paymentId }, { id });
        break;
      case "categorize":
        await post("bank-transactions/[id]/categorize", { accountId: acct(a.code), memo: a.memo ?? null }, { id });
        break;
      case "transfer": {
        const counter = pairs.get(a.pair);
        await post("bank-transactions/[id]/match-transfer", { targetBankAccountId: BANK[a.to], counterTransactionId: counter?.txId ?? null }, { id });
        break;
      }
      case "counter":
      case "open":
        break;
    }
  }
}

const recDifferences: string[] = [];
async function statementChecks(i: number) {
  for (const bank of ["checking", "savings", "card"] as Bank[]) {
    if (monthClose[bank][i] === undefined) continue;
    const rec = ent(
      await post(
        "bank-accounts/[id]/reconciliations",
        { startDate: day(i, 1), endDate: monthEnd(i), startBalance: monthOpen[bank][i], endBalance: monthClose[bank][i] },
        { id: BANK[bank] }
      )
    );
    const status = await get("bank-accounts/[id]/reconciliation", { id: BANK[bank] }, `reconciliationId=${rec.id}`);
    const diff = Number(status.difference ?? status.reconciliation?.difference ?? 0);
    recDifferences.push(`${bank} ${day(i, 1).slice(0, 7)}: difference ${diff}`);
    const keepOpen = bank === "checking" && i === LAST;
    if (!keepOpen) {
      await post("bank-accounts/[id]/reconciliation", { action: "complete", reconciliationId: rec.id }, { id: BANK[bank] });
    }
  }
}

// ===========================================================================
// 5. Finishing touches: templates, rules, reports, reminders, webhooks
// ===========================================================================
async function finish(userId: string) {
  console.log("Recurring templates, rules, budgets, reports...");
  const next = (dd: number) => day(CUR + 1, dd);
  await post("recurring-invoices", {
    name: "Monthly Retainer - Metro Services",
    contactId: C.metro,
    frequency: "monthly",
    startDate: next(1),
    reference: "Retainer",
    currencyCode: "USD",
    createAsApproved: true,
    lines: [{ description: "Monthly retainer", quantity: 1, unitPrice: 7500, accountId: acct("4010"), taxRateId: T.exempt }],
  });
  await post("recurring", {
    name: "Monthly AWS",
    type: "bill",
    contactId: C.aws,
    frequency: "monthly",
    startDate: next(3),
    lines: [{ description: "AWS usage (estimate)", quantity: 1, unitPrice: 1250, accountId: acct("5230"), taxRateId: T.exempt }],
  });
  await post("recurring", {
    name: "Office rent",
    type: "bill",
    contactId: C.landlord,
    frequency: "monthly",
    startDate: next(1),
    lines: [{ description: "Office rent", quantity: 1, unitPrice: 3500, accountId: acct("5200"), taxRateId: T.exempt }],
  });
  await post("recurring-journals", {
    name: "Accrued audit fee",
    frequency: "monthly",
    startDate: next(28),
    maxOccurrences: 12,
    lines: [
      { description: "Year-end audit fee accrual", accountId: acct("5720"), debitAmount: 50000, creditAmount: 0 },
      { description: "Year-end audit fee accrual", accountId: acct("2300"), debitAmount: 0, creditAmount: 50000 },
    ],
  }).catch((err) => console.warn(`  recurring journal skipped: ${err.message}`));

  // Rules cover some recurring card lines; Staples, Uber, Slack, LinkedIn and
  // savings interest stay uncovered so the rule suggestions have something to show.
  await post("bank-rules", { name: "Zoom subscription", priority: 10, matchField: "description", matchType: "contains", matchValue: "ZOOM.US", accountId: acct("5230") });
  await post("bank-rules", { name: "Google Workspace", priority: 10, matchField: "description", matchType: "contains", matchValue: "GOOGLE WORKSPACE", accountId: acct("5230") });
  await post("bank-rules", { name: "Bank service fee", priority: 5, matchField: "description", matchType: "contains", matchValue: "SERVICE FEE", accountId: acct("5900") });

  const year = Number(TODAY.slice(0, 4));
  const fy = await db.query.fiscalYear.findFirst({ where: (f, { and: a, eq: e }) => a(e(f.organizationId, ORG), e(f.name, `FY ${year}`)) });
  const monthsOfYear = Array.from({ length: 12 }, (_, m) => {
    const start = `${year}-${String(m + 1).padStart(2, "0")}-01`;
    const end = isoDate(new Date(Date.UTC(year, m + 1, 0)));
    return { label: new Date(Date.UTC(year, m, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), startDate: start, endDate: end, sortOrder: m };
  });
  const budgetLine = (code: string, monthly: number) => ({
    accountId: acct(code),
    total: monthly * 12,
    periods: monthsOfYear.map((p) => ({ ...p, amount: monthly })),
  });
  await post("budgets", {
    name: `FY ${year} Operating Budget`,
    fiscalYearId: fy?.id ?? null,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    periodType: "monthly",
    lines: [
      budgetLine("4010", 2500000),
      budgetLine("4020", 1500000),
      budgetLine("5100", 2850000),
      budgetLine("5200", 350000),
      budgetLine("5230", 160000),
      budgetLine("5600", 150000),
    ],
  });

  const reports = [
    { name: "Open invoices", description: "Sent invoices still waiting for payment", config: { dataSource: "invoices", filters: [{ field: "status", operator: "equals", value: "sent" }], groupBy: [], columns: ["invoiceNumber", "contactName", "issueDate", "dueDate", "total", "amountDue"], chartType: "table" } },
    { name: "Monthly sales", description: "Invoices issued this year", config: { dataSource: "invoices", filters: [], groupBy: [], columns: ["issueDate", "contactName", "subtotal", "taxTotal", "total"], dateRange: { from: `${year}-01-01`, to: `${year}-12-31` }, chartType: "bar" } },
    { name: "Customer directory", description: "Customers with terms and credit limits", config: { dataSource: "contacts", filters: [{ field: "type", operator: "equals", value: "customer" }], groupBy: [], columns: ["name", "email", "phone", "paymentTermsDays", "creditLimit"], chartType: "table" } },
    { name: "Stock levels", description: "On-hand quantity against reorder points", config: { dataSource: "inventory", filters: [], groupBy: [], columns: ["code", "name", "category", "quantityOnHand", "reorderPoint", "salePrice"], chartType: "table" } },
    { name: "Large bank movements", description: "Bank lines over $5,000", config: { dataSource: "transactions", filters: [{ field: "amount", operator: "gt", value: "500000" }], groupBy: [], columns: ["date", "description", "payee", "amount", "status"], chartType: "table" } },
  ];
  for (const r of reports) await post("reports/saved", r);

  // Reminder rules use the canonical placeholders from lib/email/reminder-processor.ts.
  const sign = "<p>Thanks,<br/>{{organizationName}}</p>";
  const r1 = ent(
    await post("reminder-rules", {
      name: "Invoice Due in 7 Days",
      triggerType: "before_due",
      triggerDays: 7,
      enabled: true,
      documentType: "invoice",
      recipientType: "contact_email",
      subjectTemplate: "Invoice {{documentNumber}} from {{organizationName}} is due on {{dueDate}}",
      bodyTemplate: `<p>Hi {{contactName}},</p><p>A quick heads-up that invoice <strong>{{documentNumber}}</strong> for <strong>{{amountDue}}</strong> is due on {{dueDate}}.</p>${sign}`,
    })
  );
  const r2 = ent(
    await post("reminder-rules", {
      name: "Invoice overdue - 7 days",
      triggerType: "after_due",
      triggerDays: 7,
      enabled: true,
      documentType: "invoice",
      recipientType: "contact_email",
      subjectTemplate: "Reminder: invoice {{documentNumber}} is {{daysOverdue}} days overdue",
      bodyTemplate: `<p>Hi {{contactName}},</p><p>Invoice <strong>{{documentNumber}}</strong> for <strong>{{amountDue}}</strong> was due on {{dueDate}} and is now {{daysOverdue}} days overdue. If you've already paid, please ignore this note.</p>${sign}`,
    })
  );
  await post("reminder-rules", {
    name: "Final notice - 30 days overdue",
    triggerType: "after_due",
    triggerDays: 30,
    enabled: false,
    documentType: "invoice",
    recipientType: "contact_persons",
    subjectTemplate: "Final notice: invoice {{documentNumber}} from {{organizationName}}",
    bodyTemplate: `<p>Hi {{contactName}},</p><p>Invoice <strong>{{documentNumber}}</strong> for <strong>{{amountDue}}</strong> is {{daysOverdue}} days overdue. Please arrange payment this week.</p>${sign}`,
  });
  await post("reminder-rules", {
    name: "Bill due tomorrow",
    triggerType: "before_due",
    triggerDays: 1,
    enabled: true,
    documentType: "bill",
    recipientType: "custom",
    customEmails: ["ap@demo-company.com"],
    subjectTemplate: "Bill {{documentNumber}} for {{contactName}} is due on {{dueDate}}",
    bodyTemplate: "<p>Bill <strong>{{documentNumber}}</strong> from {{contactName}} for <strong>{{amountDue}}</strong> is due on {{dueDate}}.</p>",
  });
  // Reminder history for the overdue Bright Solutions invoice.
  const bright = INV.bright;
  if (bright) {
    const due = bright.dueDate as string;
    const brightRow = await db.query.invoice.findFirst({ where: eq(invoice.id, bright.id) });
    const log = (rule: string, date: string, subject: string) => ({
      organizationId: ORG,
      reminderRuleId: rule,
      documentType: "invoice",
      documentId: bright.id,
      recipientEmail: "ap@brightsolutions.com",
      subject,
      status: "sent" as const,
      sentAt: new Date(date + "T14:00:00Z"),
    });
    await db.insert(reminderLog).values([
      log(r1.id, addDays(due, -7), `Invoice ${brightRow!.invoiceNumber} from Demo Company is due on ${due}`),
      log(r2.id, addDays(due, 7), `Reminder: invoice ${brightRow!.invoiceNumber} is 7 days overdue`),
    ]);
  }

  const webhookEvents = ["invoice.created", "invoice.paid", "payment.received"];
  const hook = ent(
    await post("webhooks", {
      url: "https://hooks.demo-company.com/dubbl/sales",
      events: webhookEvents,
      description: "Sales events to the CRM sync service",
      isActive: true,
    })
  );
  await post("webhooks", {
    url: "https://erp.example.com/webhooks/dubbl",
    events: ["bill.created", "bill.due", "approval.requested"],
    description: "Legacy ERP bridge (paused)",
    isActive: false,
  });
  const recentPayments = await db.query.payment.findMany({
    where: (p, { eq: e }) => e(p.organizationId, ORG),
    orderBy: (p, { desc: d }) => d(p.date),
    limit: 3,
  });
  const deliveries = recentPayments.map((p, idx) => ({
    webhookId: hook.id,
    event: "payment.received",
    payload: { event: "payment.received", data: { id: p.id, paymentNumber: p.paymentNumber, amount: p.amount, currencyCode: p.currencyCode, date: p.date } },
    responseStatus: idx === 1 ? 502 : 200,
    responseBody: idx === 1 ? "Bad Gateway" : '{"ok":true}',
    status: idx === 1 ? ("retrying" as const) : ("success" as const),
    attempts: idx === 1 ? 2 : 1,
    deliveredAt: idx === 1 ? null : new Date(),
    nextRetryAt: idx === 1 ? new Date(Date.now() + 15 * 60 * 1000) : null,
  }));
  if (deliveries.length) await db.insert(webhookDelivery).values(deliveries);

  const brightRow = INV.bright ? await db.query.invoice.findFirst({ where: eq(invoice.id, INV.bright.id) }) : null;
  const notes: (typeof notification.$inferInsert)[] = [
    { organizationId: ORG, userId, type: "approval_needed", title: "Expense claim waiting for approval", body: "SaaS Summit conference: $759.50", entityType: "expense_claim" },
    { organizationId: ORG, userId, type: "inventory_low", title: "Low stock: USB-C Docking Station", body: "On hand is below the reorder point.", entityType: "inventory_item", entityId: I["DOCK-01"].id },
    { organizationId: ORG, userId, type: "payroll_due", title: "Pay run ready to review", body: `${monthLabel(CUR)} pay run is in draft.`, entityType: "payroll_run" },
  ];
  const acmePayment = await db.query.payment.findFirst({
    where: (p, { and: a, eq: e }) => a(e(p.organizationId, ORG), e(p.contactId, C.acme), e(p.type, "received")),
    orderBy: (p, { desc: d }) => d(p.date),
  });
  if (acmePayment) {
    notes.push({ organizationId: ORG, userId, type: "payment_received", title: "Payment received from Acme Corp", body: `${acmePayment.paymentNumber}: $${(acmePayment.amount / 100).toFixed(2)}`, entityType: "payment", entityId: acmePayment.id });
  }
  if (brightRow) {
    notes.push({ organizationId: ORG, userId, type: "invoice_overdue", title: `Invoice ${brightRow.invoiceNumber} is overdue`, body: "Bright Solutions", entityType: "invoice", entityId: brightRow.id, readAt: new Date() });
  }
  await db.insert(notification).values(notes);

  await api("PUT", "period-lock", { lockDate: OPENING_DATE, reason: "Opening balances" });
}

// ===========================================================================
// Main
// ===========================================================================
async function main() {
  console.log(`Seeding the demo company (history ${day(0, 1)} to ${TODAY})...\n`);
  const userId = await bootstrap();
  try {
    await setup();
    schedule();

    console.log("Running the timeline...");
    for (let i = 0; i <= CUR; i++) {
      // Tasks can add more tasks (e.g. a deposit the month after a pay run).
      for (;;) {
        const due = tasks
          .filter((t) => monthIndexOf(t.date) === i && !(t as any).done)
          .sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));
        if (!due.length) break;
        const t = due[0];
        (t as any).done = true;
        try {
          await t.fn();
        } catch (err) {
          throw new Error(`[${t.date} ${t.label}] ${(err as Error).message}`);
        }
      }
      await importStatements(i);
      await processStatements(i);
      if (i < CUR) await statementChecks(i);
      console.log(`  ${monthLabel(i)} done`);
    }

    await finish(userId);
  } finally {
    await db.delete(apiKey).where(eq(apiKey.keyHash, createHash("sha256").update(API_TOKEN).digest("hex")));
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, ORG));
  console.log(`\nStatement checks:\n  ${recDifferences.join("\n  ")}`);
  console.log(`\nDone: ${total} journal entries. Sign in as ${DEMO_EMAIL} / password123`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err);
    process.exit(1);
  });
