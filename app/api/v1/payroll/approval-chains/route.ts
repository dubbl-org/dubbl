import { db } from "@/lib/db";
import { approvalChain } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:payroll");

    const chains = await db.query.approvalChain.findMany({
      where: and(
        eq(approvalChain.organizationId, ctx.organizationId),
        notDeleted(approvalChain.deletedAt)
      ),
      with: { steps: { with: { approver: true } } },
    });

    return ok({ data: chains });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:payroll");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [chain] = await db
      .insert(approvalChain)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "approvalChain", entityId: chain.id, request });

    return created({ chain });
  } catch (err) {
    return handleError(err);
  }
}
