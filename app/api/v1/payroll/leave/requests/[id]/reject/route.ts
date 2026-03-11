import { db } from "@/lib/db";
import { leaveRequest } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().optional(),
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

    const req = await db.query.leaveRequest.findFirst({
      where: eq(leaveRequest.id, id),
    });

    if (!req) return notFound("Leave request");
    if (req.status !== "pending") return validationError("Only pending requests can be rejected");

    const [updated] = await db
      .update(leaveRequest)
      .set({
        status: "rejected",
        rejectionReason: parsed.reason || null,
      })
      .where(eq(leaveRequest.id, id))
      .returning();

    logAudit({ ctx, action: "reject", entityType: "leaveRequest", entityId: id, request });

    return ok({ request: updated });
  } catch (err) {
    return handleError(err);
  }
}
