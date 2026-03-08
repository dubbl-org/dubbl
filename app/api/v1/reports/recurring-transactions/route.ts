import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .trim()
    .replace(/[0-9]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function determineFrequency(avgInterval: number): string {
  if (avgInterval >= 6 && avgInterval <= 8) return "weekly";
  if (avgInterval >= 13 && avgInterval <= 15) return "biweekly";
  if (avgInterval >= 28 && avgInterval <= 31) return "monthly";
  if (avgInterval >= 88 && avgInterval <= 93) return "quarterly";
  if (avgInterval >= 360 && avgInterval <= 370) return "yearly";
  return "irregular";
}

function determineDirection(amounts: number[]): string {
  const allNegative = amounts.every((a) => a < 0);
  const allPositive = amounts.every((a) => a > 0);
  if (allNegative) return "outflow";
  if (allPositive) return "inflow";
  return "mixed";
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);

    const bankAccountId = url.searchParams.get("bankAccountId");
    const minOccurrences = parseInt(url.searchParams.get("minOccurrences") || "2", 10);

    // Get valid bank account IDs for this org
    const orgAccounts = await db
      .select({ id: bankAccount.id })
      .from(bankAccount)
      .where(
        and(
          eq(bankAccount.organizationId, ctx.organizationId),
          notDeleted(bankAccount.deletedAt)
        )
      );

    const orgAccountIds = new Set(orgAccounts.map((a) => a.id));

    if (orgAccountIds.size === 0) {
      return NextResponse.json({ patterns: [] });
    }

    // Build query conditions
    const conditions = [
      ne(bankTransaction.status, "excluded"),
      ...(bankAccountId
        ? [eq(bankTransaction.bankAccountId, bankAccountId)]
        : []),
    ];

    // Fetch all non-excluded transactions
    const transactions = await db
      .select({
        id: bankTransaction.id,
        bankAccountId: bankTransaction.bankAccountId,
        date: bankTransaction.date,
        description: bankTransaction.description,
        amount: bankTransaction.amount,
      })
      .from(bankTransaction)
      .where(and(...conditions))
      .orderBy(bankTransaction.date);

    // Filter to only org accounts (if no specific bankAccountId was given)
    const filtered = bankAccountId
      ? transactions
      : transactions.filter((t) => orgAccountIds.has(t.bankAccountId));

    // Group by normalized description
    const groups = new Map<
      string,
      { description: string; transactions: { id: string; date: string; amount: number }[] }
    >();

    for (const txn of filtered) {
      const key = normalizeDescription(txn.description);
      if (!key) continue;

      if (!groups.has(key)) {
        groups.set(key, {
          description: txn.description,
          transactions: [],
        });
      }
      groups.get(key)!.transactions.push({
        id: txn.id,
        date: txn.date,
        amount: txn.amount,
      });
    }

    // Process groups with >= minOccurrences
    const patterns: {
      description: string;
      normalizedKey: string;
      count: number;
      avgAmount: number;
      minAmount: number;
      maxAmount: number;
      avgIntervalDays: number | null;
      frequency: string;
      direction: string;
      lastDate: string;
      transactions: { id: string; date: string; amount: number }[];
    }[] = [];

    for (const [key, group] of groups) {
      if (group.transactions.length < minOccurrences) continue;

      const txns = group.transactions.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const amounts = txns.map((t) => t.amount);
      const sum = amounts.reduce((s, a) => s + a, 0);
      const avgAmount = Math.round(sum / amounts.length);
      const minAmount = Math.min(...amounts);
      const maxAmount = Math.max(...amounts);

      // Calculate average interval
      let avgIntervalDays: number | null = null;
      if (txns.length >= 2) {
        let totalInterval = 0;
        for (let i = 1; i < txns.length; i++) {
          const diff =
            new Date(txns[i].date).getTime() - new Date(txns[i - 1].date).getTime();
          totalInterval += diff / (1000 * 60 * 60 * 24);
        }
        avgIntervalDays = Math.round(totalInterval / (txns.length - 1));
      }

      const frequency = avgIntervalDays !== null ? determineFrequency(avgIntervalDays) : "irregular";
      const direction = determineDirection(amounts);
      const lastDate = txns[txns.length - 1].date;

      // Keep only last 5 transactions
      const last5 = txns.slice(-5);

      patterns.push({
        description: group.description,
        normalizedKey: key,
        count: txns.length,
        avgAmount,
        minAmount,
        maxAmount,
        avgIntervalDays,
        frequency,
        direction,
        lastDate,
        transactions: last5,
      });
    }

    // Sort by count descending, take top 50
    patterns.sort((a, b) => b.count - a.count);
    const top50 = patterns.slice(0, 50);

    return NextResponse.json({ patterns: top50 });
  } catch (err) {
    return handleError(err);
  }
}
