import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quote, invoice, invoiceLine, contact, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

// Progress / milestone billing.
//
// By default (no body, or `percentage` omitted) the quote is converted to a single
// invoice for 100% of its REMAINING (un-billed) value — this preserves the original
// one-shot convert behavior.
//
// To bill only a portion, pass EITHER:
//   - `percentage`: 0 < p <= 100, the share of the quote TOTAL to bill this round; OR
//   - `lines`: per-quote-line quantities to bill (milestone billing on specific lines).
//
// `lines` takes precedence over `percentage` when both are supplied. Each progress
// invoice increments `quote.billedTotal`. The quote is marked `converted` once it is
// fully billed (billedTotal >= total); otherwise it stays `accepted` so further
// progress invoices can be raised. Over-billing past the quote total is rejected.

const convertSchema = z
  .object({
    // Percentage of the quote total to bill this round (1..100). When omitted and no
    // per-line quantities are given, the full remaining balance is billed.
    percentage: z.number().gt(0).max(100).optional(),
    // Per-line billing for milestone invoicing. quantity is in whole units (e.g. 1.5).
    lines: z
      .array(
        z.object({
          quoteLineId: z.string().min(1),
          quantity: z.number().gt(0),
        })
      )
      .optional(),
  })
  .optional();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    // Body is optional; tolerate empty/no body for the default 100% convert.
    let rawBody: unknown = undefined;
    try {
      const text = await request.text();
      if (text) rawBody = JSON.parse(text);
    } catch {
      rawBody = undefined;
    }
    const parsed = convertSchema.parse(rawBody);

    const found = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, ctx.organizationId),
        notDeleted(quote.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Quote");
    // Accepted quotes can be billed (possibly across several progress invoices).
    // A fully-billed quote ends up as "converted"; partial billing leaves it "accepted".
    if (found.status !== "accepted") {
      return NextResponse.json(
        { error: "Only accepted quotes can be converted to invoices" },
        { status: 400 }
      );
    }

    const alreadyBilled = found.billedTotal ?? 0;
    const remaining = found.total - alreadyBilled;
    if (remaining <= 0) {
      return NextResponse.json(
        { error: "Quote is already fully billed" },
        { status: 400 }
      );
    }

    // Sort lines deterministically so proportional rounding is stable.
    const quoteLines = [...found.lines].sort((a, b) => a.sortOrder - b.sortOrder);

    // Build the set of invoice lines for this billing round.
    type InvLine = {
      description: string;
      quantity: number; // 2-decimal-as-int (1.00 = 100)
      unitPrice: number; // cents
      accountId: string | null;
      taxRateId: string | null;
      discountPercent: number;
      taxAmount: number;
      amount: number; // net (pre-tax) cents for the billed portion
      costCenterId: string | null;
      projectId: string | null;
      inventoryItemId: string | null;
      warehouseId: string | null;
      sortOrder: number;
    };

    let billLines: InvLine[] = [];

    if (parsed?.lines && parsed.lines.length > 0) {
      // ----- Milestone billing: explicit per-line quantities -----
      const byId = new Map(quoteLines.map((l) => [l.id, l]));
      for (const sel of parsed.lines) {
        const ql = byId.get(sel.quoteLineId);
        if (!ql) {
          return NextResponse.json(
            { error: `Quote line ${sel.quoteLineId} not found on this quote` },
            { status: 400 }
          );
        }
      }
      billLines = parsed.lines.map((sel, i) => {
        const ql = byId.get(sel.quoteLineId)!;
        const billQty = Math.round(sel.quantity * 100); // to 2-dp-int
        const gross = Math.round((ql.unitPrice * billQty) / 100);
        const discount = ql.discountPercent
          ? Math.round((gross * ql.discountPercent) / 10000)
          : 0;
        const amount = gross - discount;
        // Tax proportional to the original line's effective tax rate on net.
        const taxAmount =
          ql.amount > 0 ? Math.round((ql.taxAmount * amount) / ql.amount) : 0;
        return {
          description: ql.description,
          quantity: billQty,
          unitPrice: ql.unitPrice,
          accountId: ql.accountId,
          taxRateId: ql.taxRateId,
          discountPercent: ql.discountPercent,
          taxAmount,
          amount,
          costCenterId: ql.costCenterId,
          projectId: null,
          inventoryItemId: null,
          warehouseId: null,
          sortOrder: i,
        };
      });
    } else if (parsed?.percentage != null) {
      // ----- Proportional billing: a percentage of every line -----
      const factor = parsed.percentage / 100;
      billLines = quoteLines.map((ql, i) => {
        const quantity = Math.round(ql.quantity * factor);
        const amount = Math.round(ql.amount * factor);
        const taxAmount = Math.round(ql.taxAmount * factor);
        return {
          description: ql.description,
          quantity,
          unitPrice: ql.unitPrice,
          accountId: ql.accountId,
          taxRateId: ql.taxRateId,
          discountPercent: ql.discountPercent,
          taxAmount,
          amount,
          costCenterId: ql.costCenterId,
          projectId: null,
          inventoryItemId: null,
          warehouseId: null,
          sortOrder: i,
        };
      });
    } else {
      // ----- Default: bill the full REMAINING balance -----
      if (alreadyBilled === 0) {
        // First and only invoice — copy lines verbatim (original behavior).
        billLines = quoteLines.map((ql, i) => ({
          description: ql.description,
          quantity: ql.quantity,
          unitPrice: ql.unitPrice,
          accountId: ql.accountId,
          taxRateId: ql.taxRateId,
          discountPercent: ql.discountPercent,
          taxAmount: ql.taxAmount,
          amount: ql.amount,
          costCenterId: ql.costCenterId,
          projectId: null,
          inventoryItemId: null,
          warehouseId: null,
          sortOrder: i,
        }));
      } else {
        // Bill whatever fraction of the total is still outstanding.
        const factor = found.total > 0 ? remaining / found.total : 0;
        billLines = quoteLines.map((ql, i) => ({
          description: ql.description,
          quantity: Math.round(ql.quantity * factor),
          unitPrice: ql.unitPrice,
          accountId: ql.accountId,
          taxRateId: ql.taxRateId,
          discountPercent: ql.discountPercent,
          taxAmount: Math.round(ql.taxAmount * factor),
          amount: Math.round(ql.amount * factor),
          costCenterId: ql.costCenterId,
          projectId: null,
          inventoryItemId: null,
          warehouseId: null,
          sortOrder: i,
        }));
      }
    }

    const subtotal = billLines.reduce((s, l) => s + l.amount, 0);
    const taxTotal = billLines.reduce((s, l) => s + l.taxAmount, 0);
    const invoiceTotal = subtotal + taxTotal;

    if (invoiceTotal <= 0) {
      return NextResponse.json(
        { error: "Nothing to bill: requested portion totals zero" },
        { status: 400 }
      );
    }
    if (invoiceTotal > remaining) {
      return NextResponse.json(
        {
          error: "Requested amount exceeds the un-billed balance of the quote",
          remaining,
          requested: invoiceTotal,
        },
        { status: 400 }
      );
    }

    const invoiceNumber = await getNextNumber(
      ctx.organizationId,
      "invoice",
      "invoice_number",
      "INV"
    );

    // Due date from contact payment terms (fallback to org default, then 30 days).
    const today = new Date().toISOString().split("T")[0];
    const contactRecord = await db.query.contact.findFirst({
      where: eq(contact.id, found.contactId),
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
    const dueDateObj = new Date(today + "T00:00:00Z");
    dueDateObj.setUTCDate(dueDateObj.getUTCDate() + (termsDays || 30));
    const dueDate = dueDateObj.toISOString().split("T")[0];

    const newBilledTotal = alreadyBilled + invoiceTotal;
    // Treat within-one-cent of full as fully billed (rounding tolerance).
    const fullyBilled = newBilledTotal >= found.total - 1;

    const result = await db.transaction(async (tx) => {
      const [createdInvoice] = await tx
        .insert(invoice)
        .values({
          organizationId: ctx.organizationId,
          contactId: found.contactId,
          invoiceNumber,
          issueDate: today,
          dueDate,
          reference: found.reference,
          notes: found.notes,
          subtotal,
          taxTotal,
          total: invoiceTotal,
          amountPaid: 0,
          amountDue: invoiceTotal,
          currencyCode: found.currencyCode,
          createdBy: ctx.userId,
        })
        .returning();

      const linesToInsert = billLines.filter((l) => l.amount !== 0 || l.taxAmount !== 0);
      if (linesToInsert.length > 0) {
        await tx.insert(invoiceLine).values(
          linesToInsert.map((l) => ({
            invoiceId: createdInvoice.id,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            accountId: l.accountId,
            taxRateId: l.taxRateId,
            discountPercent: l.discountPercent,
            taxAmount: l.taxAmount,
            amount: l.amount,
            costCenterId: l.costCenterId,
            sortOrder: l.sortOrder,
          }))
        );
      }

      const [updatedQuote] = await tx
        .update(quote)
        .set({
          billedTotal: newBilledTotal,
          // Only flip to "converted" once fully billed; partial billing keeps it
          // "accepted" so additional progress invoices can be raised.
          status: fullyBilled ? "converted" : "accepted",
          // Point at the most recent invoice; primarily meaningful for full convert.
          convertedInvoiceId: createdInvoice.id,
          updatedAt: new Date(),
        })
        .where(eq(quote.id, id))
        .returning();

      return { createdInvoice, updatedQuote };
    });

    logAudit({
      ctx,
      action: "convert",
      entityType: "quote",
      entityId: id,
      changes: {
        previousStatus: found.status,
        invoiced: invoiceTotal,
        billedTotal: newBilledTotal,
        quoteTotal: found.total,
        fullyBilled,
      },
      request,
    });

    return NextResponse.json({
      quote: result.updatedQuote,
      invoice: result.createdInvoice,
      billing: {
        invoiced: invoiceTotal,
        billedTotal: newBilledTotal,
        remaining: found.total - newBilledTotal,
        fullyBilled,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
