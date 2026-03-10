import { db } from "@/lib/db";
import { consolidationGroup } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const groups = await db.query.consolidationGroup.findMany({
      where: and(
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
      with: {
        members: {
          with: { organization: true },
        },
      },
      orderBy: (g, { desc }) => [desc(g.createdAt)],
    });

    return ok({ groups });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [group] = await db
      .insert(consolidationGroup)
      .values({
        parentOrgId: ctx.organizationId,
        name: parsed.name,
      })
      .returning();

    return created({ group });
  } catch (err) {
    return handleError(err);
  }
}
