import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill, billLine, organization, taxRate } from "@/lib/db/schema";
import { eq, and, desc, sql, ne, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { linkBillToPurchaseOrders } from "./_procurement";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
  // FU-SURFACE: procurement / inventory / job-costing dimensions.
  inventoryItemId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  // Link to a goods-receipt line for three-way match / GRNI clearing.
  goodsReceiptLineId: z.string().nullable().optional(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  // Optional supplier invoice number (their reference) — drives duplicate
  // detection. When omitted we auto-number with getNextNumber.
  billNumber: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.optional(),
  // Optional purchase orders this bill draws from (join-table linkage).
  purchaseOrderIds: z.array(z.string()).optional(),
  lines: z.array(lineSchema).min(1),
  // When the client has acknowledged a duplicate warning, pass true to post
  // anyway (only relevant under the 'warn' strategy).
  confirmDuplicate: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(bill.organizationId, ctx.organizationId),
      notDeleted(bill.deletedAt),
    ];

    if (status) {
      conditions.push(eq(bill.status, status as typeof bill.status.enumValues[number]));
    }

    const bills = await db.query.bill.findMany({
      where: and(...conditions),
      orderBy: desc(bill.createdAt),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(bill)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(bills, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.issueDate);

    // Resolve currency: explicit request > contact default > org default > USD.
    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      parsed.currencyCode,
      parsed.contactId
    );

    // A supplier-supplied invoice number drives duplicate detection; otherwise
    // we auto-number (auto-numbered bills are unique by construction).
    const billNumber =
      parsed.billNumber?.trim() ||
      (await getNextNumber(ctx.organizationId, "bill", "bill_number", "BILL"));

    // DUPLICATE-BILL DETECTION: same org + contact + bill number on a non-void
    // bill. Honour the org's duplicateBillStrategy ('off' | 'warn' | 'block' |
    // 'hold'), defaulting to 'warn'.
    let heldForDuplicate = false;
    if (parsed.billNumber?.trim()) {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { duplicateBillStrategy: true },
      });
      const strategy = org?.duplicateBillStrategy ?? "warn";
      if (strategy !== "off") {
        const dup = await db.query.bill.findFirst({
          where: and(
            eq(bill.organizationId, ctx.organizationId),
            eq(bill.contactId, parsed.contactId),
            eq(bill.billNumber, billNumber),
            ne(bill.status, "void"),
            notDeleted(bill.deletedAt)
          ),
          columns: { id: true, billNumber: true, total: true },
        });
        if (dup) {
          if (strategy === "block") {
            return NextResponse.json(
              {
                error: `A bill with number "${billNumber}" already exists for this supplier`,
                duplicate: { id: dup.id, billNumber: dup.billNumber },
              },
              { status: 409 }
            );
          }
          if (strategy === "warn" && !parsed.confirmDuplicate) {
            return NextResponse.json(
              {
                error: `A bill with number "${billNumber}" already exists for this supplier`,
                warning: "duplicate_bill",
                duplicate: { id: dup.id, billNumber: dup.billNumber },
                hint: "Resubmit with confirmDuplicate=true to create it anyway",
              },
              { status: 409 }
            );
          }
          // strategy === 'hold' (or confirmed 'warn'): create, flagging holds.
          if (strategy === "hold") heldForDuplicate = true;
        }
      }
    }

    // Preload tax rates
    const taxRateIds = parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
    const ratesMap = await preloadTaxRates(taxRateIds);
    // Preload each line's tax KIND so we can detect reverse-charge: the supplier
    // charges no VAT on a reverse-charge line (the buyer self-accounts it), so
    // that VAT must NOT be part of the amount payable to the supplier.
    const kindMap = new Map<string, string>();
    if (taxRateIds.length > 0) {
      const kinds = await db
        .select({ id: taxRate.id, kind: taxRate.kind })
        .from(taxRate)
        .where(inArray(taxRate.id, [...new Set(taxRateIds)]));
      for (const k of kinds) kindMap.set(k.id, k.kind);
    }

    // Calculate totals
    let subtotal = 0;
    // VAT that is self-accounted (reverse charge) — included in taxTotal/total
    // for reporting, but NETTED OUT of amountDue because the supplier is paid net.
    let reverseChargeVat = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const grossAmount = decimalToCents(l.quantity * l.unitPrice);
      const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
      const amount = grossAmount - discountAmount;
      subtotal += amount;
      const taxRateId = l.taxRateId || null;
      const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
      if (taxRateId && kindMap.get(taxRateId) === "reverse_charge") {
        reverseChargeVat += taxAmount;
      }
      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: decimalToCents(l.unitPrice),
        accountId: l.accountId || null,
        taxRateId,
        discountPercent: l.discountPercent,
        taxAmount,
        amount,
        // FU-SURFACE: persist inventory / warehouse / project / GRN dimensions.
        inventoryItemId: l.inventoryItemId || null,
        warehouseId: l.warehouseId || null,
        projectId: l.projectId || null,
        goodsReceiptLineId: l.goodsReceiptLineId || null,
        sortOrder: i,
      };
    });

    const taxTotal = processedLines.reduce((sum, l) => sum + l.taxAmount, 0);
    const total = subtotal + taxTotal;
    // The supplier is paid NET of any reverse-charge VAT (that VAT never goes to
    // the supplier — the buyer self-accounts it), so a full payment must settle
    // the net amount and not over-debit Accounts Payable.
    const amountDue = total - reverseChargeVat;

    const [created] = await db
      .insert(bill)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        billNumber,
        issueDate: parsed.issueDate,
        dueDate: parsed.dueDate,
        // 'hold' strategy parks a suspected duplicate for review rather than
        // posting it straight to draft.
        status: heldForDuplicate ? "pending_approval" : "draft",
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal,
        total,
        amountPaid: 0,
        amountDue,
        currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(billLine).values(
      processedLines.map((l) => ({
        billId: created.id,
        ...l,
      }))
    );

    // Link any source purchase orders (join table supports multiple bills/PO).
    if (parsed.purchaseOrderIds && parsed.purchaseOrderIds.length > 0) {
      await linkBillToPurchaseOrders(created.id, parsed.purchaseOrderIds);
    }

    logAudit({ ctx, action: "create", entityType: "bill", entityId: created.id, request });

    return NextResponse.json(
      { bill: created, held: heldForDuplicate || undefined },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
