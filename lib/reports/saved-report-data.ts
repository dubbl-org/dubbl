/**
 * Data behind saved (custom) reports. One place that turns a ReportConfig
 * into rows, shared by the run API (/api/v1/reports/run), the saved-report
 * CSV export, the scheduled report emails and the MCP tools, so every surface
 * supports the same data sources and shows the same numbers.
 *
 * Money columns hold integer cents; `moneyColumns` lists them so callers can
 * format (UI) or convert to decimals (CSV / XLSX / PDF) without guessing.
 */
import { db } from "@/lib/db";
import {
  invoice,
  contact,
  inventoryItem,
  expenseClaim,
  bankTransaction,
  bankAccount,
  payrollRun,
  payrollItem,
  costCenter,
  organization,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, isNull, notInArray, gt } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { aggregateByDateRange, aggregateByDimension } from "@/lib/reports/gl-query";
import type { ReportConfig } from "@/lib/db/schema/reports";
import { SAVED_REPORT_SOURCES, isSavedReportSource, type DataSourceInfo } from "@/lib/reports/saved-report-sources";

export {
  SAVED_REPORT_SOURCES,
  SAVED_REPORT_SOURCE_KEYS,
  isSavedReportSource,
  type DataSourceInfo,
  type SavedReportSource,
} from "@/lib/reports/saved-report-sources";

type Row = Record<string, unknown>;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar months (YYYY-MM) covering [from, to]. */
function monthsBetween(from: string, to: string): { month: string; start: string; end: string }[] {
  const out: { month: string; start: string; end: string }[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    out.push({ month: `${y}-${String(m).padStart(2, "0")}`, start: start < from ? from : start, end: end > to ? to : end });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 120) break;
  }
  return out;
}

