import { db } from "@/lib/db";
import { timesheet } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:timesheets");

    const ts = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.id, id),
        eq(timesheet.organizationId, ctx.organizationId),
        notDeleted(timesheet.deletedAt)
      ),
    });

    if (!ts) return notFound("Timesheet");
    if (ts.status !== "draft" && ts.status !== "rejected") {
      return validationError("Only draft or sent-back timesheets can be submitted");
    }
    if (ts.totalHours <= 0) return validationError("Add the hours worked before submitting");

    const [updated] = await db
      .update(timesheet)
      .set({ status: "submitted", submittedAt: new Date(), rejectionReason: null, updatedAt: new Date() })
      .where(eq(timesheet.id, id))
      .returning();

    logAudit({ ctx, action: "submit", entityType: "timesheet", entityId: id, request });

    return ok({ timesheet: updated });
  } catch (err) {
    return handleError(err);
  }
}
