import { db } from "@/lib/db";
import { contractorPayment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  amount: z.number().int().min(1).optional(),
  description: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  status: z.enum(["pending", "paid", "void"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { paymentId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(contractorPayment)
      .set(parsed)
      .where(eq(contractorPayment.id, paymentId))
      .returning();

    if (!updated) return notFound("Payment");

    logAudit({ ctx, action: "update", entityType: "contractorPayment", entityId: paymentId, changes: parsed, request });

    return ok({ payment: updated });
  } catch (err) {
    return handleError(err);
  }
}
