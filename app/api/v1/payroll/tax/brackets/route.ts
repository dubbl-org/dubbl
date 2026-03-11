import { db } from "@/lib/db";
import { taxBracket } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  jurisdictionLevel: z.enum(["federal", "state", "local"]),
  jurisdiction: z.string().optional(),
  minIncome: z.number().int(),
  maxIncome: z.number().int().nullable().optional(),
  rate: z.number().int().min(0).max(10000),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");

    const brackets = await db.query.taxBracket.findMany({
      where: and(
        eq(taxBracket.organizationId, ctx.organizationId),
        notDeleted(taxBracket.deletedAt)
      ),
      orderBy: asc(taxBracket.minIncome),
    });

    return ok({ data: brackets });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [bracket] = await db
      .insert(taxBracket)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "taxBracket", entityId: bracket.id, request });

    return created({ bracket });
  } catch (err) {
    return handleError(err);
  }
}
