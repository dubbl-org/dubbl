import { db } from "@/lib/db";
import { bankAccount, bankRule, bankTransaction, chartAccount } from "@/lib/db/schema";
import { eq, and, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  createCategorizationJournalEntry,
  assertBaseRateAvailable,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { assertNotLocked } from "@/lib/api/period-lock";
import { decideRuleOutcome } from "@/lib/banking/rule-outcome";

interface MatchResult {
  accountId: string | null;
  contactId: string | null;
  taxRateId: string | null;
  autoReconcile: boolean;
  ruleName: string;
}

/** A single condition tested against a transaction field. */
export interface RuleCondition {
  /** description | reference | amount | payee | counterparty */
  field: string;
  /** contains | equals | starts_with | ends_with | gt | lt | between */
  op: string;
  /**
   * Comparison value. Text ops match case-insensitively. Amount ops parse this
   * as integer cents; `between` parses it as "min,max" (inclusive).
   */
  value: string;
}

/** A split-action allocation: code part of the transaction to an account. */
export interface RuleSplitAllocation {
  accountId: string;
  /** Percent of the transaction amount (0-100). Used when `amount` is absent. */
  percent?: number;
  /** Fixed amount in integer cents. Takes precedence over `percent`. */
  amount?: number;
  taxRateId?: string;
}

export interface ActiveBankRule {
  name: string;
  priority: number;
  // Legacy single-condition fields (used when `conditions` is empty).
  matchField: string;
  matchType: string;
  matchValue: string;
  // Multi-condition fields.
  conditions: RuleCondition[];
  /** true = AND (all conditions must match); false = OR (any condition). */
  matchAll: boolean;
  splitAllocations: RuleSplitAllocation[] | null;
  accountId: string | null;
  contactId: string | null;
  taxRateId: string | null;
  autoReconcile: boolean;
}

/** The transaction fields a rule can be evaluated against. */
export interface RuleEvaluable {
  description: string;
  reference?: string | null;
  /** Signed integer cents (>0 in, <0 out). */
  amount?: number | null;
  payee?: string | null;
  counterparty?: string | null;
}

/** Fields a bank rule can apply to a transaction. */
export interface RuleAssignment {
  accountId: string | null;
  contactId: string | null;
  taxRateId: string | null;
  /** When true, the matched rule reconciles the transaction. */
  reconcile: boolean;
  /** Split actions to code the transaction across several accounts, if any. */
  splitAllocations: RuleSplitAllocation[] | null;
  /** The name of the rule that matched (for auditing / suggestions). */
  ruleName: string;
}

/**
 * Load the organization's active bank rules, ordered by priority (highest first).
 * Useful for matching many transactions without re-querying per transaction.
 */
export async function loadActiveBankRules(
  organizationId: string
): Promise<ActiveBankRule[]> {
  const rules = await db.query.bankRule.findMany({
    where: and(
      eq(bankRule.organizationId, organizationId),
      eq(bankRule.isActive, true),
      notDeleted(bankRule.deletedAt),
    ),
    orderBy: desc(bankRule.priority),
  });

  return rules.map((rule) => ({
    name: rule.name,
    priority: rule.priority,
    matchField: rule.matchField,
    matchType: rule.matchType,
    matchValue: rule.matchValue,
    conditions: (rule.conditions ?? []) as RuleCondition[],
    matchAll: rule.matchAll,
    splitAllocations: (rule.splitAllocations ?? null) as
      | RuleSplitAllocation[]
      | null,
    accountId: rule.accountId,
    contactId: rule.contactId,
    taxRateId: rule.taxRateId,
    autoReconcile: rule.autoReconcile,
  }));
}

/** Resolve the value of a transaction field referenced by a condition. */
function fieldValue(
  transaction: RuleEvaluable,
  field: string
): { text: string; numeric: number | null } {
  switch (field) {
    case "reference":
      return { text: transaction.reference || "", numeric: null };
    case "amount":
      return {
        text: transaction.amount == null ? "" : String(transaction.amount),
        numeric: transaction.amount ?? null,
      };
    case "payee":
      return { text: transaction.payee || "", numeric: null };
    case "counterparty":
      return { text: transaction.counterparty || "", numeric: null };
    case "description":
    default:
      return { text: transaction.description || "", numeric: null };
  }
}

/** Evaluate a single condition against a transaction. */
function evaluateCondition(
  transaction: RuleEvaluable,
  condition: RuleCondition
): boolean {
  const { text, numeric } = fieldValue(transaction, condition.field);

  switch (condition.op) {
    case "contains":
      return text.toLowerCase().includes(condition.value.toLowerCase());
    case "equals":
      return text.toLowerCase() === condition.value.toLowerCase();
    case "starts_with":
      return text.toLowerCase().startsWith(condition.value.toLowerCase());
    case "ends_with":
      return text.toLowerCase().endsWith(condition.value.toLowerCase());
    case "gt": {
      if (numeric == null) return false;
      const threshold = Number.parseInt(condition.value, 10);
      return Number.isFinite(threshold) && numeric > threshold;
    }
    case "lt": {
      if (numeric == null) return false;
      const threshold = Number.parseInt(condition.value, 10);
      return Number.isFinite(threshold) && numeric < threshold;
    }
    case "between": {
      if (numeric == null) return false;
      const [minStr, maxStr] = condition.value.split(",");
      const min = Number.parseInt((minStr ?? "").trim(), 10);
      const max = Number.parseInt((maxStr ?? "").trim(), 10);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
      return numeric >= min && numeric <= max;
    }
    default:
      return false;
  }
}

/** Evaluate the legacy single matchField/matchType/matchValue. */
function evaluateLegacy(
  transaction: RuleEvaluable,
  rule: Pick<ActiveBankRule, "matchField" | "matchType" | "matchValue">
): boolean {
  return evaluateCondition(transaction, {
    field: rule.matchField,
    op: rule.matchType,
    value: rule.matchValue,
  });
}

/** Does this rule match the transaction? Multi-condition supersedes legacy. */
function ruleMatches(transaction: RuleEvaluable, rule: ActiveBankRule): boolean {
  if (rule.conditions.length > 0) {
    return rule.matchAll
      ? rule.conditions.every((c) => evaluateCondition(transaction, c))
      : rule.conditions.some((c) => evaluateCondition(transaction, c));
  }
  // Fall back to the legacy single condition when no multi-conditions exist.
  return evaluateLegacy(transaction, rule);
}

/**
 * Match an already-loaded set of rules against a single transaction.
 * Returns the first matching rule's assignment (rules are ordered by priority),
 * or null if no rule matches.
 */
export function applyBankRulesToTransaction(
  rules: ActiveBankRule[],
  transaction: RuleEvaluable
): RuleAssignment | null {
  for (const rule of rules) {
    if (ruleMatches(transaction, rule)) {
      return {
        accountId: rule.accountId,
        contactId: rule.contactId,
        taxRateId: rule.taxRateId,
        reconcile: rule.autoReconcile,
        splitAllocations:
          rule.splitAllocations && rule.splitAllocations.length > 0
            ? rule.splitAllocations
            : null,
        ruleName: rule.name,
      };
    }
  }

  return null;
}

/**
 * Resolve a rule's split allocations into concrete signed cent amounts that sum
 * to the transaction amount. Fixed `amount` allocations are taken first (kept on
 * the same side as the transaction); the remainder is split by `percent`. Any
 * residual cents (rounding, or unallocated percent) fall on the last allocation
 * so the JEs always reconcile to the full transaction amount.
 */
export function resolveSplitAmounts(
  allocations: RuleSplitAllocation[],
  signedTotal: number
): { allocation: RuleSplitAllocation; amount: number }[] {
  const total = Math.abs(signedTotal);
  const sign = signedTotal < 0 ? -1 : 1;
  if (total === 0 || allocations.length === 0) return [];

  const resolved: { allocation: RuleSplitAllocation; amount: number }[] = [];
  let allocated = 0;

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    const isLast = i === allocations.length - 1;

    let portion: number;
    if (isLast) {
      // Give the remainder to the last allocation so splits always sum exactly.
      portion = total - allocated;
    } else if (alloc.amount != null) {
      portion = Math.min(Math.abs(alloc.amount), total - allocated);
    } else if (alloc.percent != null) {
      portion = Math.round((total * alloc.percent) / 100);
      portion = Math.min(portion, total - allocated);
    } else {
      portion = 0;
    }

    if (portion < 0) portion = 0;
    allocated += portion;
    if (portion > 0) {
      resolved.push({ allocation: alloc, amount: portion * sign });
    }
  }

  return resolved;
}

