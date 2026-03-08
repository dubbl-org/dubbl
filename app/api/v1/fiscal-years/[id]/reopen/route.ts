import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fiscalYear,
  journalEntry,
  periodLock,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, error, notFound } from "@/lib/api/response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:period_lock");

    // Get fiscal year and verify ownership
    const fy = await db.query.fiscalYear.findFirst({
      where: and(
        eq(fiscalYear.id, id),
        eq(fiscalYear.organizationId, ctx.organizationId)
      ),
    });

    if (!fy) {
      return notFound("Fiscal year");
    }

    if (!fy.isClosed) {
      return error("Fiscal year is not closed", 400);
    }

    // Find and void the closing journal entry
    const closingEntry = await db.query.journalEntry.findFirst({
      where: and(
        eq(journalEntry.organizationId, ctx.organizationId),
        eq(journalEntry.sourceType, "year_end_close"),
        eq(journalEntry.sourceId, fy.id)
      ),
    });

    if (closingEntry) {
      await db
        .update(journalEntry)
        .set({
          status: "void",
          voidedAt: new Date(),
          voidReason: "Fiscal year reopened",
          updatedAt: new Date(),
        })
        .where(eq(journalEntry.id, closingEntry.id));
    }

    // Reopen fiscal year
    await db
      .update(fiscalYear)
      .set({ isClosed: false })
      .where(eq(fiscalYear.id, fy.id));

    // Delete period lock if its lockDate matches the fiscal year endDate
    const lock = await db.query.periodLock.findFirst({
      where: eq(periodLock.organizationId, ctx.organizationId),
    });

    if (lock && lock.lockDate === fy.endDate) {
      await db
        .delete(periodLock)
        .where(eq(periodLock.id, lock.id));
    }

    const updated = await db.query.fiscalYear.findFirst({
      where: eq(fiscalYear.id, fy.id),
    });

    return NextResponse.json({ fiscalYear: updated });
  } catch (err) {
    return handleError(err);
  }
}
