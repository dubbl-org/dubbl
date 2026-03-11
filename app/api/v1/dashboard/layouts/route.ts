import { db } from "@/lib/db";
import { dashboardLayout } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const layouts = await db.query.dashboardLayout.findMany({
      where: and(
        eq(dashboardLayout.organizationId, ctx.organizationId),
        eq(dashboardLayout.userId, ctx.userId)
      ),
      orderBy: dashboardLayout.createdAt,
    });

    return ok({ layouts });
  } catch (err) {
    return handleError(err);
  }
}

const widgetSchema = z.object({
  widgetType: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  isDefault: z.boolean().optional(),
  layout: z.array(widgetSchema),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [layout] = await db
      .insert(dashboardLayout)
      .values({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        ...parsed,
      })
      .returning();

    return created({ layout });
  } catch (err) {
    return handleError(err);
  }
}
