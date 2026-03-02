import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createInvoiceJournalEntry } from "@/lib/api/journal-automation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Invoice");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft invoices can be sent" },
        { status: 400 }
      );
    }

    // Create journal entry
    const entry = await createInvoiceJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        invoiceNumber: found.invoiceNumber,
        total: found.total,
        taxTotal: found.taxTotal,
        subtotal: found.subtotal,
        lines: found.lines.map((l) => ({
          accountId: l.accountId,
          amount: l.amount,
          taxAmount: l.taxAmount,
        })),
        date: found.issueDate,
      }
    );

    const [updated] = await db
      .update(invoice)
      .set({
        status: "sent",
        sentAt: new Date(),
        journalEntryId: entry?.id || null,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, id))
      .returning();

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    return handleError(err);
  }
}
