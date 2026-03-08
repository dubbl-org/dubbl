import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { revenueSchedule, revenueEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound, validationError } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const schedule = await db.query.revenueSchedule.findFirst({
      where: and(
        eq(revenueSchedule.id, id),
        eq(revenueSchedule.organizationId, ctx.organizationId)
      ),
      with: { entries: true },
    });

    if (!schedule) {
      return notFound("Revenue schedule");
    }

    return NextResponse.json({ schedule });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const schedule = await db.query.revenueSchedule.findFirst({
      where: and(
        eq(revenueSchedule.id, id),
        eq(revenueSchedule.organizationId, ctx.organizationId)
      ),
      with: { entries: true },
    });

    if (!schedule) {
      return notFound("Revenue schedule");
    }

    const allRecognized = schedule.entries.every((e) => e.recognized);
    if (allRecognized && schedule.entries.length > 0) {
      return validationError(
        "Cannot cancel a schedule where all entries are already recognized"
      );
    }

    await db
      .update(revenueSchedule)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(revenueSchedule.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
