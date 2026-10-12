import { db } from "@/lib/db";
import { deal, dealActivity } from "@/lib/db/schema";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, gte, count } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

const TYPES = ["note", "email", "call", "meeting", "task"] as const;
type ActivityType = (typeof TYPES)[number];

/**
 * Every deal activity in the workspace, newest first, across all deals.
 *
 * Filters: `type` (note/email/call/meeting/task), `dealId`, `search` (in the
 * activity text) and `status`:
 *   - `planned`  scheduled, not done yet (upcoming or overdue)
 *   - `overdue`  scheduled in the past, not done
 *   - `done`     marked complete
 *   - `logged`   never scheduled and not marked done (a note or a call written up)
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const type = url.searchParams.get("type");
    const dealId = url.searchParams.get("dealId");
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");

    // Scope through the deal: activities have no organization column of their own
    const orgDeals = db
      .select({ id: deal.id })
      .from(deal)
      .where(and(eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)));

    const conditions = [inArray(dealActivity.dealId, orgDeals)];
    if (type && (TYPES as readonly string[]).includes(type)) conditions.push(eq(dealActivity.type, type as ActivityType));
    if (dealId) conditions.push(eq(dealActivity.dealId, dealId));
    if (search) conditions.push(ilike(dealActivity.content, `%${search}%`));
    const now = new Date();
    if (status === "done") conditions.push(isNotNull(dealActivity.completedAt));
    else if (status === "planned") conditions.push(isNotNull(dealActivity.scheduledAt), isNull(dealActivity.completedAt));
    else if (status === "overdue") conditions.push(lt(dealActivity.scheduledAt, now), isNull(dealActivity.completedAt));
    else if (status === "upcoming") conditions.push(gte(dealActivity.scheduledAt, now), isNull(dealActivity.completedAt));
    else if (status === "logged") conditions.push(isNull(dealActivity.scheduledAt), isNull(dealActivity.completedAt));

    const where = and(...conditions);
    const [{ total }] = await db.select({ total: count() }).from(dealActivity).where(where);

    const activities = await db.query.dealActivity.findMany({
      where,
      orderBy: desc(dealActivity.createdAt),
      limit,
      offset,
      with: {
        user: { columns: { id: true, name: true, email: true, image: true } },
        deal: {
          columns: { id: true, title: true, valueCents: true, currency: true, stageId: true, pipelineId: true, wonAt: true, lostAt: true },
          with: { contact: { columns: { id: true, name: true } } },
        },
      },
    });

    return ok(paginatedResponse(activities, total, page, limit));
  } catch (err) {
    return handleError(err);
  }
}
