import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, chartAccount } from "@/lib/db/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    // Find common description patterns in already-categorized transactions
    // Group by description patterns and their assigned accounts
    const patterns = await db
      .select({
        description: bankTransaction.description,
        accountId: bankTransaction.accountId,
        accountName: chartAccount.name,
        accountCode: chartAccount.code,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(bankTransaction)
      .innerJoin(bankAccount, eq(bankTransaction.bankAccountId, bankAccount.id))
      .innerJoin(chartAccount, eq(bankTransaction.accountId, chartAccount.id))
      .where(
        and(
          eq(bankAccount.organizationId, ctx.organizationId),
          isNotNull(bankTransaction.accountId)
        )
      )
      .groupBy(
        bankTransaction.description,
        bankTransaction.accountId,
        chartAccount.name,
        chartAccount.code
      )
      .having(sql`COUNT(*) >= 2`)
      .orderBy(sql`count DESC`)
      .limit(20);

    // For each pattern, suggest a bank rule
    const suggestions = patterns.map((p) => {
      // Extract a common keyword from the description (longest single word > 3 chars)
      const words = p.description
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .sort((a, b) => b.length - a.length);
      const keyword = words[0] || p.description;

      return {
        matchValue: keyword,
        matchType: "contains" as const,
        matchField: "description" as const,
        accountId: p.accountId,
        accountName: p.accountName,
        accountCode: p.accountCode,
        occurrences: Number(p.count),
        sampleDescription: p.description,
      };
    });

    // Deduplicate by keyword + accountId
    const seen = new Set<string>();
    const unique = suggestions.filter((s) => {
      const key = `${s.matchValue.toLowerCase()}_${s.accountId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ suggestions: unique });
  } catch (err) {
    return handleError(err);
  }
}
