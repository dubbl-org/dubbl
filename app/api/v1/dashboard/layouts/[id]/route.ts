import { db } from "@/lib/db";
import { dashboardLayout } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const layout = await db.query.dashboardLayout.findFirst({
      where: and(
        eq(dashboardLayout.id, id),
        eq(dashboardLayout.organizationId, ctx.organizationId),
        eq(dashboardLayout.userId, ctx.userId)
      ),
    });

    if (!layout) return notFound("Layout");
    return ok({ layout });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  layout: z
    .array(
      z.object({
        widgetType: z.string(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(dashboardLayout)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(dashboardLayout.id, id),
          eq(dashboardLayout.organizationId, ctx.organizationId),
          eq(dashboardLayout.userId, ctx.userId)
        )
      )
      .returning();

    if (!updated) return notFound("Layout");
    return ok({ layout: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const [deleted] = await db
      .delete(dashboardLayout)
      .where(
        and(
          eq(dashboardLayout.id, id),
          eq(dashboardLayout.organizationId, ctx.organizationId),
          eq(dashboardLayout.userId, ctx.userId)
        )
      )
      .returning();

    if (!deleted) return notFound("Layout");
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
