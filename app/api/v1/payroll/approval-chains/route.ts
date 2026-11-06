import { db } from "@/lib/db";
import { approvalChain, approvalChainStep } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { approversInOrg } from "@/lib/api/payroll-run-actions";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    stepOrder: z.number().int(),
    approverId: z.string().uuid(),
  })).optional(),
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
      with: { steps: { with: { approver: { with: { user: { columns: { name: true, email: true } } } } } } },
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
    const { steps, ...parsed } = createSchema.parse(body);

    if (steps && !(await approversInOrg(ctx.organizationId, steps.map((s) => s.approverId)))) {
      return validationError("Every approver must be a member of this workspace");
    }

    const chain = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(approvalChain)
        .values({ organizationId: ctx.organizationId, ...parsed })
        .returning();
      if (steps && steps.length > 0) {
        await tx.insert(approvalChainStep).values(steps.map((s) => ({ chainId: row.id, ...s })));
      }
      return row;
    });

    logAudit({ ctx, action: "create", entityType: "approvalChain", entityId: chain.id, request });

    return created({ chain });
  } catch (err) {
    return handleError(err);
  }
}
