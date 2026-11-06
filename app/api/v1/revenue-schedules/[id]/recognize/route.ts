import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { error, handleError } from "@/lib/api/response";
import { recognizeNextRevenueEntry, RevenueScheduleError } from "@/lib/api/revenue-schedules";

/**
 * Count the schedule's next uncounted period as income now: DR Deferred
 * Revenue / CR the income account, dated the period date (today if the period
 * is still ahead, or if its date is in a locked period).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:revenue");

    const entry = await recognizeNextRevenueEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId, auth: ctx },
      id
    );

    return NextResponse.json({ entry });
  } catch (err) {
    if (err instanceof RevenueScheduleError) return error(err.message, err.status);
    return handleError(err);
  }
}
