import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { rejectRun } from "@/lib/api/payroll-run-actions";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().optional(),
});

/** Send the run back to draft, ending this round of sign-off. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:payroll");

    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.parse(body ?? {});

    const run = await rejectRun(ctx, id, parsed.reason);

    logAudit({ ctx, action: "reject", entityType: "payrollRun", entityId: id, request });

    return ok({ run });
  } catch (err) {
    return handleError(err);
  }
}
