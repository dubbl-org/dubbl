import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accrualSchedule, accrualEntry } from "@/lib/db/schema";
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

    const schedule = await db.query.accrualSchedule.findFirst({
      where: and(
        eq(accrualSchedule.id, id),
        eq(accrualSchedule.organizationId, ctx.organizationId)
      ),
      with: { entries: true },
    });

    if (!schedule) {
      return notFound("Accrual schedule");
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

    const schedule = await db.query.accrualSchedule.findFirst({
      where: and(
        eq(accrualSchedule.id, id),
        eq(accrualSchedule.organizationId, ctx.organizationId)
      ),
      with: { entries: true },
    });

    if (!schedule) {
      return notFound("Accrual schedule");
    }

    const allPosted = schedule.entries.every((e) => e.posted);
    if (allPosted && schedule.entries.length > 0) {
      return validationError(
        "Cannot cancel a schedule where all entries are already posted"
      );
    }

    await db
      .update(accrualSchedule)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(accrualSchedule.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
