import { db } from "@/lib/db";
import { timesheet } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().min(1).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:payroll");

    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.parse(body);

    const ts = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.id, id),
        eq(timesheet.organizationId, ctx.organizationId),
        notDeleted(timesheet.deletedAt)
      ),
    });

    if (!ts) return notFound("Timesheet");
    if (ts.status !== "submitted") return validationError("Only submitted timesheets can be rejected");

    const [updated] = await db
      .update(timesheet)
      .set({
        status: "rejected",
        rejectionReason: parsed.reason || null,
        updatedAt: new Date(),
      })
      .where(eq(timesheet.id, id))
      .returning();

    logAudit({ ctx, action: "reject", entityType: "timesheet", entityId: id, request });

    return ok({ timesheet: updated });
  } catch (err) {
    return handleError(err);
  }
}
