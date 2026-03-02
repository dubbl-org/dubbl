import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount, journalLine, journalEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  subType: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const account = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, id),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });

    if (!account) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get ledger entries
    const ledger = await db
      .select({
        entryId: journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        date: journalEntry.date,
        description: journalEntry.description,
        debitAmount: journalLine.debitAmount,
        creditAmount: journalLine.creditAmount,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .where(
        and(
          eq(journalLine.accountId, id),
          eq(journalEntry.status, "posted")
        )
      )
      .orderBy(journalEntry.date);

    // Compute running balance (amounts are integer cents)
    let balance = 0;
    const ledgerWithBalance = ledger.map((row) => {
      const debit = row.debitAmount || 0;
      const credit = row.creditAmount || 0;
      // Assets & expenses: debit-normal; liabilities, equity, revenue: credit-normal
      if (["asset", "expense"].includes(account.type)) {
        balance += debit - credit;
      } else {
        balance += credit - debit;
      }
      return { ...row, balance };
    });

    return NextResponse.json({
      account: { ...account, balance },
      ledger: ledgerWithBalance,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:accounts");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(chartAccount)
      .set(parsed)
      .where(
        and(
          eq(chartAccount.id, id),
          eq(chartAccount.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ account: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:accounts");

    // Check if account has journal lines
    const lines = await db.query.journalLine.findFirst({
      where: eq(journalLine.accountId, id),
    });
    if (lines) {
      return NextResponse.json(
        { error: "Cannot delete account with existing transactions" },
        { status: 409 }
      );
    }

    const [deleted] = await db
      .delete(chartAccount)
      .where(
        and(
          eq(chartAccount.id, id),
          eq(chartAccount.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
