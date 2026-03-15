import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim, journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const paySchema = z.object({
  date: z.string().min(1),
  bankAccountCode: z.string().default("1100"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:expenses");

    const body = await request.json();
    const parsed = paySchema.parse(body);

    const found = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
      with: {
        items: {
          with: { account: true },
        },
      },
    });

    if (!found) return notFound("Expense claim");
    if (found.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved expense claims can be marked as paid" },
        { status: 400 }
      );
    }

    // Get next entry number
    const [maxResult] = await db
      .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
      .from(journalEntry)
      .where(eq(journalEntry.organizationId, ctx.organizationId));
    const entryNumber = (maxResult?.max || 0) + 1;

    // Find bank account
    const bankAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, parsed.bankAccountCode)
      ),
    });

    if (!bankAccount) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 400 }
      );
    }

    // Create journal entry
    // DR Expense accounts (per item)
    // CR Bank/Cash
    const [entry] = await db
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: parsed.date,
        description: `Expense claim: ${found.title}`,
        reference: `EXP-${id.slice(0, 8)}`,
        status: "posted",
        sourceType: "expense",
        sourceId: id,
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();

    const lines: (typeof journalLine.$inferInsert)[] = [];

    // DR Expense accounts per item
    for (const item of found.items) {
      if (item.accountId && item.amount > 0) {
        lines.push({
          journalEntryId: entry.id,
          accountId: item.accountId,
          description: item.description,
          debitAmount: item.amount,
          creditAmount: 0,
        });
      }
    }

    // If no specific accounts, use a single debit line for the total
    if (lines.length === 0) {
      // Find default expense account (code 5000)
      const defaultExpenseAccount = await db.query.chartAccount.findFirst({
        where: and(
          eq(chartAccount.organizationId, ctx.organizationId),
          eq(chartAccount.code, "5000")
        ),
      });

      if (defaultExpenseAccount) {
        lines.push({
          journalEntryId: entry.id,
          accountId: defaultExpenseAccount.id,
          description: `Expense claim: ${found.title}`,
          debitAmount: found.totalAmount,
          creditAmount: 0,
        });
      }
    }

    // CR Bank for total amount
    lines.push({
      journalEntryId: entry.id,
      accountId: bankAccount.id,
      description: `Expense claim: ${found.title}`,
      debitAmount: 0,
      creditAmount: found.totalAmount,
    });

    if (lines.length > 0) {
      await db.insert(journalLine).values(lines);
    }

    // Update expense claim
    const [updated] = await db
      .update(expenseClaim)
      .set({
        status: "paid",
        journalEntryId: entry.id,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(expenseClaim.id, id))
      .returning();

    logAudit({ ctx, action: "pay", entityType: "expense", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ expenseClaim: updated });
  } catch (err) {
    return handleError(err);
  }
}
