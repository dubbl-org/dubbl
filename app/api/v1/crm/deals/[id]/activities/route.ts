import { db } from "@/lib/db";
import { dealActivity, deal } from "@/lib/db/schema";
import { eq, and, desc, asc, ilike, sql, count } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
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

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const type = url.searchParams.get("type") || "";
    const sortBy = url.searchParams.get("sortBy") || "date";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30")));
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(dealActivity.dealId, id)];
    if (type && ["note", "email", "call", "meeting", "task"].includes(type)) {
      conditions.push(eq(dealActivity.type, type as "note" | "email" | "call" | "meeting" | "task"));
    }
    if (search) {
      conditions.push(ilike(dealActivity.content, `%${search}%`));
    }

    const where = and(...conditions);

    // Sorting
    const orderFn = sortOrder === "asc" ? asc : desc;
    const orderCol =
      sortBy === "type" ? dealActivity.type : dealActivity.createdAt;

    // Count total (filtered)
    const [{ total }] = await db
      .select({ total: count() })
      .from(dealActivity)
      .where(where);

    // Count by type (unfiltered - always for this deal)
    const typeCounts = await db
      .select({ type: dealActivity.type, count: count() })
      .from(dealActivity)
      .where(eq(dealActivity.dealId, id))
      .groupBy(dealActivity.type);

    const counts: Record<string, number> = {};
    for (const row of typeCounts) {
      counts[row.type] = row.count;
    }

    // Fetch page
    const activities = await db.query.dealActivity.findMany({
      where,
      with: { user: true },
      orderBy: orderFn(orderCol),
      limit,
      offset,
    });

    const totalPages = Math.ceil(total / limit);
    const totalAll = typeCounts.reduce((sum, r) => sum + r.count, 0);

    return ok({
      activities,
      pagination: { page, limit, total, totalPages },
      typeCounts: counts,
      totalAll,
    });
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
