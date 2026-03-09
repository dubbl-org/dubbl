import { db } from "@/lib/db";
import { payslip } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payslips");

    const ps = await db.query.payslip.findFirst({
      where: eq(payslip.id, id),
      with: { payrollRun: true, employee: true, payrollItem: true },
    });

    if (!ps) return notFound("Payslip");

    // Mark as viewed
    if (ps.status === "generated" || ps.status === "sent") {
      await db
        .update(payslip)
        .set({ status: "viewed", viewedAt: new Date() })
        .where(eq(payslip.id, id));
    }

    return ok({ payslip: ps });
  } catch (err) {
    return handleError(err);
  }
}
