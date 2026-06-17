import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, contact, organization, customerCredit, inventoryItem } from "@/lib/db/schema";
import { eq, and, desc, asc, gte, lte, ne, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { checkMonthlyLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { resolvePrice } from "@/lib/api/pricing";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  // Decimal unit price (e.g. 12.50). When omitted for an inventory-item line,
  // the price is resolved from the line/document price list (falling back to the
  // item's default sale price). An explicit value here always wins.
  unitPrice: z.number().optional(),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
  costCenterId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  // When set, sending this invoice relieves inventory and posts COGS for the item.
  inventoryItemId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  // Per-line price list override; falls back to the document-level priceListId.
  priceListId: z.string().nullable().optional(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.optional(),
  // Default price list applied to inventory-item lines that don't carry their own.
  priceListId: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
  // When true, exceeding the customer's credit limit hard-blocks the create
  // (HTTP 403) instead of returning a soft warning. Wired from an org policy.
  enforceCreditLimit: z.boolean().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  date: invoice.issueDate,
  due: invoice.dueDate,
  total: invoice.total,
  amountDue: invoice.amountDue,
  number: invoice.invoiceNumber,
  created: invoice.createdAt,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const contactId = url.searchParams.get("contactId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const conditions = [
      eq(invoice.organizationId, ctx.organizationId),
      notDeleted(invoice.deletedAt),
    ];

    if (status) {
      conditions.push(eq(invoice.status, status as typeof invoice.status.enumValues[number]));
    }
    if (contactId) {
      conditions.push(eq(invoice.contactId, contactId));
    }
    if (from) {
      conditions.push(gte(invoice.issueDate, from));
    }
    if (to) {
      conditions.push(lte(invoice.issueDate, to));
    }

    const sortCol = SORT_COLUMNS[sortBy] || invoice.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const invoices = await db.query.invoice.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(invoice)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(invoices, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.issueDate);
    await checkMonthlyLimit(ctx.organizationId, invoice, invoice.organizationId, invoice.createdAt, "invoicesPerMonth", invoice.deletedAt);

    // Resolve currency: explicit request > contact default > org default > USD.
    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      parsed.currencyCode,
      parsed.contactId
    );
    await checkMultiCurrency(ctx.organizationId, currencyCode);

    // Auto-calculate due date if not provided
    let dueDate = parsed.dueDate;
    if (!dueDate) {
      const contactRecord = await db.query.contact.findFirst({
        where: eq(contact.id, parsed.contactId),
        columns: { paymentTermsDays: true },
      });
      let termsDays = contactRecord?.paymentTermsDays;
      if (termsDays == null) {
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
          columns: { defaultPaymentTerms: true },
        });
        termsDays = org?.defaultPaymentTerms ? parseInt(org.defaultPaymentTerms) : 30;
      }
      const d = new Date(parsed.issueDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + (termsDays || 30));
      dueDate = d.toISOString().split("T")[0];
    }

    const invoiceNumber = await getNextNumber(ctx.organizationId, "invoice", "invoice_number", "INV");

    // Preload tax rates
    const taxRateIds = parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
    const ratesMap = await preloadTaxRates(taxRateIds);

    // Resolve default unit prices (integer cents) for inventory-item lines that
    // don't carry an explicit unitPrice: prefer the line/document price list,
    // then fall back to the item's default sale price. Lines with an explicit
    // unitPrice are unaffected. Item default prices are preloaded in one query.
    const itemIds = [
      ...new Set(
        parsed.lines
          .filter((l) => l.inventoryItemId && l.unitPrice === undefined)
          .map((l) => l.inventoryItemId as string)
      ),
    ];
    const itemPriceMap = new Map<string, number>();
    if (itemIds.length > 0) {
      const items = await db.query.inventoryItem.findMany({
        where: and(
          eq(inventoryItem.organizationId, ctx.organizationId),
          inArray(inventoryItem.id, itemIds)
        ),
        columns: { id: true, salePrice: true },
      });
      for (const it of items) itemPriceMap.set(it.id, it.salePrice);
    }

    // unitPriceCents per line, in the same order as parsed.lines.
    const unitPricesCents = await Promise.all(
      parsed.lines.map(async (l) => {
        // Explicit price always wins (caller override).
        if (l.unitPrice !== undefined) return decimalToCents(l.unitPrice);
        if (l.inventoryItemId) {
          const listId = l.priceListId || parsed.priceListId || null;
          if (listId) {
            const resolved = await resolvePrice(
              ctx.organizationId,
              l.inventoryItemId,
              listId,
              l.quantity || 1,
              parsed.issueDate
            );
            if (resolved) return resolved.unitPrice;
          }
          // Fall back to the item's default sale price.
          return itemPriceMap.get(l.inventoryItemId) ?? 0;
        }
        return 0;
      })
    );

    // Calculate totals
    let subtotal = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const unitPriceCents = unitPricesCents[i];
      const grossAmount = Math.round(l.quantity * unitPriceCents);
      const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
      const amount = grossAmount - discountAmount;
      subtotal += amount;
      const taxRateId = l.taxRateId || null;
      const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: unitPriceCents,
        accountId: l.accountId || null,
        taxRateId,
        discountPercent: l.discountPercent,
        taxAmount,
        amount,
        costCenterId: l.costCenterId || null,
        projectId: l.projectId || null,
        inventoryItemId: l.inventoryItemId || null,
        warehouseId: l.warehouseId || null,
        sortOrder: i,
      };
    });

    const taxTotal = processedLines.reduce((sum, l) => sum + l.taxAmount, 0);
    const total = subtotal + taxTotal;

    // Credit-limit check: outstanding = sum of non-void invoice.amountDue, less
    // any unapplied customer credit, plus the invoice being created. Compared to
    // the contact's creditLimit (null = no limit). Soft-warning by default; the
    // caller may pass enforceCreditLimit:true (e.g. an org policy) to hard-block.
    let creditLimitWarning: {
      creditLimit: number;
      currentOutstanding: number;
      projectedOutstanding: number;
      exceededBy: number;
    } | null = null;
    {
      const contactRecord = await db.query.contact.findFirst({
        where: and(
          eq(contact.id, parsed.contactId),
          eq(contact.organizationId, ctx.organizationId)
        ),
        columns: { creditLimit: true },
      });
      const creditLimit = contactRecord?.creditLimit ?? null;
      if (creditLimit != null) {
        const [dueRow] = await db
          .select({
            total: sql<number>`coalesce(sum(${invoice.amountDue}), 0)`.mapWith(Number),
          })
          .from(invoice)
          .where(
            and(
              eq(invoice.organizationId, ctx.organizationId),
              eq(invoice.contactId, parsed.contactId),
              ne(invoice.status, "void"),
              notDeleted(invoice.deletedAt)
            )
          );
        const [creditRow] = await db
          .select({
            total: sql<number>`coalesce(sum(${customerCredit.amountRemaining}), 0)`.mapWith(Number),
          })
          .from(customerCredit)
          .where(
            and(
              eq(customerCredit.organizationId, ctx.organizationId),
              eq(customerCredit.contactId, parsed.contactId),
              ne(customerCredit.status, "void"),
              notDeleted(customerCredit.deletedAt)
            )
          );
        const currentOutstanding =
          Number(dueRow?.total || 0) - Number(creditRow?.total || 0);
        const projectedOutstanding = currentOutstanding + total;
        if (projectedOutstanding > creditLimit) {
          creditLimitWarning = {
            creditLimit,
            currentOutstanding,
            projectedOutstanding,
            exceededBy: projectedOutstanding - creditLimit,
          };
          if (parsed.enforceCreditLimit) {
            return NextResponse.json(
              {
                error: `Credit limit exceeded: this invoice would put the customer at ${projectedOutstanding} cents against a limit of ${creditLimit} cents`,
                creditLimitWarning,
              },
              { status: 403 }
            );
          }
        }
      }
    }

    const [created] = await db
      .insert(invoice)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        invoiceNumber,
        issueDate: parsed.issueDate,
        dueDate,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal,
        total,
        amountPaid: 0,
        amountDue: total,
        currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(invoiceLine).values(
      processedLines.map((l) => ({
        invoiceId: created.id,
        ...l,
      }))
    );

    logAudit({ ctx, action: "create", entityType: "invoice", entityId: created.id, request });

    return NextResponse.json({ invoice: created, creditLimitWarning }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
