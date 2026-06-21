import { db } from "@/lib/db";
import { leaveRequest } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
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

    const [updated] = await db
      .update(leaveRequest)
      .set(parsed)
      .where(and(
        eq(leaveRequest.id, id),
        eq(leaveRequest.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Leave request");
    return ok({ request: updated });
  } catch (err) {
    return handleError(err);
  }
}
