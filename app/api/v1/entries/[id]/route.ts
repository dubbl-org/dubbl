import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { centsToDecimal } from "@/lib/money";

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
