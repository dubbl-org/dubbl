import { db } from "@/lib/db";
import { contractorPayment, contractor } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  amount: z.number().int().min(1),
  currency: z.string().max(3).optional(),
  description: z.string().optional(),
  invoiceNumber: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const c = await db.query.contractor.findFirst({
      where: and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId),
        notDeleted(contractor.deletedAt)
      ),
    });
    if (!c) return notFound("Contractor");

    const payments = await db.query.contractorPayment.findMany({
      where: eq(contractorPayment.contractorId, id),
      orderBy: desc(contractorPayment.createdAt),
    });

    return ok({ data: payments });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [payment] = await db
      .insert(contractorPayment)
      .values({ contractorId: id, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "contractorPayment", entityId: payment.id, request });

    return created({ payment });
  } catch (err) {
    return handleError(err);
  }
}
