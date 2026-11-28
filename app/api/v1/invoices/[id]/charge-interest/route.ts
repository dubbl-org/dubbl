import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoice,
  invoiceLine,
  organization,
  journalEntry,
  journalLine,
  chartAccount,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, validationError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToMinorUnits } from "@/lib/money";
import {
  calculateSimpleInterest,
  calculateCompoundInterest,
} from "@/lib/api/interest-calculator";
import { z } from "zod";

const bodySchema = z.object({
  amount: z.number().optional(), // decimal override, converted to cents
});

class InvoiceNoLongerChargeable extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    // Get original invoice
    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!found) return notFound("Invoice");

    // Verify overdue
    const today = new Date().toISOString().slice(0, 10);
    if (found.dueDate >= today) {
      return validationError("Invoice is not overdue");
    }

    if (found.status === "draft" || found.status === "void" || found.status === "paid") {
      return validationError("Cannot charge interest on this invoice status");
    }

    // Get org settings
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    if (!org?.interestRate) {
      return validationError("No interest rate configured for this organization");
    }

    const interestRate = org.interestRate;
    const interestMethod = org.interestMethod || "simple";
    const graceDays = org.interestGraceDays || 0;

    // Calculate interest
    const dueDate = new Date(found.dueDate);
    const now = new Date(today);
    const diffMs = now.getTime() - dueDate.getTime();
    const totalDaysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const daysOverdue = totalDaysOverdue - graceDays;

    if (daysOverdue <= 0) {
      return validationError("Invoice is within grace period");
    }

    const calculateInterest =
      interestMethod === "compound"
        ? calculateCompoundInterest
        : calculateSimpleInterest;

    const calculatedInterest = calculateInterest(
      found.amountDue,
      interestRate,
      daysOverdue
    );

    // Allow override of amount
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.parse(body);
    const interestAmountCents = parsed.amount
      ? decimalToMinorUnits(parsed.amount, found.currencyCode)
      : calculatedInterest;

    if (interestAmountCents <= 0) {
      return validationError("Interest amount must be positive");
    }

    // AR and Interest Income must both exist before any write happens: without
    // them the journal entry would be posted with no lines (unbalanced).
    const arAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "1200")
      ),
    });
    const interestIncomeAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "4100")
      ),
    });
    if (!arAccount || !interestIncomeAccount) {
      return validationError(
        "Chart of accounts is missing the AR (1200) or Interest Income (4100) account"
      );
    }

    // getNextNumber opens its own transaction and we want its row-level lock
    // released before we open the outer tx, so take it here.
    const invoiceNumber = await getNextNumber(
      ctx.organizationId,
      "invoice",
      "invoice_number",
      "INV"
    );

    const { interestInvoice, journalEntry: je } = await db.transaction(
      async (tx) => {
        // Lock the source invoice row and re-check the fields the write
        // depends on. A concurrent payment or void could change amountDue or
        // status between the pre-read and the posting.
        const locked = await tx.execute(
          sql`SELECT id, status, amount_due, due_date FROM invoice
              WHERE id = ${id} AND organization_id = ${ctx.organizationId} AND deleted_at IS NULL
              FOR UPDATE`
        );
        const lockedRows = Array.isArray(locked)
          ? locked
          : (locked as { rows?: unknown[] }).rows ?? [];
        const lockedRow = lockedRows[0] as
          | { id: string; status: string; amount_due: number; due_date: string }
          | undefined;
        if (!lockedRow) {
          throw new InvoiceNoLongerChargeable("Invoice not found");
        }
        if (
          lockedRow.status === "draft" ||
          lockedRow.status === "void" ||
          lockedRow.status === "paid"
        ) {
          throw new InvoiceNoLongerChargeable(
            "Cannot charge interest on this invoice status"
          );
        }
        if (lockedRow.due_date >= today) {
          throw new InvoiceNoLongerChargeable("Invoice is not overdue");
        }

        const [interestInvoice] = await tx
          .insert(invoice)
          .values({
            organizationId: ctx.organizationId,
            contactId: found.contactId,
            invoiceNumber,
            issueDate: today,
            dueDate: today,
            status: "sent",
            reference: `Interest on ${found.invoiceNumber}`,
            notes: `Late payment interest charge for invoice ${found.invoiceNumber} (${daysOverdue} days overdue)`,
            subtotal: interestAmountCents,
            taxTotal: 0,
            total: interestAmountCents,
            amountPaid: 0,
            amountDue: interestAmountCents,
            currencyCode: found.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();

        await tx.insert(invoiceLine).values({
          invoiceId: interestInvoice.id,
          description: `Late payment interest on invoice ${found.invoiceNumber} (${daysOverdue} days overdue at ${interestRate / 100}% p.a.)`,
          quantity: 100,
          unitPrice: interestAmountCents,
          taxAmount: 0,
          amount: interestAmountCents,
          sortOrder: 0,
        });

        // Allocate the entry number inside the tx so a rollback un-reserves it.
        const [{ max }] = await tx
          .select({
            max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
          })
          .from(journalEntry)
          .where(eq(journalEntry.organizationId, ctx.organizationId));
        const entryNumber = (max || 0) + 1;

        const [je] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: today,
            description: `Interest charge for overdue invoice ${found.invoiceNumber}`,
            reference: invoiceNumber,
            status: "posted",
            sourceType: "invoice",
            sourceId: interestInvoice.id,
            createdBy: ctx.userId,
            postedAt: new Date(),
          })
          .returning();

        await tx.insert(journalLine).values([
          {
            journalEntryId: je.id,
            accountId: arAccount.id,
            description: `Interest receivable - ${found.invoiceNumber}`,
            debitAmount: interestAmountCents,
            creditAmount: 0,
          },
          {
            journalEntryId: je.id,
            accountId: interestIncomeAccount.id,
            description: `Interest income - ${found.invoiceNumber}`,
            debitAmount: 0,
            creditAmount: interestAmountCents,
          },
        ]);

        await tx
          .update(invoice)
          .set({ journalEntryId: je.id })
          .where(eq(invoice.id, interestInvoice.id));

        return { interestInvoice, journalEntry: je };
      }
    );

    logAudit({ ctx, action: "charge_interest", entityType: "invoice", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json(
      {
        invoice: { ...interestInvoice, journalEntryId: je.id },
        journalEntry: je,
        originalInvoiceId: id,
        daysOverdue,
        interestAmount: interestAmountCents,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof InvoiceNoLongerChargeable) {
      return validationError(err.message);
    }
    return handleError(err);
  }
}
