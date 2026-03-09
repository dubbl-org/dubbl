import { db } from "@/lib/db";
import { payrollBonus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; bonusId: string }> }
) {
  try {
    const { bonusId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const [deleted] = await db
      .delete(payrollBonus)
      .where(eq(payrollBonus.id, bonusId))
      .returning();

    if (!deleted) return notFound("Bonus");

    logAudit({ ctx, action: "delete", entityType: "payrollBonus", entityId: bonusId, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
