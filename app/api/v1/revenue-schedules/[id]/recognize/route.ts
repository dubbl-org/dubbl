import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  revenueSchedule,
  revenueEntry,
  journalEntry,
  journalLine,
  chartAccount,
  invoiceLine,
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
    requireRole(ctx, "manage:revenue");

    // Get schedule and verify ownership
    const schedule = await db.query.revenueSchedule.findFirst({
      where: and(
        eq(revenueSchedule.id, id),
        eq(revenueSchedule.organizationId, ctx.organizationId)
      ),
      with: {
        entries: {
          orderBy: asc(revenueEntry.sortOrder),
        },
        invoice: {
          with: {
            lines: true,
          },
        },
      },
    });

    if (!schedule) {
      return notFound("Revenue schedule");
    }

    if (schedule.status !== "active") {
      return validationError("Schedule is not active");
    }

    // Find first unrecognized entry
    const nextEntry = schedule.entries.find((e) => !e.recognized);
    if (!nextEntry) {
      return validationError("All entries have already been recognized");
    }

    // Determine revenue account
    // If schedule has an invoiceLineId, use the line's accountId; otherwise default "4000"
    let revenueAccountId: string | null = null;

    if (schedule.invoiceLineId) {
      const line = schedule.invoice?.lines?.find(
        (l) => l.id === schedule.invoiceLineId
      );
      if (line?.accountId) {
        revenueAccountId = line.accountId;
      }
    }

    // If no account from invoice line, look up default revenue account "4000"
    if (!revenueAccountId) {
      const revenueAccount = await db.query.chartAccount.findFirst({
        where: and(
          eq(chartAccount.organizationId, ctx.organizationId),
          eq(chartAccount.code, "4000")
        ),
      });
      if (revenueAccount) {
        revenueAccountId = revenueAccount.id;
      }
    }

    // Look up deferred revenue account "2300"
    const deferredAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "2300")
      ),
    });

    if (!deferredAccount) {
      return validationError(
        "Deferred Revenue account (2300) not found. Please create it first."
      );
    }

    if (!revenueAccountId) {
      return validationError(
        "Revenue account (4000) not found. Please create it first."
      );
    }

    // Create journal entry: DR Deferred Revenue (2300), CR Revenue (4000 or line account)
    const entryNumber = await getNextEntryNumber(ctx.organizationId);

    const [je] = await db
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: nextEntry.periodDate,
        description: `Revenue Recognition - Period ${nextEntry.sortOrder + 1}`,
        status: "posted",
        sourceType: "revenue_recognition",
        sourceId: schedule.id,
        createdBy: ctx.userId,
        postedAt: new Date(),
      })
      .returning();

    await db.insert(journalLine).values([
      {
        journalEntryId: je.id,
        accountId: deferredAccount.id,
        description: `Revenue Recognition - Period ${nextEntry.sortOrder + 1}`,
        debitAmount: nextEntry.amount,
        creditAmount: 0,
      },
      {
        journalEntryId: je.id,
        accountId: revenueAccountId,
        description: `Revenue Recognition - Period ${nextEntry.sortOrder + 1}`,
        debitAmount: 0,
        creditAmount: nextEntry.amount,
      },
    ]);

    // Update revenue entry
    await db
      .update(revenueEntry)
      .set({ recognized: true, journalEntryId: je.id })
      .where(eq(revenueEntry.id, nextEntry.id));

    // Update schedule recognizedAmount
    const newRecognizedAmount = schedule.recognizedAmount + nextEntry.amount;
    const updateData: { recognizedAmount: number; updatedAt: Date; status?: "completed" | "active" | "cancelled" } = {
      recognizedAmount: newRecognizedAmount,
      updatedAt: new Date(),
    };

    // Check if all entries are now recognized
    const unrecognizedCount = schedule.entries.filter(
      (e) => !e.recognized && e.id !== nextEntry.id
    ).length;

    if (unrecognizedCount === 0) {
      updateData.status = "completed";
    }

    await db
      .update(revenueSchedule)
      .set(updateData)
      .where(eq(revenueSchedule.id, id));

    const updatedEntry = await db.query.revenueEntry.findFirst({
      where: eq(revenueEntry.id, nextEntry.id),
    });

    return NextResponse.json({ entry: updatedEntry });
  } catch (err) {
    return handleError(err);
  }
}
