import { db } from "@/lib/db";
import { leaveRequest } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
  reason: z.string().optional(),
});

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
      .where(eq(leaveRequest.id, id))
      .returning();

    if (!updated) return notFound("Leave request");
    return ok({ request: updated });
  } catch (err) {
    return handleError(err);
  }
}
