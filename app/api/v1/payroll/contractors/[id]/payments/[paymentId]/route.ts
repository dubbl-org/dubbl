import { db } from "@/lib/db";
import { contractor, contractorPayment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

// A payment is marked paid only by processing it (which posts the journal
// entry), so status here can only cancel a pending payment.
const updateSchema = z.object({
  amount: z.number().int().min(1).optional(),
  description: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  status: z.enum(["void"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const owner = await db.query.contractor.findFirst({
      where: and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId),
        notDeleted(contractor.deletedAt)
      ),
      columns: { id: true },
    });
    if (!owner) return notFound("Contractor");

    const payment = await db.query.contractorPayment.findFirst({
      where: and(eq(contractorPayment.id, paymentId), eq(contractorPayment.contractorId, owner.id)),
    });
    if (!payment) return notFound("Payment");
    if (payment.status !== "pending") return validationError("Only payments still to pay can be changed");

    const [updated] = await db
      .update(contractorPayment)
      .set(parsed)
      .where(eq(contractorPayment.id, paymentId))
      .returning();

    logAudit({ ctx, action: "update", entityType: "contractorPayment", entityId: paymentId, changes: parsed, request });

    return ok({ payment: updated });
  } catch (err) {
    return handleError(err);
  }
}
