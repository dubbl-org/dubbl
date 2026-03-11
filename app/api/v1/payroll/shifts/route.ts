import { db } from "@/lib/db";
import { shiftDefinition } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  shiftType: z.enum(["regular", "overtime", "night", "weekend", "holiday"]),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  premiumPercent: z.number().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:shifts");

    const shifts = await db.query.shiftDefinition.findMany({
      where: and(
        eq(shiftDefinition.organizationId, ctx.organizationId),
        notDeleted(shiftDefinition.deletedAt)
      ),
    });

    return ok({ data: shifts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:shifts");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [shift] = await db
      .insert(shiftDefinition)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "shiftDefinition", entityId: shift.id, request });

    return created({ shift });
  } catch (err) {
    return handleError(err);
  }
}
