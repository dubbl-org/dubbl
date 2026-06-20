import { db } from "@/lib/db";
import { bankAccount, bankRule, bankTransaction } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  createCategorizationJournalEntry,
  assertBaseRateAvailable,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";

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
 * Retroactively apply the organization's active bank rules to existing,
 * still-unreconciled transactions in a bank account that have not yet been
 * categorized (accountId is null).
 *
 * For rules without split actions: populates accountId/contactId/taxRateId from
 * the first matching rule, and sets status='reconciled' when the matched rule
 * has autoReconcile=true.
 *
 * For rules WITH split actions: posts one categorization journal entry per
 * allocation (coded across the chosen accounts), reconciles the transaction,
 * and stamps it with the first journal entry id. Splits require the bank account
 * to be linked to a ledger account, and are skipped if no rate is available for
 * a foreign-currency transaction.
 *
 * The caller must have already verified that the bank account belongs to the org.
 * Returns the number of transactions updated and how many were reconciled.
 */
export async function applyBankRulesToAccount(
  organizationId: string,
  bankAccountId: string,
  userId?: string
): Promise<{ applied: number; reconciled: number; split: number }> {
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
  if (!account) return { applied: 0, reconciled: 0, split: 0 };

  const rules = await loadActiveBankRules(organizationId);
  if (rules.length === 0) return { applied: 0, reconciled: 0, split: 0 };

  // Only touch transactions that are still unreconciled and uncategorized.
  const transactions = await db.query.bankTransaction.findMany({
    where: and(
      eq(bankTransaction.bankAccountId, bankAccountId),
      eq(bankTransaction.status, "unreconciled"),
      isNull(bankTransaction.accountId),
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

  for (const txn of transactions) {
    const assignment = applyBankRulesToTransaction(rules, txn);
    if (!assignment) continue;

    // Split actions post journal entries and reconcile the transaction.
    if (assignment.splitAllocations && userId) {
      const currencyCode = txn.currencyCode || account.currencyCode;
      try {
        // Connect the bank account to its ledger account automatically (older
        // accounts self-heal on first use); cache on `account` so we link once
        // per pass rather than per transaction.
        if (!account.chartAccountId) {
          account.chartAccountId = await ensureBankLedgerAccount(organizationId, account);
        }
        // Fail cleanly before any write if the FX rate is missing.
        await assertBaseRateAvailable(organizationId, currencyCode, txn.date);

        const firstEntryId = await db.transaction(async (dbTx) => {
          const entryIds = await postSplitAllocations(
            { organizationId, userId },
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

          await dbTx
            .update(bankTransaction)
            .set({
              status: "reconciled" as const,
              contactId: assignment.contactId,
              journalEntryId: entryIds[0] ?? null,
            })
            .where(eq(bankTransaction.id, txn.id));

          return entryIds[0] ?? null;
        });

        applied += 1;
        reconciled += 1;
        split += 1;
        void firstEntryId;
        continue;
      } catch {
        // Skip this transaction (e.g. missing exchange rate) and move on; the
        // user can categorize it manually or after adding a rate.
        continue;
      }
    }

    // A rule that auto-reconciles to a single account must POST the
    // categorization entry, exactly like the manual Categorize action — not
    // just flip the status. Otherwise the line shows as done with a category
    // but nothing hits the ledger, so income/expense silently never gets
    // recorded and the statement-vs-books difference is wrong.
    const canPost =
      assignment.reconcile && assignment.accountId && userId;

    if (canPost) {
      const currencyCode = txn.currencyCode || account.currencyCode;
      try {
        if (!account.chartAccountId) {
          account.chartAccountId = await ensureBankLedgerAccount(organizationId, account);
        }
        await assertBaseRateAvailable(organizationId, currencyCode, txn.date);

        await db.transaction(async (dbTx) => {
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

          await dbTx
            .update(bankTransaction)
            .set({
              status: "reconciled" as const,
              accountId: assignment.accountId,
              contactId: assignment.contactId,
              taxRateId: assignment.taxRateId,
              journalEntryId: entry?.id ?? null,
            })
            .where(eq(bankTransaction.id, txn.id));
        });

        applied += 1;
        reconciled += 1;
        continue;
      } catch {
        // Missing FX rate or similar — skip; the user can categorize manually.
        continue;
      }
    }

    // No reconcile (or no account to post to): just apply the rule's category /
    // contact / tax without changing the line's status, so we never mark a line
    // "done" without a matching ledger entry.
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

  return { applied, reconciled, split };
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
