import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount, journalLine, journalEntry } from "@/lib/db/schema";
import { eq, and, ilike, gte, lte, asc, desc } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
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
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = url.searchParams.get("search");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const entryType = url.searchParams.get("entryType");
    const sortBy = url.searchParams.get("sortBy") || "date";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const account = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, id),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });

    if (!account) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get ALL ledger entries for running balance calculation
    const allLedger = await db
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
      .orderBy(asc(journalEntry.date));

    // Compute running balance on full set
    let balance = 0;
    const fullLedger = allLedger.map((row) => {
      const debit = row.debitAmount || 0;
      const credit = row.creditAmount || 0;
      if (["asset", "expense"].includes(account.type)) {
        balance += debit - credit;
      } else {
        balance += credit - debit;
      }
      return { ...row, balance };
    });

    // Apply filters
    let filtered = fullLedger;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          String(e.entryNumber).includes(q)
      );
    }

    if (from) filtered = filtered.filter((e) => e.date >= from);
    if (to) filtered = filtered.filter((e) => e.date <= to);

    if (entryType === "debits") {
      filtered = filtered.filter((e) => (e.debitAmount || 0) > 0);
    } else if (entryType === "credits") {
      filtered = filtered.filter((e) => (e.creditAmount || 0) > 0);
    }

    // Sort
    const mul = sortOrder === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === "date") return mul * a.date.localeCompare(b.date);
      if (sortBy === "number") return mul * (a.entryNumber - b.entryNumber);
      if (sortBy === "amount") {
        const aAmt = (a.debitAmount || 0) + (a.creditAmount || 0);
        const bAmt = (b.debitAmount || 0) + (b.creditAmount || 0);
        return mul * (aAmt - bAmt);
      }
      return 0;
    });

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      account: { ...account, balance },
      ...paginatedResponse(paged, total, page, limit),
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
