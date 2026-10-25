import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction } from "@/lib/db/schema";

export interface BankBalance {
  /** The anchor plus every movement made after the anchor date. */
  balance: number;
  /** Money in, as a flow rather than as a signed balance. */
  inflow: number;
  /** Money out, positive. */
  outflow: number;
}

/**
 * Read live balances off each account's transactions instead of trusting the
 * stored `bank_account.balance`, which is only the anchor written by the
 * statement importer and goes stale as soon as anything else posts a movement.
 *
 * shortcut: a transaction dated on or before the anchor date is left out of the
 * delta, so back-filling history older than the last statement needs that
 * statement re-imported to move the anchor back.
 */
export async function withBankBalances<
  T extends { id: string; balance: number; balanceAsOfDate: string | null },
>(accounts: T[]): Promise<(T & BankBalance)[]> {
  if (accounts.length === 0) return [];

  const rows = await db
    .select({
      bankAccountId: bankTransaction.bankAccountId,
      delta: sql<number>`coalesce(sum(case when ${bankAccount.balanceAsOfDate} is null or ${bankTransaction.date} > ${bankAccount.balanceAsOfDate} then ${bankTransaction.amount} else 0 end), 0)`.mapWith(
        Number
      ),
      inflow: sql<number>`coalesce(sum(case when ${bankTransaction.amount} > 0 then ${bankTransaction.amount} else 0 end), 0)`.mapWith(
        Number
      ),
      outflow: sql<number>`coalesce(sum(case when ${bankTransaction.amount} < 0 then -${bankTransaction.amount} else 0 end), 0)`.mapWith(
        Number
      ),
    })
    .from(bankTransaction)
    .innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.bankAccountId))
    .where(inArray(bankTransaction.bankAccountId, accounts.map((a) => a.id)))
    .groupBy(bankTransaction.bankAccountId);

  const byAccount = new Map(rows.map((row) => [row.bankAccountId, row]));

  return accounts.map((account) => {
    const row = byAccount.get(account.id);
    return {
      ...account,
      balance: account.balance + (row?.delta ?? 0),
      inflow: row?.inflow ?? 0,
      outflow: row?.outflow ?? 0,
    };
  });
}
