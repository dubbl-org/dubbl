import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  project,
  projectBillableItem,
  timeEntry,
  invoice,
  invoiceLine,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

const invoiceSchema = z.object({
  issueDate: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  // Include registered (not-yet-billed) billable expenses on this invoice.
  includeBillableExpenses: z.boolean().optional().default(true),
  // Markup (basis points, 1000 = 10%) applied to billable expenses whose own
  // markup is 0 (i.e. a default markup at invoice time). Each item's stored
  // markup takes precedence when non-zero.
  defaultExpenseMarkupBasisPoints: z.number().int().min(0).optional().default(0),
});

/** Billed amount for a cost line = cost grossed up by the markup (basis points). */
function withMarkup(cost: number, markupBasisPoints: number): number {
  return Math.round(cost * (1 + markupBasisPoints / 10000));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = invoiceSchema.parse(body);

    // Verify project belongs to org
    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");
    if (!proj.contactId) {
      return validationError("Project must have a contact to generate an invoice");
    }

    // Get unbilled time entries
    const unbilledEntries = await db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.projectId, id),
        eq(timeEntry.isBillable, true),
        isNull(timeEntry.invoiceId)
      ),
    });

    // Get registered (not-yet-billed) billable expenses for this project.
    const billableItems = parsed.includeBillableExpenses
      ? await db
          .select()
          .from(projectBillableItem)
          .where(
            and(
              eq(projectBillableItem.organizationId, ctx.organizationId),
              eq(projectBillableItem.projectId, id),
              isNull(projectBillableItem.billedInvoiceId)
            )
          )
      : [];

    if (unbilledEntries.length === 0 && billableItems.length === 0) {
      return validationError("No unbilled time entries or billable expenses found");
    }

    const today = new Date().toISOString().split("T")[0];
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const issueDate = parsed.issueDate || today;
    const dueDate = parsed.dueDate || due.toISOString().split("T")[0];

    const invoiceNumber = await getNextNumber(ctx.organizationId, "invoice", "invoice_number", "INV");

    // Calculate totals from time entries (tagged with this projectId for job costing).
    let subtotal = 0;
    const lines: {
      description: string;
      quantity: number;
      unitPrice: number;
      taxAmount: number;
      amount: number;
      projectId: string;
      sortOrder: number;
    }[] = unbilledEntries.map((entry, i) => {
      const hours = entry.minutes / 60;
      const amount = Math.round(hours * entry.hourlyRate);
      subtotal += amount;

      return {
        description: entry.description || `Time entry: ${hours.toFixed(2)} hrs`,
        quantity: Math.round(hours * 100), // 2 decimal as int
        unitPrice: entry.hourlyRate,
        taxAmount: 0,
        amount,
        projectId: id,
        sortOrder: i,
      };
    });

    // Append billable-expense lines (cost grossed up by markup). The item's own
    // markup takes precedence; fall back to the request default when it's 0.
    const billedUpdates: { id: string; billedAmount: number }[] = [];
    billableItems.forEach((item, idx) => {
      const markup =
        item.markupBasisPoints > 0
          ? item.markupBasisPoints
          : parsed.defaultExpenseMarkupBasisPoints;
      const amount = withMarkup(item.costAmount, markup);
      subtotal += amount;
      lines.push({
        description: item.description,
        quantity: 100, // 1.00
        unitPrice: amount,
        taxAmount: 0,
        amount,
        projectId: id,
        sortOrder: unbilledEntries.length + idx,
      });
      billedUpdates.push({ id: item.id, billedAmount: amount });
    });

    // Create the invoice + lines, mark time entries + billable items billed, and
    // bump the project total atomically.
    const created = await db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(invoice)
        .values({
          organizationId: ctx.organizationId,
          contactId: proj.contactId!,
          invoiceNumber,
          issueDate,
          dueDate,
          notes: parsed.notes || `Invoice for project: ${proj.name}`,
          subtotal,
          taxTotal: 0,
          total: subtotal,
          amountPaid: 0,
          amountDue: subtotal,
          currencyCode: proj.currency,
          createdBy: ctx.userId,
        })
        .returning();

      if (lines.length > 0) {
        await tx.insert(invoiceLine).values(
          lines.map((l) => ({
            invoiceId: inv.id,
            ...l,
          }))
        );
      }

      // Mark time entries as invoiced.
      for (const entry of unbilledEntries) {
        await tx
          .update(timeEntry)
          .set({ invoiceId: inv.id })
          .where(eq(timeEntry.id, entry.id));
      }

      // Mark billable expenses as billed on this invoice.
      const now = new Date();
      for (const upd of billedUpdates) {
        await tx
          .update(projectBillableItem)
          .set({
            billedInvoiceId: inv.id,
            billedAmount: upd.billedAmount,
            billedAt: now,
          })
          .where(
            and(
              eq(projectBillableItem.id, upd.id),
              isNull(projectBillableItem.billedInvoiceId)
            )
          );
      }

      await tx
        .update(project)
        .set({
          totalBilled: proj.totalBilled + subtotal,
          updatedAt: new Date(),
        })
        .where(eq(project.id, id));

      return inv;
    });

    return NextResponse.json({ invoice: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
