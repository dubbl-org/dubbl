import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reminderRule } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  triggerType: z.enum(["before_due", "on_due", "after_due"]).optional(),
  triggerDays: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
  subjectTemplate: z.string().min(1).optional(),
  bodyTemplate: z.string().min(1).optional(),
  documentType: z.enum(["invoice", "bill"]).optional(),
  recipientType: z.enum(["contact_email", "contact_persons", "custom"]).optional(),
  customEmails: z.array(z.string().email()).nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const rule = await db.query.reminderRule.findFirst({
      where: and(
        eq(reminderRule.id, id),
        eq(reminderRule.organizationId, ctx.organizationId),
        notDeleted(reminderRule.deletedAt)
      ),
    });
    if (!rule) return notFound("Reminder rule");
    return NextResponse.json(rule);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(reminderRule)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(reminderRule.id, id),
          eq(reminderRule.organizationId, ctx.organizationId),
          notDeleted(reminderRule.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Reminder rule");
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");
    const { id } = await params;

    const [deleted] = await db
      .update(reminderRule)
      .set(softDelete())
      .where(
        and(
          eq(reminderRule.id, id),
          eq(reminderRule.organizationId, ctx.organizationId),
          notDeleted(reminderRule.deletedAt)
        )
      )
      .returning();

    if (!deleted) return notFound("Reminder rule");
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
