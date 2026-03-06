import { db } from "@/lib/db";
import { bankRule } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

interface MatchResult {
  accountId: string | null;
  contactId: string | null;
  taxRateId: string | null;
  autoReconcile: boolean;
  ruleName: string;
}

/**
 * Match a bank transaction against the organization's bank rules.
 * Returns the first matching rule's assignments, or null if no match.
 */
export async function matchBankRules(
  organizationId: string,
  transaction: { description: string; reference?: string | null }
): Promise<MatchResult | null> {
  const rules = await db.query.bankRule.findMany({
    where: and(
      eq(bankRule.organizationId, organizationId),
      eq(bankRule.isActive, true),
      notDeleted(bankRule.deletedAt),
    ),
    orderBy: desc(bankRule.priority),
  });

  for (const rule of rules) {
    const fieldValue = rule.matchField === "reference"
      ? (transaction.reference || "")
      : transaction.description;

    const value = fieldValue.toLowerCase();
    const match = rule.matchValue.toLowerCase();

    let matched = false;
    switch (rule.matchType) {
      case "contains":
        matched = value.includes(match);
        break;
      case "equals":
        matched = value === match;
        break;
      case "starts_with":
        matched = value.startsWith(match);
        break;
      case "ends_with":
        matched = value.endsWith(match);
        break;
    }

    if (matched) {
      return {
        accountId: rule.accountId,
        contactId: rule.contactId,
        taxRateId: rule.taxRateId,
        autoReconcile: rule.autoReconcile,
        ruleName: rule.name,
      };
    }
  }

  return null;
}
