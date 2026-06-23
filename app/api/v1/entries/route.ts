import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { centsToDecimal } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { checkMonthlyLimit } from "@/lib/api/check-limit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

const lineSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().nullable().optional(),
  debitAmount: z.number().int().min(0).default(0),
  creditAmount: z.number().int().min(0).default(0),
  currencyCode: currencyCodeSchema.default("USD"),
  exchangeRate: z.number().int().default(1000000),
});

const createSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().nullable().optional(),
  fiscalYearId: z.string().nullable().optional(),
  // If set, a scheduled job posts a mirror reversing entry on this date
  // (accruals / prepayments). Must be on or after the entry date.
  autoReverseDate: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(2),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const entries = await db.query.journalEntry.findMany({
      where: eq(journalEntry.organizationId, ctx.organizationId),
      orderBy: desc(journalEntry.createdAt),
      limit,
      with: {
        lines: true,
      },
    });

    const result = entries.map((e) => {
      const totalDebit = e.lines.reduce((sum, l) => sum + l.debitAmount, 0);
      return {
        ...e,
        lines: undefined,
        totalDebit: centsToDecimal(totalDebit),
      };
    });

    return NextResponse.json({
      entries: result,
      total: result.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.date);
    await checkMonthlyLimit(ctx.organizationId, journalEntry, journalEntry.organizationId, journalEntry.createdAt, "entriesPerMonth");

    // Validate balance. A single-currency entry must balance in its own
    // amounts. A multi-currency entry (lines in different currencies, or any
    // non-1.0 exchange rate) must balance in BASE currency — comparing raw
    // amounts across currencies is meaningless and would let an unbalanced
    // entry post.
    const totalDebit = parsed.lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = parsed.lines.reduce((sum, l) => sum + l.creditAmount, 0);
    const firstCurrency = parsed.lines[0]?.currencyCode;
    const isMultiCurrency = parsed.lines.some(
      (l) => l.currencyCode !== firstCurrency || l.exchangeRate !== 1_000_000
    );
    if (!isMultiCurrency) {
      if (totalDebit !== totalCredit) {
        return NextResponse.json(
          { error: "Debits must equal credits" },
          { status: 400 }
        );
      }
    } else {
      const toBase = (amount: number, rate: number) =>
        Math.round((amount * rate) / 1_000_000);
      const baseDebit = parsed.lines.reduce((s, l) => s + toBase(l.debitAmount, l.exchangeRate), 0);
      const baseCredit = parsed.lines.reduce((s, l) => s + toBase(l.creditAmount, l.exchangeRate), 0);
      // Allow up to one cent of per-line rounding slack.
      if (Math.abs(baseDebit - baseCredit) > parsed.lines.length) {
        return NextResponse.json(
          { error: "In your base currency, total debits must equal total credits." },
          { status: 400 }
        );
      }
    }
    if (totalDebit === 0) {
      return NextResponse.json(
        { error: "Entry must have non-zero amounts" },
        { status: 400 }
      );
    }

    // An auto-reversal must fall on or after the original entry's date.
    if (parsed.autoReverseDate && parsed.autoReverseDate < parsed.date) {
      return NextResponse.json(
        { error: "Auto-reverse date must be on or after the entry date" },
        { status: 400 }
      );
    }

    // Get next entry number
    const [maxResult] = await db
      .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
      .from(journalEntry)
      .where(eq(journalEntry.organizationId, ctx.organizationId));

    const entryNumber = (maxResult?.max || 0) + 1;

    const [entry] = await db
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: parsed.date,
        description: parsed.description,
        reference: parsed.reference || null,
        fiscalYearId: parsed.fiscalYearId || null,
        autoReverseDate: parsed.autoReverseDate || null,
        createdBy: ctx.userId,
      })
      .returning();

    // Insert lines
    await db.insert(journalLine).values(
      parsed.lines.map((l) => ({
        journalEntryId: entry.id,
        accountId: l.accountId,
        description: l.description || null,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        currencyCode: l.currencyCode,
        exchangeRate: l.exchangeRate,
      }))
    );

    logAudit({ ctx, action: "create", entityType: "journal_entry", entityId: entry.id, request });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
