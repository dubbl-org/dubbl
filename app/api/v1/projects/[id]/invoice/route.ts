import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, timeEntry, invoice, invoiceLine } from "@/lib/db/schema";
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
});

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

    if (unbilledEntries.length === 0) {
      return validationError("No unbilled time entries found");
    }

    const today = new Date().toISOString().split("T")[0];
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const issueDate = parsed.issueDate || today;
    const dueDate = parsed.dueDate || due.toISOString().split("T")[0];

    const invoiceNumber = await getNextNumber(ctx.organizationId, "invoice", "invoice_number", "INV");

    // Calculate totals from time entries
    let subtotal = 0;
    const lines = unbilledEntries.map((entry, i) => {
      const hours = entry.minutes / 60;
      const amount = Math.round(hours * entry.hourlyRate);
      subtotal += amount;

      return {
        description: entry.description || `Time entry: ${hours.toFixed(2)} hrs`,
        quantity: Math.round(hours * 100), // 2 decimal as int
        unitPrice: entry.hourlyRate,
        taxAmount: 0,
        amount,
        sortOrder: i,
      };
    });

    // Create invoice
    const [created] = await db
      .insert(invoice)
      .values({
        organizationId: ctx.organizationId,
        contactId: proj.contactId,
        invoiceNumber,
        issueDate,
        dueDate,
        notes: parsed.notes || `Invoice for project: ${proj.name}`,
        subtotal,
        taxTotal: 0,
        total: subtotal,
        amountPaid: 0,
        amountDue: subtotal,
        createdBy: ctx.userId,
      })
      .returning();

    // Create invoice lines
    await db.insert(invoiceLine).values(
      lines.map((l) => ({
        invoiceId: created.id,
        ...l,
      }))
    );

    // Mark time entries as invoiced
    for (const entry of unbilledEntries) {
      await db
        .update(timeEntry)
        .set({ invoiceId: created.id })
        .where(eq(timeEntry.id, entry.id));
    }

    // Update project totalBilled
    await db
      .update(project)
      .set({
        totalBilled: proj.totalBilled + subtotal,
        updatedAt: new Date(),
      })
      .where(eq(project.id, id));

    return NextResponse.json({ invoice: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
