import { db } from "@/lib/db";
import { bankTransaction } from "@/lib/db/schema";
import { eq, and, ne, isNotNull, sql } from "drizzle-orm";

interface AccountSuggestion {
  accountId: string;
  accountName: string;
  accountCode: string;
  confidence: number;
  matchCount: number;
  recentDate: string;
}

/**
 * Suggest chart accounts for a bank transaction based on historically
 * categorized transactions with similar descriptions.
 */
export async function suggestAccounts(
  bankAccountId: string,
  description: string,
  limit = 5
): Promise<AccountSuggestion[]> {
  const normalized = normalizeForMatching(description);
  const words = normalized.split(/\s+/).filter((w) => w.length > 2);

  if (words.length === 0) return [];

  // Find transactions with similar descriptions that have been categorized
  const wordConditions = words
    .slice(0, 5)
    .map((w) => sql`lower(bt.description) LIKE ${"%" + w + "%"}`);

  const results = await db.execute(sql`
    SELECT
      ca.id AS account_id,
      ca.name AS account_name,
      ca.code AS account_code,
      COUNT(*) AS match_count,
      MAX(bt.date) AS recent_date
    FROM bank_transaction bt
    JOIN chart_account ca ON ca.id = bt.account_id
    WHERE bt.bank_account_id = ${bankAccountId}
      AND bt.account_id IS NOT NULL
      AND bt.status != 'excluded'
      AND (${sql.join(wordConditions, sql` OR `)})
    GROUP BY ca.id, ca.name, ca.code
    ORDER BY match_count DESC
    LIMIT ${limit}
  `);

  const totalMatches = results.rows.reduce(
    (sum, r) => sum + Number(r.match_count),
    0
  );

  return results.rows.map((r) => ({
    accountId: r.account_id as string,
    accountName: r.account_name as string,
    accountCode: r.account_code as string,
    confidence: Math.min(
      100,
      Math.round((Number(r.match_count) / Math.max(totalMatches, 1)) * 100)
    ),
    matchCount: Number(r.match_count),
    recentDate: r.recent_date as string,
  }));
}

function normalizeForMatching(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
