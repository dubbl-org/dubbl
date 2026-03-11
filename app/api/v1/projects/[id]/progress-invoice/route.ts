import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  project,
  projectMilestone,
  timeEntry,
  invoice,
  invoiceLine,
} from "@/lib/db/schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, error, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

const progressInvoiceSchema = z.object({
  milestoneIds: z.array(z.string()).optional(),
  timeEntryIds: z.array(z.string()).optional(),
  percentageToInvoice: z.number().min(0).max(100).optional(),
  contactId: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
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
    const parsed = progressInvoiceSchema.parse(body);

    // Fetch project with milestones
    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
      with: { milestones: true },
    });

    if (!proj) return notFound("Project");
    if (proj.billingType === "non_billable") {
      return error("Project is non-billable", 400);
    }

    const contactId = parsed.contactId || proj.contactId;
    if (!contactId) {
      return validationError("No contact associated with project");
    }

    const today = new Date().toISOString().split("T")[0];
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 30);
    const issueDate = parsed.issueDate || today;
    const dueDate = parsed.dueDate || defaultDue.toISOString().split("T")[0];

    const lines: {
      description: string;
      quantity: number;
      unitPrice: number;
      amount: number;
    }[] = [];

    // Track milestones to update after invoice creation
    const milestoneUpdates: { id: string; newInvoicedAmount: number }[] = [];

    if (proj.billingType === "milestone" && parsed.milestoneIds?.length) {
      const selectedMilestones = proj.milestones.filter((m) =>
        parsed.milestoneIds!.includes(m.id)
      );

      for (const m of selectedMilestones) {
        const uninvoiced = m.amount - m.invoicedAmountCents;
        if (uninvoiced <= 0) continue;

        lines.push({
          description: `Milestone: ${m.title}`,
          quantity: 100, // 1.00
          unitPrice: uninvoiced,
          amount: uninvoiced,
        });

        milestoneUpdates.push({
          id: m.id,
          newInvoicedAmount: m.invoicedAmountCents + uninvoiced,
        });
      }
    } else if (proj.billingType === "hourly" && parsed.timeEntryIds?.length) {
      const entries = await db
        .select()
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.projectId, id),
            eq(timeEntry.isBillable, true),
            isNull(timeEntry.invoiceId),
            inArray(timeEntry.id, parsed.timeEntryIds)
          )
        );

      for (const te of entries) {
        const hours = te.minutes / 60;
        const rate = te.hourlyRate || proj.hourlyRate;
        const amount = Math.round(hours * rate);

        lines.push({
          description: te.description || `Time entry: ${hours.toFixed(2)} hrs`,
          quantity: Math.round(hours * 100), // hours as 2-decimal int
          unitPrice: rate,
          amount,
        });
      }
    } else if (proj.billingType === "fixed" && parsed.percentageToInvoice) {
      const pct = Math.min(100, Math.max(0, parsed.percentageToInvoice));
      const amount = Math.round((proj.fixedPrice * pct) / 100);

      lines.push({
        description: `${proj.name} - ${pct}% of fixed price`,
        quantity: 100, // 1.00
        unitPrice: amount,
        amount,
      });
    }

    if (lines.length === 0) {
      return validationError("No billable items to invoice");
    }

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);

    // Generate invoice number
    const invoiceNumber = await getNextNumber(
      ctx.organizationId,
      "invoice",
      "invoice_number",
      "INV"
    );

    // Create invoice
    const [newInvoice] = await db
      .insert(invoice)
      .values({
        organizationId: ctx.organizationId,
        contactId,
        invoiceNumber,
        issueDate,
        dueDate,
        status: "draft",
        reference: `Project: ${proj.name}`,
        notes: parsed.notes || null,
        subtotal,
        taxTotal: 0,
        total: subtotal,
        amountPaid: 0,
        amountDue: subtotal,
        currencyCode: proj.currency,
        createdBy: ctx.userId,
      })
      .returning();

    // Create invoice lines
    await db.insert(invoiceLine).values(
      lines.map((l, i) => ({
        invoiceId: newInvoice.id,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: 0,
        amount: l.amount,
        sortOrder: i,
      }))
    );

    // Update milestone invoiced amounts
    if (proj.billingType === "milestone" && milestoneUpdates.length > 0) {
      for (const mu of milestoneUpdates) {
        await db
          .update(projectMilestone)
          .set({ invoicedAmountCents: mu.newInvoicedAmount })
          .where(eq(projectMilestone.id, mu.id));
      }
    }

    // Update time entries with invoice ID
    if (proj.billingType === "hourly" && parsed.timeEntryIds?.length) {
      await db
        .update(timeEntry)
        .set({ invoiceId: newInvoice.id })
        .where(
          and(
            inArray(timeEntry.id, parsed.timeEntryIds),
            eq(timeEntry.projectId, id),
            isNull(timeEntry.invoiceId)
          )
        );
    }

    // Update project totalBilled
    await db
      .update(project)
      .set({
        totalBilled: proj.totalBilled + subtotal,
        updatedAt: new Date(),
      })
      .where(eq(project.id, id));

    return NextResponse.json({ invoice: newInvoice }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
      with: { milestones: true },
    });

    if (!proj) return notFound("Project");

    if (proj.billingType === "milestone") {
      const milestones = proj.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        amount: m.amount,
        invoicedAmountCents: m.invoicedAmountCents,
        remaining: m.amount - m.invoicedAmountCents,
        progressPercent: m.progressPercent,
      }));
      const totalRemaining = milestones.reduce((s, m) => s + m.remaining, 0);
      return NextResponse.json({ billingType: "milestone", milestones, totalRemaining });
    }

    if (proj.billingType === "hourly") {
      const entries = await db.query.timeEntry.findMany({
        where: and(
          eq(timeEntry.projectId, id),
          eq(timeEntry.isBillable, true),
          isNull(timeEntry.invoiceId)
        ),
        with: { user: true, task: true },
      });

      const totalAmount = entries.reduce((s, e) => {
        const hours = e.minutes / 60;
        const rate = e.hourlyRate || proj.hourlyRate;
        return s + Math.round(hours * rate);
      }, 0);

      return NextResponse.json({
        billingType: "hourly",
        timeEntries: entries.map((e) => ({
          id: e.id,
          date: e.date,
          description: e.description,
          minutes: e.minutes,
          hourlyRate: e.hourlyRate || proj.hourlyRate,
          amount: Math.round((e.minutes / 60) * (e.hourlyRate || proj.hourlyRate)),
          user: e.user,
          task: e.task,
        })),
        totalAmount,
      });
    }

    if (proj.billingType === "fixed") {
      // Sum all existing progress invoices for this project
      const invoicedLines = await db.execute(
        sql`SELECT COALESCE(SUM(il.amount), 0) as total_invoiced
            FROM invoice_line il
            JOIN invoice i ON il.invoice_id = i.id
            WHERE i.organization_id = ${ctx.organizationId}
              AND i.reference = ${"Project: " + proj.name}
              AND i.status != 'void'
              AND i.deleted_at IS NULL`
      );
      const rows = Array.isArray(invoicedLines)
        ? invoicedLines
        : (invoicedLines as { rows?: unknown[] }).rows ?? [];
      const totalInvoiced = Number((rows[0] as { total_invoiced?: number })?.total_invoiced || 0);
      const remaining = proj.fixedPrice - totalInvoiced;
      const invoicedPercent = proj.fixedPrice > 0 ? Math.round((totalInvoiced / proj.fixedPrice) * 100) : 0;

      return NextResponse.json({
        billingType: "fixed",
        fixedPrice: proj.fixedPrice,
        totalInvoiced,
        remaining,
        invoicedPercent,
      });
    }

    return NextResponse.json({ billingType: proj.billingType, message: "Non-billable project" });
  } catch (err) {
    return handleError(err);
  }
}
