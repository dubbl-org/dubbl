import { db } from "@/lib/db";
import { deal } from "@/lib/db/schema";
import { eq, and, desc, asc, isNull, isNotNull, ilike } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const pipelineId = url.searchParams.get("pipelineId");
    const stageId = url.searchParams.get("stageId");
    const search = url.searchParams.get("search");
    const source = url.searchParams.get("source");
    const status = url.searchParams.get("status"); // active, won, lost
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const conditions = [
      eq(deal.organizationId, ctx.organizationId),
      notDeleted(deal.deletedAt),
    ];
    if (pipelineId) conditions.push(eq(deal.pipelineId, pipelineId));
    if (stageId) conditions.push(eq(deal.stageId, stageId));
    if (source) conditions.push(eq(deal.source, source as "website" | "referral" | "cold_outreach" | "event" | "other"));
    if (search) conditions.push(ilike(deal.title, `%${search}%`));
    if (status === "active") {
      conditions.push(isNull(deal.wonAt));
      conditions.push(isNull(deal.lostAt));
    } else if (status === "won") {
      conditions.push(isNotNull(deal.wonAt));
    } else if (status === "lost") {
      conditions.push(isNotNull(deal.lostAt));
    }

    const orderFn = sortOrder === "asc" ? asc : desc;
    let orderCol;
    switch (sortBy) {
      case "value": orderCol = deal.valueCents; break;
      case "name": orderCol = deal.title; break;
      case "probability": orderCol = deal.probability; break;
      default: orderCol = deal.createdAt;
    }

    const all = await db.query.deal.findMany({
      where: and(...conditions),
      with: { contact: true, assignedUser: true },
      orderBy: orderFn(orderCol),
    });

    const total = all.length;
    const data = all.slice(offset, offset + limit);

    // Always compute summary stats from unfiltered active deals for the pipeline bar
    const allDeals = await db.query.deal.findMany({
      where: and(
        eq(deal.organizationId, ctx.organizationId),
        notDeleted(deal.deletedAt),
        ...(pipelineId ? [eq(deal.pipelineId, pipelineId)] : []),
      ),
    });

    const activeDeals = allDeals.filter((d) => !d.wonAt && !d.lostAt);
    const activeCount = activeDeals.length;
    const activeValue = activeDeals.reduce((s, d) => s + d.valueCents, 0);
    const wonCount = allDeals.filter((d) => d.wonAt).length;
    const wonValue = allDeals.filter((d) => d.wonAt).reduce((s, d) => s + d.valueCents, 0);

    // Stage distribution from ALL active deals (not paginated/filtered)
    const stageMap: Record<string, { count: number; value: number }> = {};
    for (const d of activeDeals) {
      if (!stageMap[d.stageId]) stageMap[d.stageId] = { count: 0, value: 0 };
      stageMap[d.stageId].count++;
      stageMap[d.stageId].value += d.valueCents;
    }

    return ok({
      ...paginatedResponse(data, total, page, limit),
      summary: { activeCount, activeValue, wonCount, wonValue, totalDeals: allDeals.length, stageDistribution: stageMap },
    });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  pipelineId: z.string().uuid(),
  stageId: z.string(),
  contactId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  valueCents: z.number().int().min(0).optional(),
  currency: z.string().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  source: z.enum(["website", "referral", "cold_outreach", "event", "other"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [d] = await db
      .insert(deal)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "deal", entityId: d.id, request });

    return created({ deal: d });
  } catch (err) {
    return handleError(err);
  }
}
