import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!account) return notFound("Bank account");

    // Find potential duplicates: same date + same absolute amount + different IDs
    const duplicateGroups = await db.execute(sql`
      SELECT
        t1.id AS id1,
        t1.description AS desc1,
        t1.reference AS ref1,
        t1.status AS status1,
        t2.id AS id2,
        t2.description AS desc2,
        t2.reference AS ref2,
        t2.status AS status2,
        t1.date,
        t1.amount
      FROM bank_transaction t1
      JOIN bank_transaction t2
        ON t1.bank_account_id = t2.bank_account_id
        AND t1.date = t2.date
        AND t1.amount = t2.amount
        AND t1.id < t2.id
      WHERE t1.bank_account_id = ${id}
      ORDER BY t1.date DESC
      LIMIT 100
    `);

    // Group duplicates by (date, amount) cluster
    const groupMap = new Map<string, {
      date: string;
      amount: number;
      transactions: { id: string; description: string; reference: string | null; status: string }[];
    }>();

    for (const row of duplicateGroups.rows) {
      const key = `${row.date}|${row.amount}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          date: row.date as string,
          amount: row.amount as number,
          transactions: [],
        });
      }
      const group = groupMap.get(key)!;
      const ids = new Set(group.transactions.map((t) => t.id));
      if (!ids.has(row.id1 as string)) {
        group.transactions.push({
          id: row.id1 as string,
          description: row.desc1 as string,
          reference: row.ref1 as string | null,
          status: row.status1 as string,
        });
      }
      if (!ids.has(row.id2 as string)) {
        group.transactions.push({
          id: row.id2 as string,
          description: row.desc2 as string,
          reference: row.ref2 as string | null,
          status: row.status2 as string,
        });
      }
    }

    const groups = Array.from(groupMap.values());

    return NextResponse.json({
      bankAccountId: id,
      duplicateGroups: groups,
      totalGroups: groups.length,
    });
  } catch (err) {
    return handleError(err);
  }
}
