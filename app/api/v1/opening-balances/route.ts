import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, validationError, created } from "@/lib/api/response";
import { z } from "zod";

const balanceSchema = z.object({
  accountId: z.string().min(1),
  debitAmount: z.number().int().min(0).default(0),
  creditAmount: z.number().int().min(0).default(0),
});

const openingBalanceSchema = z.object({
  date: z.string().min(1),
  balances: z.array(balanceSchema).min(1),
});

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({
      max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
    })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:entries");

    const body = await request.json();
    const parsed = openingBalanceSchema.parse(body);

    // Validate total debits = total credits
    const totalDebit = parsed.balances.reduce(
      (sum, b) => sum + b.debitAmount,
      0
    );
    const totalCredit = parsed.balances.reduce(
      (sum, b) => sum + b.creditAmount,
      0
    );

    if (totalDebit !== totalCredit) {
      return validationError("Total debits must equal total credits");
    }

    if (totalDebit === 0) {
      return validationError("Opening balances must have non-zero amounts");
    }

    // Check if existing opening balance entry exists, void it if so
    const existingEntry = await db.query.journalEntry.findFirst({
      where: and(
        eq(journalEntry.organizationId, ctx.organizationId),
        eq(journalEntry.sourceType, "opening_balance"),
        eq(journalEntry.status, "posted")
      ),
    });

    if (existingEntry) {
      await db
        .update(journalEntry)
        .set({
          status: "void",
          voidedAt: new Date(),
          voidReason: "Replaced by new opening balance entry",
          updatedAt: new Date(),
        })
        .where(eq(journalEntry.id, existingEntry.id));
    }

    // Create new opening balance journal entry
    const entryNumber = await getNextEntryNumber(ctx.organizationId);

    const [entry] = await db
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: parsed.date,
        description: "Opening balances",
        sourceType: "opening_balance",
        status: "posted",
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();

    // Create journal lines for each balance
    await db.insert(journalLine).values(
      parsed.balances.map((b) => ({
        journalEntryId: entry.id,
        accountId: b.accountId,
        description: "Opening balance",
        debitAmount: b.debitAmount,
        creditAmount: b.creditAmount,
      }))
    );

    // Fetch the full entry with lines
    const full = await db.query.journalEntry.findFirst({
      where: eq(journalEntry.id, entry.id),
      with: {
        lines: {
          with: { account: true },
        },
      },
    });

    return created({ entry: full });
  } catch (err) {
    return handleError(err);
  }
}
