import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { centsToDecimal } from "@/lib/money";
import { requireRole } from "@/lib/api/require-role";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

const updateLineSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().nullable().optional(),
  debitAmount: z.number().int().min(0).default(0),
  creditAmount: z.number().int().min(0).default(0),
  currencyCode: currencyCodeSchema.default("USD"),
  exchangeRate: z.number().int().default(1000000),
  costCenterId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

const updateSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().nullable().optional(),
  fiscalYearId: z.string().nullable().optional(),
  lines: z.array(updateLineSchema).min(2),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const entry = await db.query.journalEntry.findFirst({
      where: and(
        eq(journalEntry.id, id),
        eq(journalEntry.organizationId, ctx.organizationId)
      ),
      with: {
        lines: {
          with: {
            account: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = {
      ...entry,
      lines: entry.lines.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        accountCode: l.account?.code || "",
        accountName: l.account?.name || "",
        description: l.description,
        debitAmount: centsToDecimal(l.debitAmount),
        creditAmount: centsToDecimal(l.creditAmount),
        currencyCode: l.currencyCode,
        exchangeRate: l.exchangeRate,
      })),
    };

    return NextResponse.json({ entry: result });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Edit a journal entry (full header + line replace).
 *
 * Only DRAFT entries can be edited. Posted entries are immutable for audit
 * safety — to change a posted entry, void it (which posts a reversing entry)
 * and create a new one. Re-validates that debits equal credits, and asserts the
 * period isn't locked on BOTH the old and new date (so an edit can't move an
 * entry out of, or into, a locked period). Wrapped in a transaction so the
 * header update and the line replace commit (or roll back) together.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "edit:entries");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.journalEntry.findFirst({
      where: and(
        eq(journalEntry.id, id),
        eq(journalEntry.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.status !== "draft") {
      return NextResponse.json(
        {
          error:
            "Only draft entries can be edited. Void the posted entry and create a new one to make changes.",
        },
        { status: 400 }
      );
    }

    // Block edits that touch a locked period — both the date being moved away
    // from and the new date.
    await assertNotLocked(ctx.organizationId, existing.date);
    if (parsed.date !== existing.date) {
      await assertNotLocked(ctx.organizationId, parsed.date);
    }

    // Re-validate balance on the new lines.
    const totalDebit = parsed.lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = parsed.lines.reduce((sum, l) => sum + l.creditAmount, 0);
    if (totalDebit !== totalCredit) {
      return NextResponse.json(
        { error: "Debits must equal credits" },
        { status: 400 }
      );
    }
    if (totalDebit === 0) {
      return NextResponse.json(
        { error: "Entry must have non-zero amounts" },
        { status: 400 }
      );
    }

    const updated = await db.transaction(async (tx) => {
      const [entry] = await tx
        .update(journalEntry)
        .set({
          date: parsed.date,
          description: parsed.description,
          reference: parsed.reference ?? null,
          fiscalYearId: parsed.fiscalYearId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(journalEntry.id, id))
        .returning();

      // Full line replace.
      await tx.delete(journalLine).where(eq(journalLine.journalEntryId, id));
      await tx.insert(journalLine).values(
        parsed.lines.map((l) => ({
          journalEntryId: id,
          accountId: l.accountId,
          description: l.description ?? null,
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          currencyCode: l.currencyCode,
          exchangeRate: l.exchangeRate,
          costCenterId: l.costCenterId ?? null,
          projectId: l.projectId ?? null,
        }))
      );

      return entry;
    });

    logAudit({
      ctx,
      action: "update",
      entityType: "journal_entry",
      entityId: id,
      changes: {
        diff: {
          date:
            existing.date !== parsed.date
              ? { from: existing.date, to: parsed.date }
              : undefined,
          description:
            existing.description !== parsed.description
              ? { from: existing.description, to: parsed.description }
              : undefined,
          reference:
            existing.reference !== (parsed.reference ?? null)
              ? { from: existing.reference, to: parsed.reference ?? null }
              : undefined,
          lines: { replaced: parsed.lines.length },
        },
      },
      request,
    });

    return NextResponse.json({ entry: updated });
  } catch (err) {
    return handleError(err);
  }
}

// Alias PATCH to the same full-replace edit semantics.
export const PATCH = PUT;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const entry = await db.query.journalEntry.findFirst({
      where: and(
        eq(journalEntry.id, id),
        eq(journalEntry.organizationId, ctx.organizationId)
      ),
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (entry.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft entries can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(journalLine).where(eq(journalLine.journalEntryId, id));
    await db.delete(journalEntry).where(eq(journalEntry.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
