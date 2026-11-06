import { db } from "@/lib/db";
import { bulkImportJob, chartAccount, contact, invoice, invoiceLine, organization, taxRate } from "@/lib/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { calcTax } from "@/lib/api/tax-calculator";
import { findAccountForCode } from "@/lib/api/account-roles";
import { resolveAccountByCode } from "./reference-resolver";
import { parseMoney } from "./transformers";
import { preProcessInvoices } from "./pre-process";
import { validateImportRows } from "./validate-rows";
import { describeRows, groupRowsByKey } from "./csv-parse";
import type { SourceSystem } from "./types";
import { applyContactDefaults } from "@/lib/contact-defaults";
import { resolveTermsDays } from "@/lib/payment-terms";
import { decimalToMinorUnits } from "@/lib/money";
import { isValidCurrencyCode } from "@/lib/currency/iso4217";
import { emitInvoiceCreated } from "@/lib/webhooks/events";

/**
 * Invoice import
 * ==============
 * One CSV row per invoice LINE (the Xero / QuickBooks export shape). Rows that
 * share an invoiceNumber become one invoice with several lines; a row without
 * one is an invoice on its own. The customer is found by contactId, email or
 * name. Invoices come in as drafts with a new dubbl number (the original number
 * is kept as the reference when the file has no reference).
 *
 * Each invoice is imported on its own: a bad row only skips its invoice and is
 * reported with its row number.
 */

const text = z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v == null ? "" : String(v).trim()));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

// Legacy JSON shape (API callers): one row per invoice with a lines array.
const legacyLine = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().default(1),
  unitPrice: z.coerce.number().default(0),
  accountId: z.string().nullable().optional(),
  accountCode: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
});

export const invoiceImportRowSchema = z
  .object({
    invoiceNumber: text,
    contactId: text,
    contactName: text,
    contactEmail: text,
    issueDate: text,
    dueDate: text,
    reference: text,
    currencyCode: text,
    lineDescription: text,
    lineQuantity: text,
    lineUnitPrice: text,
    lineAmount: text,
    lineAccountCode: text,
    lineTaxRate: text,
    lines: z.array(legacyLine).optional(),
  })
  .superRefine((r, ctx) => {
    if (!r.contactId && !r.contactName && !r.contactEmail) {
      ctx.addIssue({ code: "custom", message: "Needs a customer (contact name, email or ID)" });
    }
    if (!isoDate.test(r.issueDate)) {
      ctx.addIssue({ code: "custom", message: r.issueDate ? `Issue date "${r.issueDate}" isn't a date` : "Issue date is required" });
    }
    if (r.dueDate && !isoDate.test(r.dueDate)) {
      ctx.addIssue({ code: "custom", message: `Due date "${r.dueDate}" isn't a date` });
    }
    if (!r.lineDescription && !(r.lines && r.lines.length)) {
      ctx.addIssue({ code: "custom", message: "Line description is required" });
    }
    if (r.lineQuantity && Number.isNaN(Number(r.lineQuantity.replace(/,/g, "")))) {
      ctx.addIssue({ code: "custom", message: `Quantity "${r.lineQuantity}" isn't a number` });
    }
    if (r.currencyCode && !isValidCurrencyCode(r.currencyCode.toUpperCase())) {
      ctx.addIssue({ code: "custom", message: `${r.currencyCode} isn't a currency code` });
    }
  });

export type InvoiceImportRow = z.infer<typeof invoiceImportRowSchema>;

interface ResolvedContact {
  id: string;
  name: string;
  paymentTermsDays: number | null;
  currencyCode: string | null;
  defaultRevenueAccountId: string | null;
  defaultTaxRateId: string | null;
  isTaxExempt: boolean;
}

