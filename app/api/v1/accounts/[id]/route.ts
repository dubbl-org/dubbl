import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount, journalLine, journalEntry, taxRate } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  subType: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
  // Account-driven tax defaulting + reporting metadata (E7).
  defaultTaxRateId: z.string().uuid().nullable().optional(),
  taxDisallowedPercent: z.number().int().min(0).max(10000).optional(),
  reportingCode: z.string().nullable().optional(),
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

    // Compute running balance and totals on full set
    let balance = 0;
    let totalDebits = 0;
    let totalCredits = 0;
    const fullLedger = allLedger.map((row) => {
      const debit = row.debitAmount || 0;
      const credit = row.creditAmount || 0;
      totalDebits += debit;
      totalCredits += credit;
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
      account: { ...account, balance, totalDebits, totalCredits, entryCount: allLedger.length },
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

    const existing = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, id),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // System categories come from the code-owned default template and are
    // locked: their identity (name / code / type) can't be changed. Usage
    // settings (active/inactive, default tax rate, disallowed %, description,
    // reporting code) stay editable. `type` isn't in updateSchema, but guard it
    // explicitly in case a `type` field is sent (E8a).
    if (existing.isSystem) {
      const changingType =
        "type" in body && body.type !== undefined && body.type !== existing.type;
      const changingName =
        parsed.name !== undefined && parsed.name !== existing.name;
      const changingCode =
        parsed.code !== undefined && parsed.code !== existing.code;
      if (changingType) {
        return NextResponse.json(
          { error: "Cannot change the type of a system account" },
          { status: 422 }
        );
      }
      if (changingName || changingCode) {
        return NextResponse.json(
          { error: "This is a built-in category, so its name and code can't be changed. Create your own category instead." },
          { status: 422 }
        );
      }
    }

    // Validate the default tax rate belongs to this org (if supplied) (E7).
    if (parsed.defaultTaxRateId) {
      const rate = await db.query.taxRate.findFirst({
        where: and(
          eq(taxRate.id, parsed.defaultTaxRateId),
          eq(taxRate.organizationId, ctx.organizationId)
        ),
      });
      if (!rate) {
        return NextResponse.json(
          { error: "Tax rate not found" },
          { status: 400 }
        );
      }
    }

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

    logAudit({ ctx, action: "update", entityType: "chart_account", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

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

    const existing = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, id),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Built-in categories from the default template can't be deleted (E8a).
    // Users can hide one they don't use by marking it inactive instead.
    if (existing.isSystem) {
      return NextResponse.json(
        { error: "This is a built-in category, so it can't be deleted. Mark it inactive to hide it instead." },
        { status: 422 }
      );
    }

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

    logAudit({ ctx, action: "delete", entityType: "chart_account", entityId: id, request });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
