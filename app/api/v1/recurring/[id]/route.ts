import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate, recurringTemplateLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { resumeSchedule } from "@/lib/api/recurring-schedule";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  // Move the next run, e.g. to skip one or restart after a pause.
  nextRunDate: z.string().min(1).optional(),
  // Replaces every line when sent (unitPrice in dollars, like create).
  lines: z.array(lineSchema).min(1).optional(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "semi_annual", "annual"]).optional(),
  status: z.enum(["active", "paused", "completed"]).optional(),
  endDate: z.string().nullable().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        notDeleted(recurringTemplate.deletedAt)
      ),
      with: {
        contact: true,
        lines: true,
      },
    });

    if (!found) return notFound("Recurring template");
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

    const existing = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        notDeleted(recurringTemplate.deletedAt)
      ),
    });

    if (!existing) return notFound("Recurring template");

    const { lines, ...header } = parsed;
    if (lines && existing.type === "journal") {
      return NextResponse.json(
        { error: "Edit recurring journal lines from Recurring journals" },
        { status: 400 }
      );
    }

    // Resuming a paused schedule skips the dates it missed (unless the caller
    // sets the next run date themselves).
    const resumed =
      existing.status === "paused" && header.status === "active" && !header.nextRunDate
        ? resumeSchedule(
            { ...existing, endDate: header.endDate !== undefined ? header.endDate : existing.endDate },
            new Date().toISOString().split("T")[0]
          )
        : {};

    const [updated] = await db
      .update(recurringTemplate)
      .set({ ...header, ...resumed, updatedAt: new Date() })
      .where(eq(recurringTemplate.id, id))
      .returning();

    if (lines) {
      await db.delete(recurringTemplateLine).where(eq(recurringTemplateLine.templateId, id));
      await db.insert(recurringTemplateLine).values(
        lines.map((l, i) => ({
          templateId: id,
          description: l.description,
          quantity: Math.round(l.quantity * 100),
          unitPrice: Math.round(l.unitPrice * 100),
          accountId: l.accountId || null,
          taxRateId: l.taxRateId || null,
          discountPercent: l.discountPercent,
          sortOrder: i,
        }))
      );
    }

    logAudit({ ctx, action: "update", entityType: "recurring_template", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

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

    const existing = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        notDeleted(recurringTemplate.deletedAt)
      ),
    });

    if (!existing) return notFound("Recurring template");

    await db
      .update(recurringTemplate)
      .set(softDelete())
      .where(eq(recurringTemplate.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "recurring_template",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
