import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  accrualSchedule,
  accrualEntry,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({
      max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
    })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:accruals");

    // Get schedule and verify ownership
    const schedule = await db.query.accrualSchedule.findFirst({
      where: and(
        eq(accrualSchedule.id, id),
        eq(accrualSchedule.organizationId, ctx.organizationId)
      ),
      with: {
        entries: {
          orderBy: asc(accrualEntry.sortOrder),
        },
      },
    });

    if (!schedule) {
      return notFound("Accrual schedule");
    }

    if (schedule.status !== "active") {
      return validationError("Schedule is not active");
    }

    // Find first unposted entry
    const nextEntry = schedule.entries.find((e) => !e.posted);
    if (!nextEntry) {
      return validationError("All entries have already been posted");
    }

    // Create journal entry: DR reverseAccountId, CR accountId
    const entryNumber = await getNextEntryNumber(ctx.organizationId);

    const [je] = await db
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: nextEntry.periodDate,
        description: `Accrual: ${schedule.description} - Period ${nextEntry.sortOrder + 1}`,
        status: "posted",
        sourceType: "accrual",
        sourceId: schedule.id,
        createdBy: ctx.userId,
        postedAt: new Date(),
      })
      .returning();

    await db.insert(journalLine).values([
      {
        journalEntryId: je.id,
        accountId: schedule.reverseAccountId,
        description: schedule.description,
        debitAmount: nextEntry.amount,
        creditAmount: 0,
      },
      {
        journalEntryId: je.id,
        accountId: schedule.accountId,
        description: schedule.description,
        debitAmount: 0,
        creditAmount: nextEntry.amount,
      },
    ]);

    // Update accrual entry
    await db
      .update(accrualEntry)
      .set({ posted: true, journalEntryId: je.id })
      .where(eq(accrualEntry.id, nextEntry.id));

    // Check if all entries are now posted
    const unpostedCount = schedule.entries.filter(
      (e) => !e.posted && e.id !== nextEntry.id
    ).length;

    if (unpostedCount === 0) {
      await db
        .update(accrualSchedule)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(accrualSchedule.id, id));
    }

    const updatedEntry = await db.query.accrualEntry.findFirst({
      where: eq(accrualEntry.id, nextEntry.id),
    });

    return NextResponse.json({ entry: updatedEntry });
  } catch (err) {
    return handleError(err);
  }
}
