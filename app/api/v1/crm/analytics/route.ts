import { db } from "@/lib/db";
import { deal, pipeline } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const deals = await db.query.deal.findMany({
      where: and(
        eq(deal.organizationId, ctx.organizationId),
        notDeleted(deal.deletedAt)
      ),
    });

    const totalDeals = deals.length;
    const openDeals = deals.filter((d) => !d.wonAt && !d.lostAt).length;
    const wonDeals = deals.filter((d) => d.wonAt).length;
    const lostDeals = deals.filter((d) => d.lostAt).length;
    const totalPipelineValue = deals
      .filter((d) => !d.wonAt && !d.lostAt)
      .reduce((sum, d) => sum + d.valueCents, 0);
    const wonValue = deals
      .filter((d) => d.wonAt)
      .reduce((sum, d) => sum + d.valueCents, 0);
    const conversionRate =
      wonDeals + lostDeals > 0
        ? Math.round((wonDeals / (wonDeals + lostDeals)) * 100)
        : 0;
    const avgDealValue =
      wonDeals > 0 ? Math.round(wonValue / wonDeals) : 0;

    // Stage distribution
    const stageMap: Record<string, { count: number; value: number }> = {};
    for (const d of deals) {
      if (!stageMap[d.stageId]) stageMap[d.stageId] = { count: 0, value: 0 };
      stageMap[d.stageId].count++;
      stageMap[d.stageId].value += d.valueCents;
    }

    return ok({
      totalDeals,
      openDeals,
      wonDeals,
      lostDeals,
      totalPipelineValue,
      wonValue,
      conversionRate,
      avgDealValue,
      stageDistribution: stageMap,
    });
  } catch (err) {
    return handleError(err);
  }
}