async function loadRows(organizationId: string, config: ReportConfig): Promise<Row[]> {
  const today = ymd(new Date());
  const yearStart = `${today.slice(0, 4)}-01-01`;

  switch (config.dataSource) {
    case "invoices": {
      const all = await db.query.invoice.findMany({
        where: and(eq(invoice.organizationId, organizationId), notDeleted(invoice.deletedAt)),
        with: { contact: true },
        orderBy: desc(invoice.createdAt),
      });
      return all.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contactName: inv.contact?.name || "-",
        status: inv.status,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        subtotal: inv.subtotal,
        taxTotal: inv.taxTotal,
        total: inv.total,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        currencyCode: inv.currencyCode,
      }));
    }

    case "contacts": {
      const all = await db.query.contact.findMany({
        where: and(eq(contact.organizationId, organizationId), notDeleted(contact.deletedAt)),
      });
      return all.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        type: c.type,
        phone: c.phone,
        paymentTermsDays: c.paymentTermsDays,
        creditLimit: c.creditLimit,
      }));
    }

    case "inventory": {
      const all = await db.query.inventoryItem.findMany({
        where: and(eq(inventoryItem.organizationId, organizationId), notDeleted(inventoryItem.deletedAt)),
      });
      return all.map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        category: i.category,
        purchasePrice: i.purchasePrice,
        salePrice: i.salePrice,
        quantityOnHand: i.quantityOnHand,
        reorderPoint: i.reorderPoint,
        isActive: i.isActive,
      }));
    }

    case "transactions": {
      const accounts = await db.query.bankAccount.findMany({
        where: eq(bankAccount.organizationId, organizationId),
        columns: { id: true },
      });
      if (accounts.length === 0) return [];
      const all = await db.query.bankTransaction.findMany({
        where: inArray(bankTransaction.bankAccountId, accounts.map((a) => a.id)),
        orderBy: desc(bankTransaction.date),
      });
      return all.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        status: t.status,
        payee: t.payee,
      }));
    }

    case "expenses": {
      const all = await db.query.expenseClaim.findMany({
        where: and(eq(expenseClaim.organizationId, organizationId), notDeleted(expenseClaim.deletedAt)),
        orderBy: desc(expenseClaim.createdAt),
      });
      return all.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        totalAmount: e.totalAmount,
        currencyCode: e.currencyCode,
        submittedAt: e.submittedAt ? ymd(e.submittedAt) : null,
        approvedAt: e.approvedAt ? ymd(e.approvedAt) : null,
        date: e.submittedAt ? ymd(e.submittedAt) : null,
      }));
    }

    case "payroll": {
      const runs = await db.query.payrollRun.findMany({
        where: and(eq(payrollRun.organizationId, organizationId), isNull(payrollRun.deletedAt)),
        columns: { id: true, payPeriodStart: true, payPeriodEnd: true },
      });
      if (runs.length === 0) return [];
      const byRun = new Map(runs.map((r) => [r.id, r]));
      const items = await db.query.payrollItem.findMany({
        where: inArray(payrollItem.payrollRunId, runs.map((r) => r.id)),
        with: { employee: { columns: { name: true } } },
      });
      return items.map((p) => {
        const run = byRun.get(p.payrollRunId);
        return {
          id: p.id,
          employeeName: p.employee?.name || "-",
          payPeriodStart: run?.payPeriodStart,
          payPeriodEnd: run?.payPeriodEnd,
          date: run?.payPeriodEnd,
          type: p.type,
          grossAmount: p.grossAmount,
          taxAmount: p.taxAmount,
          deductions: p.deductions,
          netAmount: p.netAmount,
        };
      });
    }

    case "profit_loss": {
      const from = config.dateRange?.from || yearStart;
      const to = config.dateRange?.to || today;
      const months = monthsBetween(from, to);
      const results = await Promise.all(
        months.map((m) =>
          aggregateByDateRange(organizationId, { startDate: m.start, endDate: m.end }, { accountTypes: ["revenue", "expense"] })
        )
      );
      return months.map((m, i) => {
        const revenue = results[i].filter((a) => a.type === "revenue").reduce((s, a) => s + a.balance, 0);
        const expenses = results[i].filter((a) => a.type === "expense").reduce((s, a) => s + a.balance, 0);
        return { month: m.month, revenue, expenses, net: revenue - expenses };
      });
    }

    case "ar_aging": {
      const asOf = config.dateRange?.to || today;
      const open = await db
        .select({
          contactName: contact.name,
          dueDate: invoice.dueDate,
          amountDue: invoice.amountDue,
        })
        .from(invoice)
        .innerJoin(contact, eq(invoice.contactId, contact.id))
        .where(
          and(
            eq(invoice.organizationId, organizationId),
            isNull(invoice.deletedAt),
            notInArray(invoice.status, ["draft", "void", "paid", "pending_approval", "rejected"]),
            gt(invoice.amountDue, 0)
          )
        );
      const asOfMs = Date.parse(asOf + "T00:00:00Z");
      const byContact = new Map<string, Row & { total: number }>();
      for (const r of open) {
        const days = Math.floor((asOfMs - Date.parse(r.dueDate + "T00:00:00Z")) / 86_400_000);
        const bucket = days <= 0 ? "current" : days <= 30 ? "30days" : days <= 60 ? "60days" : days <= 90 ? "90days" : "120plus";
        const row =
          byContact.get(r.contactName) ??
          { contact: r.contactName, current: 0, "30days": 0, "60days": 0, "90days": 0, "120plus": 0, total: 0 };
        row[bucket] = (row[bucket] as number) + r.amountDue;
        row.total += r.amountDue;
        byContact.set(r.contactName, row);
      }
      return [...byContact.values()].sort((a, b) => b.total - a.total);
    }

    case "cash_flow": {
      let from = config.dateRange?.from;
      const to = config.dateRange?.to || today;
      if (!from) {
        const d = new Date(Date.parse(to + "T00:00:00Z"));
        d.setUTCMonth(d.getUTCMonth() - 11, 1);
        from = ymd(d);
      }
      const accounts = await db.query.bankAccount.findMany({
        where: eq(bankAccount.organizationId, organizationId),
        columns: { id: true },
      });
      const months = monthsBetween(from, to);
      const totals = new Map(months.map((m) => [m.month, { month: m.month, inflows: 0, outflows: 0, net: 0 }]));
      if (accounts.length > 0) {
        const txns = await db.query.bankTransaction.findMany({
          where: inArray(bankTransaction.bankAccountId, accounts.map((a) => a.id)),
          columns: { date: true, amount: true },
        });
        for (const t of txns) {
          if (t.date < from || t.date > to) continue;
          const row = totals.get(t.date.slice(0, 7));
          if (!row) continue;
          if (t.amount >= 0) row.inflows += t.amount;
          else row.outflows += -t.amount;
          row.net += t.amount;
        }
      }
      return [...totals.values()];
    }

    case "expense_by_cost_center": {
      const from = config.dateRange?.from || yearStart;
      const to = config.dateRange?.to || today;
      const [groups, centers] = await Promise.all([
        aggregateByDimension(organizationId, { startDate: from, endDate: to }, "costCenterId", { accountTypes: ["expense"] }),
        db.query.costCenter.findMany({
          where: eq(costCenter.organizationId, organizationId),
          columns: { id: true, name: true },
        }),
      ]);
      const names = new Map(centers.map((c) => [c.id, c.name]));
      const rows = groups
        .map((g) => ({
          category: g.dimensionValue ? names.get(g.dimensionValue) ?? "Unknown" : "No department",
          amount: g.accounts.reduce((s, a) => s + a.balance, 0),
        }))
        .filter((r) => r.amount !== 0);
      const total = rows.reduce((s, r) => s + r.amount, 0);
      return rows
        .map((r) => ({ ...r, percentage: total ? Math.round((r.amount / total) * 1000) / 10 : 0 }))
        .sort((a, b) => b.amount - a.amount);
    }

    default:
      return [];
  }
}

