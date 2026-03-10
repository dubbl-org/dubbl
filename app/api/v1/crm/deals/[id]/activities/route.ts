import { db } from "@/lib/db";
import { dealActivity, deal } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    // Verify deal belongs to org
    const d = await db.query.deal.findFirst({
      where: and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId)),
    });
    if (!d) return notFound("Deal");

    const activities = await db.query.dealActivity.findMany({
      where: eq(dealActivity.dealId, id),
      with: { user: true },
      orderBy: desc(dealActivity.createdAt),
    });

    return ok({ activities });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  type: z.enum(["note", "email", "call", "meeting", "task"]),
  content: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const d = await db.query.deal.findFirst({
      where: and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId)),
    });
    if (!d) return notFound("Deal");

    const [activity] = await db
      .insert(dealActivity)
      .values({
        dealId: id,
        userId: ctx.userId,
        type: parsed.type,
        content: parsed.content || null,
        scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
      })
      .returning();

    return created({ activity });
  } catch (err) {
    return handleError(err);
  }
}
