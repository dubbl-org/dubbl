import { db } from "@/lib/db";
import { leaveRequest } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { syncLeaveBalances } from "@/lib/api/leave-balances";
import { z } from "zod";

// Approving and rejecting go through their own routes (they need
// approve:payroll); this only edits the note or cancels the request.
const updateSchema = z.object({
  status: z.enum(["cancelled"]).optional(),
  reason: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:leave");

    const req = await db.query.leaveRequest.findFirst({
      where: and(
        eq(leaveRequest.id, id),
        eq(leaveRequest.organizationId, ctx.organizationId)
      ),
      with: { employee: true, policy: true },
    });

    if (!req) return notFound("Leave request");
    return ok({ request: req });
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
    requireRole(ctx, "manage:leave");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.leaveRequest.findFirst({
      where: and(
        eq(leaveRequest.id, id),
        eq(leaveRequest.organizationId, ctx.organizationId)
      ),
    });
    if (!existing) return notFound("Leave request");
    if (!parsed.status && !parsed.reason) return validationError("Nothing to change");
    if (parsed.status === "cancelled" && existing.status !== "pending" && existing.status !== "approved") {
      return validationError("Only pending or approved requests can be cancelled");
    }

    // The reason for cancelling goes with the other decision notes, so the
    // employee's own note on the request is kept.
    const [updated] = await db
      .update(leaveRequest)
      .set({
        ...(parsed.status ? { status: parsed.status } : {}),
        ...(parsed.reason ? { rejectionReason: parsed.reason } : {}),
      })
      .where(and(
        eq(leaveRequest.id, id),
        eq(leaveRequest.organizationId, ctx.organizationId)
      ))
      .returning();

    // Cancelling approved leave gives the hours back.
    if (parsed.status === "cancelled" && existing.status === "approved") {
      await syncLeaveBalances(ctx.organizationId, {
        employeeIds: [existing.employeeId],
        year: Number(existing.startDate.slice(0, 4)),
      });
    }

    logAudit({ ctx, action: "update", entityType: "leaveRequest", entityId: id, changes: parsed, request });

    return ok({ request: updated });
  } catch (err) {
    return handleError(err);
  }
}