/** Sources whose rows are already scoped to the date range (no row-level date filter). */
const RANGED_SOURCES = new Set(["profit_loss", "ar_aging", "cash_flow", "expense_by_cost_center"]);

export interface SavedReportResult {
  columns: string[];
  moneyColumns: string[];
  rows: Row[];
  /** Organization base currency; rows with their own currencyCode use that instead. */
  currency: string;
}

/**
 * Run a report config: load the rows for its data source, apply the date
 * range and filters, and keep only the chosen columns. Throws for an unknown
 * data source.
 */
export async function runSavedReportConfig(organizationId: string, config: ReportConfig): Promise<SavedReportResult> {
  if (!isSavedReportSource(config.dataSource)) {
    throw new Error(`Unknown data source "${config.dataSource}"`);
  }
  const info: DataSourceInfo = SAVED_REPORT_SOURCES[config.dataSource];
  const [loaded, org] = await Promise.all([
    loadRows(organizationId, config),
    db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { defaultCurrency: true },
    }),
  ]);
  let rows = loaded;

  if (config.dateRange && !RANGED_SOURCES.has(config.dataSource)) {
    const { from, to } = config.dateRange;
    rows = rows.filter((r) => {
      const date = (r.issueDate || r.date || "") as string;
      if (!date) return true;
      return date >= from && date <= to;
    });
  }

  for (const filter of config.filters ?? []) {
    rows = rows.filter((r) => {
      const val = String(r[filter.field] ?? "");
      switch (filter.operator) {
        case "equals": return val === filter.value;
        case "contains": return val.toLowerCase().includes(filter.value.toLowerCase());
        case "gt": return Number(val) > Number(filter.value);
        case "lt": return Number(val) < Number(filter.value);
        case "gte": return Number(val) >= Number(filter.value);
        case "lte": return Number(val) <= Number(filter.value);
        default: return true;
      }
    });
  }

  // Unknown column names (e.g. from an old config) fall back to the source's own columns.
  const chosen = (config.columns ?? []).filter((c) => info.columns.includes(c));
  let columns = chosen.length > 0 ? chosen : info.columns;
  if (info.keyColumn && !columns.includes(info.keyColumn)) columns = [info.keyColumn, ...columns];
  const projected = rows.map((r) => {
    const out: Row = {};
    for (const col of columns) out[col] = r[col] ?? null;
    return out;
  });

  return {
    columns,
    moneyColumns: info.moneyColumns.filter((c) => columns.includes(c)),
    rows: projected,
    currency: org?.defaultCurrency ?? "USD",
  };
}