/**
 * Post a rule's split allocations for a transaction: one categorization journal
 * entry per allocation, coded to that allocation's account (tax-aware), reusing
 * the single-JE categorization primitive. Runs inside the caller's db
 * transaction. Returns the ids of the journal entries created.
 *
 * `signedAmount` is the transaction amount in transaction-currency cents
 * (>0 in, <0 out). The bank account must be linked to a ledger account.
 */
async function postSplitAllocations(
  ctx: { organizationId: string; userId: string },
  params: {
    bankGlAccountId: string;
    allocations: RuleSplitAllocation[];
    signedAmount: number;
    date: string;
    reference: string;
    description: string;
    currencyCode?: string;
  },
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<string[]> {
  const parts = resolveSplitAmounts(params.allocations, params.signedAmount);
  const entryIds: string[] = [];

  for (const part of parts) {
    const entry = await createCategorizationJournalEntry(
      ctx,
      {
        bankGlAccountId: params.bankGlAccountId,
        otherAccountId: part.allocation.accountId,
        amount: part.amount,
        date: params.date,
        reference: params.reference,
        description: params.description,
        currencyCode: params.currencyCode,
        taxRateId: part.allocation.taxRateId ?? null,
      },
      tx
    );
    if (entry?.id) entryIds.push(entry.id);
  }

  return entryIds;
}

/**
 * Apply the organization's active bank rules to a bank account's still-to-do
 * lines (status 'unreconciled', no category yet). Used by Apply rules (REST +
 * MCP) and by every statement import, so a rule behaves the same everywhere.
 *
 * Per matched line (see decideRuleOutcome):
 * - Split rules post one categorization journal entry per allocation and move
 *   the line to Done, stamped with the first entry id.
 * - Rules with autoReconcile ("Categorize matching transactions
 *   automatically") and a single account post the categorization entry, exactly
 *   like the manual Categorize action, and move the line to Done.
 * - Every other match only fills in the rule's category / contact / tax and
 *   leaves the line in To do for the user to confirm.
 *
 * A line is never moved to Done without a ledger entry. Posting needs a
 * `userId`, a date outside any locked period / closed fiscal year, and an
 * exchange rate for foreign-currency lines; when any of those is missing the
 * line falls back to the suggestion (counted in `skipped`).
 *
 * `options.importId` limits the pass to the lines of one statement import.
 * The caller must have already verified that the bank account belongs to the org.
 */
export async function applyBankRulesToAccount(
  organizationId: string,
  bankAccountId: string,
  userId?: string,
  options: { importId?: string } = {}
): Promise<{ applied: number; reconciled: number; split: number; skipped: number }> {
  const empty = { applied: 0, reconciled: 0, split: 0, skipped: 0 };
  const account = await db.query.bankAccount.findFirst({
    where: and(
      eq(bankAccount.id, bankAccountId),
      eq(bankAccount.organizationId, organizationId),
      notDeleted(bankAccount.deletedAt),
    ),
    columns: {
      id: true,
      accountName: true,
      accountType: true,
      chartAccountId: true,
      currencyCode: true,
    },
  });
  if (!account) return empty;

  const rules = await loadActiveBankRules(organizationId);
  if (rules.length === 0) return empty;

  // Only touch transactions that are still unreconciled and uncategorized.
  const transactions = await db.query.bankTransaction.findMany({
    where: and(
      eq(bankTransaction.bankAccountId, bankAccountId),
      eq(bankTransaction.status, "unreconciled"),
      isNull(bankTransaction.accountId),
      options.importId ? eq(bankTransaction.importId, options.importId) : undefined,
    ),
    columns: {
      id: true,
      date: true,
      description: true,
      reference: true,
      amount: true,
      payee: true,
      counterparty: true,
      currencyCode: true,
    },
  });

  let applied = 0;
  let reconciled = 0;
  let split = 0;
  let skipped = 0;

  for (const txn of transactions) {
    const assignment = applyBankRulesToTransaction(rules, txn);
    if (!assignment) continue;

    const outcome = decideRuleOutcome(assignment, Boolean(userId));

    if (outcome !== "suggest") {
      const currencyCode = txn.currencyCode || account.currencyCode;
      try {
        // Never post into a locked period or a closed fiscal year.
        await assertNotLocked(organizationId, txn.date);
        // Connect the bank account to its ledger account automatically (older
        // accounts self-heal on first use); cache on `account` so we link once
        // per pass rather than per transaction.
        if (!account.chartAccountId) {
          account.chartAccountId = await ensureBankLedgerAccount(organizationId, account);
        }
        // Fail cleanly before any write if the FX rate is missing.
        await assertBaseRateAvailable(organizationId, currencyCode, txn.date);

        await db.transaction(async (dbTx) => {
          let entryId: string | null = null;
          if (outcome === "split") {
            const entryIds = await postSplitAllocations(
              { organizationId, userId: userId! },
              {
                bankGlAccountId: account.chartAccountId!,
                allocations: assignment.splitAllocations!,
                signedAmount: txn.amount,
                date: txn.date,
                reference: txn.reference || txn.description,
                description: txn.description,
                currencyCode,
              },
              dbTx
            );
            entryId = entryIds[0] ?? null;
          } else {
            const entry = await createCategorizationJournalEntry(
              { organizationId, userId: userId! },
              {
                bankGlAccountId: account.chartAccountId!,
                otherAccountId: assignment.accountId!,
                amount: txn.amount,
                date: txn.date,
                reference: txn.reference || txn.description,
                description: txn.description,
                currencyCode,
                taxRateId: assignment.taxRateId ?? null,
              },
              dbTx
            );
            entryId = entry?.id ?? null;
          }

          await dbTx
            .update(bankTransaction)
            .set({
              status: "reconciled" as const,
              ...(outcome === "post"
                ? { accountId: assignment.accountId, taxRateId: assignment.taxRateId }
                : {}),
              contactId: assignment.contactId,
              journalEntryId: entryId,
            })
            .where(eq(bankTransaction.id, txn.id));
        });

        applied += 1;
        reconciled += 1;
        if (outcome === "split") split += 1;
        continue;
      } catch {
        // Locked period, missing exchange rate or similar: fall through and
        // leave the rule's category as a suggestion for the user to confirm.
        skipped += 1;
      }
    }

    // Fill in the rule's category / contact / tax without changing the line's
    // status, so we never mark a line "done" without a matching ledger entry.
    await db
      .update(bankTransaction)
      .set({
        accountId: assignment.accountId,
        contactId: assignment.contactId,
        taxRateId: assignment.taxRateId,
      })
      .where(eq(bankTransaction.id, txn.id));

    applied += 1;
  }

  return { applied, reconciled, split, skipped };
}

/**
 * Match a bank transaction against the organization's bank rules.
 * Returns the first matching rule's assignments, or null if no match.
 */
export async function matchBankRules(
  organizationId: string,
  transaction: RuleEvaluable
): Promise<MatchResult | null> {
  const rules = await loadActiveBankRules(organizationId);

  for (const rule of rules) {
    if (ruleMatches(transaction, rule)) {
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

/** A rule the user could create, learned from lines they already categorized. */
export interface BankRuleSuggestion {
  matchField: "description";
  matchType: "contains";
  /** The keyword to match (the longest word of the sample description). */
  matchValue: string;
  accountId: string;
  accountName: string;
  accountCode: string;
  /** How many categorized lines share this description and category. */
  occurrences: number;
  sampleDescription: string;
}

/**
 * Suggest bank rules from repeat categorizations: descriptions categorized to
 * the same account at least twice. Lines an existing active rule already
 * matches are left out, so every suggestion is something new to automate.
 */
export async function getBankRuleSuggestions(
  organizationId: string,
  limit = 20
): Promise<BankRuleSuggestion[]> {
  const patterns = await db
    .select({
      description: bankTransaction.description,
      accountId: bankTransaction.accountId,
      accountName: chartAccount.name,
      accountCode: chartAccount.code,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(bankTransaction)
    .innerJoin(bankAccount, eq(bankTransaction.bankAccountId, bankAccount.id))
    .innerJoin(chartAccount, eq(bankTransaction.accountId, chartAccount.id))
    .where(
      and(
        eq(bankAccount.organizationId, organizationId),
        notDeleted(bankAccount.deletedAt),
        // Only lines the user actually put in the books, not rule suggestions
        // still waiting in To do.
        isNotNull(bankTransaction.journalEntryId),
        isNotNull(bankTransaction.accountId)
      )
    )
    .groupBy(
      bankTransaction.description,
      bankTransaction.accountId,
      chartAccount.name,
      chartAccount.code
    )
    .having(sql`count(*) >= 2`)
    .orderBy(sql`count(*) desc`)
    .limit(100);

  const rules = await loadActiveBankRules(organizationId);
  const seen = new Set<string>();
  const suggestions: BankRuleSuggestion[] = [];

  for (const p of patterns) {
    if (!p.accountId) continue;
    // Already handled by a rule: nothing to suggest.
    if (applyBankRulesToTransaction(rules, { description: p.description })) continue;

    // Use the longest word (over 3 characters) as the keyword to match on.
    const words = p.description
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .sort((a, b) => b.length - a.length);
    const keyword = words[0] || p.description;

    const key = `${keyword.toLowerCase()}_${p.accountId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      matchField: "description",
      matchType: "contains",
      matchValue: keyword,
      accountId: p.accountId,
      accountName: p.accountName,
      accountCode: p.accountCode,
      occurrences: p.count,
      sampleDescription: p.description,
    });
    if (suggestions.length >= limit) break;
  }

  return suggestions;
}