/** Finds customers by id, email or name (case-insensitive), with a per-import cache. */
function contactResolver(organizationId: string) {
  const cache = new Map<string, ResolvedContact | null>();
  const columns = {
    id: true, name: true, paymentTermsDays: true, currencyCode: true,
    defaultRevenueAccountId: true, defaultTaxRateId: true, isTaxExempt: true,
  } as const;
  return async (r: InvoiceImportRow): Promise<ResolvedContact | null> => {
    const key = `${r.contactId}|${r.contactEmail.toLowerCase()}|${r.contactName.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key)!;
    const base = [eq(contact.organizationId, organizationId), notDeleted(contact.deletedAt)];
    let found: ResolvedContact | undefined;
    if (r.contactId && /^[0-9a-f-]{36}$/i.test(r.contactId)) {
      found = await db.query.contact.findFirst({ where: and(...base, eq(contact.id, r.contactId)), columns });
    }
    if (!found && r.contactEmail) {
      found = await db.query.contact.findFirst({ where: and(...base, ilike(contact.email, r.contactEmail)), columns });
    }
    if (!found && r.contactName) {
      found = await db.query.contact.findFirst({ where: and(...base, ilike(contact.name, r.contactName)), columns });
    }
    cache.set(key, found ?? null);
    return found ?? null;
  };
}

function contactLabel(r: InvoiceImportRow) {
  return r.contactName || r.contactEmail || r.contactId;
}

/** Tax rate by name ("VAT 20%") or percentage ("20%", "20"), per import. */
function taxRateResolver(organizationId: string) {
  let rates: { id: string; name: string; rate: number }[] | null = null;
  return async (value: string): Promise<{ id: string; rate: number } | null> => {
    if (!value) return null;
    rates ??= await db
      .select({ id: taxRate.id, name: taxRate.name, rate: taxRate.rate })
      .from(taxRate)
      .where(and(eq(taxRate.organizationId, organizationId), eq(taxRate.isActive, true), notDeleted(taxRate.deletedAt)));
    const v = value.trim().toLowerCase();
    const byName = rates.find((t) => t.name.toLowerCase() === v);
    if (byName) return byName;
    const pct = /^(\d+(?:\.\d+)?)\s*%?$/.exec(v);
    if (pct) {
      const bp = Math.round(parseFloat(pct[1]) * 100);
      return rates.find((t) => t.rate === bp) ?? null;
    }
    return null;
  };
}

async function resolveAccountByName(organizationId: string, name: string): Promise<string | null> {
  const found = await db.query.chartAccount.findFirst({
    where: and(eq(chartAccount.organizationId, organizationId), ilike(chartAccount.name, name.trim()), notDeleted(chartAccount.deletedAt)),
    columns: { id: true },
  });
  return found?.id ?? null;
}

function decimalOf(value: string): number | null {
  if (!value) return null;
  return parseMoney(value) / 100;
}

export interface InvoiceImportResult {
  totalRows: number;
  processedRows: number;
  errorRows: number;
  invoicesCreated: number;
  errorDetails: { row: number; error: string }[];
}

/** Validate rows the way the import will, plus whether each row's customer exists. */
export async function previewInvoiceImport(
  organizationId: string,
  rawRows: Record<string, unknown>[],
  source: SourceSystem
) {
  const rows = preProcessInvoices(rawRows, source);
  const findContact = contactResolver(organizationId);
  return Promise.all(
    rows.map(async (row, i) => {
      const result = invoiceImportRowSchema.safeParse(row);
      const errors = result.success ? [] : result.error.issues.map((e) => e.message);
      if (result.success && !(await findContact(result.data))) {
        errors.push(`Customer "${contactLabel(result.data)}" not found. Import or add contacts first.`);
      }
      return { row: i + 1, data: row, valid: errors.length === 0, errors };
    })
  );
}

/**
 * Import invoice rows (already mapped to the field names above) and record a
 * bulk import job. Amounts in the file are decimals ("1,250.00").
 */
export async function importInvoices(
  ctx: { organizationId: string; userId: string },
  fileName: string,
  rawRows: Record<string, unknown>[],
  source: SourceSystem
): Promise<{ jobId: string; result: InvoiceImportResult }> {
  const { organizationId } = ctx;
  const transformed = preProcessInvoices(rawRows, source);
  const checked = validateImportRows(transformed, invoiceImportRowSchema);

  const [job] = await db.insert(bulkImportJob).values({
    organizationId,
    type: "invoices",
    fileName,
    totalRows: transformed.length,
    status: "processing",
    createdBy: ctx.userId,
  }).returning();

  const errorDetails = [...checked.invalid];
  let processedRows = 0;
  let invoicesCreated = 0;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true, defaultPaymentTerms: true },
  });
  const salesAccountId = (await findAccountForCode(organizationId, "4000"))?.id ?? null;
  const findContact = contactResolver(organizationId);
  const findTaxRate = taxRateResolver(organizationId);
  const accountByCode = new Map<string, string | null>();

  const groups = groupRowsByKey(checked.rows, (r) => r.invoiceNumber, checked.rowNumbers);

  for (const group of groups) {
    const first = group.rows[0];
    try {
      const c = await findContact(first);
      if (!c) throw new Error(`Customer "${contactLabel(first)}" not found. Import or add contacts first.`);

      const currency = (first.currencyCode || c.currencyCode || org?.defaultCurrency || "USD").toUpperCase();

      // Build lines from the flat columns (or the legacy lines array).
      const rawLines: { description: string; quantity: number; unitPrice: number | null; amount: number | null; accountId: string | null; taxRateId: string | null | undefined; taxBp: number | null }[] = [];
      for (const r of group.rows) {
        if (r.lines?.length) {
          for (const l of r.lines) {
            let accountId = l.accountId ?? null;
            if (!accountId && l.accountCode) accountId = await resolveAccountByCode(organizationId, l.accountCode);
            rawLines.push({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: null, accountId, taxRateId: l.taxRateId, taxBp: null });
          }
          continue;
        }
        let accountId: string | null = null;
        if (r.lineAccountCode) {
          if (!accountByCode.has(r.lineAccountCode)) {
            // Code first ("4000"), then name ("Sales"): QuickBooks exports names.
            accountByCode.set(
              r.lineAccountCode,
              (await resolveAccountByCode(organizationId, r.lineAccountCode)) ??
                (await resolveAccountByName(organizationId, r.lineAccountCode))
            );
          }
          accountId = accountByCode.get(r.lineAccountCode) ?? null;
          if (!accountId) throw new Error(`Account "${r.lineAccountCode}" not found`);
        }
        let taxRateId: string | null | undefined = undefined;
        let taxBp: number | null = null;
        if (r.lineTaxRate) {
          const t = await findTaxRate(r.lineTaxRate);
          if (!t && !/^(none|no tax|0%?|tax exempt|exempt)$/i.test(r.lineTaxRate)) {
            throw new Error(`Tax rate "${r.lineTaxRate}" not found`);
          }
          taxRateId = t?.id ?? null;
          taxBp = t?.rate ?? null;
        }
        rawLines.push({
          description: r.lineDescription,
          quantity: r.lineQuantity ? Number(r.lineQuantity.replace(/,/g, "")) : 1,
          unitPrice: decimalOf(r.lineUnitPrice),
          amount: decimalOf(r.lineAmount),
          accountId,
          taxRateId,
          taxBp,
        });
      }

      // Contact defaults (income account, tax rate, "Don't charge tax"), then
      // the organization's sales account for anything still without one.
      const lines = applyContactDefaults(
        rawLines,
        {
          revenueAccountId: c.defaultRevenueAccountId,
          expenseAccountId: null,
          taxRateId: c.defaultTaxRateId,
          isTaxExempt: c.isTaxExempt,
        },
        "sales"
      ).map((l) => ({ ...l, accountId: l.accountId || salesAccountId }));

      const missingRate = lines.filter((l) => l.taxRateId && l.taxBp == null).map((l) => l.taxRateId as string);
      const rateById = new Map<string, number>();
      if (missingRate.length) {
        const found = await db.select({ id: taxRate.id, rate: taxRate.rate }).from(taxRate).where(eq(taxRate.organizationId, organizationId));
        for (const t of found) rateById.set(t.id, t.rate);
      }

      let subtotal = 0;
      const processedLines = lines.map((l, j) => {
        const unitPrice = l.unitPrice != null ? decimalToMinorUnits(l.unitPrice, currency) : null;
        const amount = l.amount != null
          ? decimalToMinorUnits(l.amount, currency)
          : Math.round(l.quantity * (unitPrice ?? 0));
        subtotal += amount;
        const bp = l.taxRateId ? l.taxBp ?? rateById.get(l.taxRateId) ?? 0 : 0;
        return {
          description: l.description,
          quantity: Math.round(l.quantity * 100),
          unitPrice: unitPrice ?? (l.quantity ? Math.round(amount / l.quantity) : amount),
          accountId: l.accountId,
          taxRateId: l.taxRateId ?? null,
          taxAmount: l.taxRateId ? calcTax(amount, bp) : 0,
          amount,
          sortOrder: j,
        };
      });
      const taxTotal = processedLines.reduce((s, l) => s + l.taxAmount, 0);
      const total = subtotal + taxTotal;

      let dueDate = first.dueDate;
      if (!dueDate) {
        const d = new Date(first.issueDate + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + resolveTermsDays(c.paymentTermsDays, org?.defaultPaymentTerms));
        dueDate = d.toISOString().split("T")[0];
      }

      const invoiceNumber = await getNextNumber(organizationId, "invoice", "invoice_number", "INV");
      const created = await db.transaction(async (tx) => {
        const [inv] = await tx.insert(invoice).values({
          organizationId,
          contactId: c.id,
          invoiceNumber,
          issueDate: first.issueDate,
          dueDate,
          reference: first.reference || first.invoiceNumber || null,
          subtotal,
          taxTotal,
          total,
          amountPaid: 0,
          amountDue: total,
          currencyCode: currency,
          createdBy: ctx.userId,
        }).returning();
        await tx.insert(invoiceLine).values(processedLines.map((l) => ({ invoiceId: inv.id, ...l })));
        return inv;
      });
      emitInvoiceCreated(organizationId, [created.id]);
      processedRows += group.rows.length;
      invoicesCreated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      for (const n of group.rowNumbers) {
        errorDetails.push({
          row: n,
          error: group.rowNumbers.length > 1 ? `${message} (${describeRows(group.rowNumbers)}, invoice ${group.key})` : message,
        });
      }
    }
  }

  errorDetails.sort((a, b) => a.row - b.row);
  const result: InvoiceImportResult = {
    totalRows: transformed.length,
    processedRows,
    errorRows: errorDetails.length,
    invoicesCreated,
    errorDetails,
  };

  await db.update(bulkImportJob).set({
    processedRows,
    errorRows: result.errorRows,
    errorDetails: errorDetails.length > 0 ? errorDetails : null,
    status: processedRows === 0 ? "failed" : "completed",
    completedAt: new Date(),
  }).where(eq(bulkImportJob.id, job.id));

  return { jobId: job.id, result };
}
