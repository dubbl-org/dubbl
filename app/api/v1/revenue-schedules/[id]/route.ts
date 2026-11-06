import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { error, handleError, notFound } from "@/lib/api/response";
import {
  cancelRevenueSchedule,
  getRevenueSchedule,
  RevenueScheduleError,
} from "@/lib/api/revenue-schedules";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const schedule = await getRevenueSchedule(ctx.organizationId, id);
    if (!schedule) {
      return notFound("Revenue schedule");
    }

    return NextResponse.json({ schedule });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Cancel the schedule. Income not counted yet goes back to the income account
 * (dated today); periods already counted stay.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:revenue");

    await cancelRevenueSchedule(
      { organizationId: ctx.organizationId, userId: ctx.userId, auth: ctx },
      id
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RevenueScheduleError) return error(err.message, err.status);
    return handleError(err);
  }
}
