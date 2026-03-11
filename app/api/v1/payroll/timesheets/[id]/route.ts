import { db } from "@/lib/db";
import { timesheet } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
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
    requireRole(ctx, "manage:timesheets");

    const ts = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.id, id),
        eq(timesheet.organizationId, ctx.organizationId),
        notDeleted(timesheet.deletedAt)
      ),
      with: { employee: true, entries: true },
    });

    if (!ts) return notFound("Timesheet");
    return ok({ timesheet: ts });
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
    requireRole(ctx, "manage:timesheets");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(timesheet)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(
        eq(timesheet.id, id),
        eq(timesheet.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Timesheet");
    return ok({ timesheet: updated });
  } catch (err) {
    return handleError(err);
  }
}
