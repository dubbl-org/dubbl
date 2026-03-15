import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { centsToDecimal } from "@/lib/money";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "post:entries");

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
        { error: "Only draft entries can be posted" },
        { status: 400 }
      );
    }

    await db
      .update(journalEntry)
      .set({
        status: "posted",
        postedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(journalEntry.id, id))
      .returning();

    const full = await db.query.journalEntry.findFirst({
      where: eq(journalEntry.id, id),
      with: {
        lines: {
          with: { account: true },
        },
      },
    });

    logAudit({ ctx, action: "post", entityType: "journal_entry", entityId: id, changes: { previousStatus: entry.status }, request });

    return NextResponse.json({
      entry: {
        ...full,
        lines: full?.lines.map((l) => ({
          id: l.id,
          accountId: l.accountId,
          accountCode: l.account?.code || "",
          accountName: l.account?.name || "",
          description: l.description,
          debitAmount: centsToDecimal(l.debitAmount),
          creditAmount: centsToDecimal(l.creditAmount),
        })),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
