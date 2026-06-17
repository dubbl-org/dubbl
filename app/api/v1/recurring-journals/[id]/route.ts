import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate, recurringTemplateLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const legSchema = z
  .object({
    description: z.string().min(1),
    accountId: z.string().min(1),
    debitAmount: z.number().int().min(0).default(0),
    creditAmount: z.number().int().min(0).default(0),
    costCenterId: z.string().nullable().optional(),
  })
  .refine((l) => (l.debitAmount > 0) !== (l.creditAmount > 0), {
    message: "Each leg must have exactly one of debitAmount or creditAmount non-zero",
  });

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "semi_annual", "annual"]).optional(),
    status: z.enum(["active", "paused", "completed"]).optional(),
    endDate: z.string().nullable().optional(),
    maxOccurrences: z.number().int().min(1).nullable().optional(),
    reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    currencyCode: z.string().optional(),
    // When supplied, fully replaces the template's legs. Must stay balanced.
    lines: z.array(legSchema).min(2).optional(),
  })
  .refine(
    (b) => {
      if (!b.lines) return true;
      const dr = b.lines.reduce((s, l) => s + l.debitAmount, 0);
      const cr = b.lines.reduce((s, l) => s + l.creditAmount, 0);
      return dr === cr && dr > 0;
    },
    { message: "Journal must be balanced (total debits = total credits, non-zero)" }
  );

async function findJournalTemplate(id: string, organizationId: string) {
  return db.query.recurringTemplate.findFirst({
    where: and(
      eq(recurringTemplate.id, id),
      eq(recurringTemplate.organizationId, organizationId),
      eq(recurringTemplate.type, "journal"),
      notDeleted(recurringTemplate.deletedAt)
    ),
    with: { lines: true },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await findJournalTemplate(id, ctx.organizationId);
    if (!found) return notFound("Recurring journal");
    return NextResponse.json({ template: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:recurring");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await findJournalTemplate(id, ctx.organizationId);
    if (!existing) return notFound("Recurring journal");

    const { lines, ...header } = parsed;

    const [updated] = await db
      .update(recurringTemplate)
      .set({ ...header, updatedAt: new Date() })
      .where(eq(recurringTemplate.id, id))
      .returning();

    // Replace legs when supplied (validated balanced above).
    if (lines) {
      await db.delete(recurringTemplateLine).where(eq(recurringTemplateLine.templateId, id));
      await db.insert(recurringTemplateLine).values(
        lines.map((l, i) => ({
          templateId: id,
          description: l.description,
          accountId: l.accountId,
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          costCenterId: l.costCenterId || null,
          sortOrder: i,
        }))
      );
    }

    logAudit({
      ctx,
      action: "update",
      entityType: "recurring_journal",
      entityId: id,
      changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>),
      request,
    });

    return NextResponse.json({ template: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:recurring");

    const existing = await findJournalTemplate(id, ctx.organizationId);
    if (!existing) return notFound("Recurring journal");

    await db
      .update(recurringTemplate)
      .set(softDelete())
      .where(eq(recurringTemplate.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "recurring_journal",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
