/**
 * Pure approval-workflow helpers (no database access), shared by the engine,
 * the settings UI and the unit tests.
 *
 * Money fields (total, subtotal, taxTotal) are integer cents, so a condition
 * like "total greater than 500000" means "over $5,000.00".
 */

export const APPROVAL_ENTITY_TYPES = [
  "bill",
  "expense",
  "invoice",
  "journal_entry",
  "purchase_order",
] as const;

export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export const APPROVAL_OPERATORS = ["eq", "neq", "gt", "lt", "gte", "lte"] as const;

export type ApprovalOperator = (typeof APPROVAL_OPERATORS)[number];

export interface ApprovalCondition {
  field: string;
  operator: ApprovalOperator | string;
  value: string;
}

export interface ApprovalConditionField {
  field: string;
  label: string;
  /** "money" values are integer cents; "text" values are compared as written. */
  kind: "money" | "text";
}

const MONEY_FIELDS: ApprovalConditionField[] = [
  { field: "total", label: "Total", kind: "money" },
  { field: "subtotal", label: "Subtotal", kind: "money" },
  { field: "taxTotal", label: "Tax", kind: "money" },
];

const CURRENCY_FIELD: ApprovalConditionField = {
  field: "currencyCode",
  label: "Currency",
  kind: "text",
};

/**
 * The fields a workflow condition can test, per record type. Every field here
 * exists on the subject built by `approvalSubject` below.
 */
export const APPROVAL_CONDITION_FIELDS: Record<ApprovalEntityType, ApprovalConditionField[]> = {
  bill: [...MONEY_FIELDS, CURRENCY_FIELD],
  invoice: [...MONEY_FIELDS, CURRENCY_FIELD],
  purchase_order: [...MONEY_FIELDS, CURRENCY_FIELD],
  expense: [{ field: "total", label: "Total", kind: "money" }, CURRENCY_FIELD],
  // A journal entry's total is the sum of its debit lines.
  journal_entry: [{ field: "total", label: "Total", kind: "money" }],
};

/**
 * Normalise a record into the object conditions are evaluated against, so the
 * same field names work for every record type (an expense claim stores its
 * total as `totalAmount`; a journal entry's total is passed in by the caller).
 */
export function approvalSubject(
  entityType: ApprovalEntityType,
  record: Record<string, unknown>
): Record<string, unknown> {
  if (entityType === "expense") {
    return { ...record, total: record.total ?? record.totalAmount };
  }
  return record;
}

export function evaluateCondition(
  condition: ApprovalCondition,
  entity: Record<string, unknown>
): boolean {
  const fieldValue = String(entity[condition.field] ?? "");
  const condValue = condition.value;

  switch (condition.operator) {
    case "eq":
      return fieldValue === condValue;
    case "neq":
      return fieldValue !== condValue;
    case "gt":
      return Number(fieldValue) > Number(condValue);
    case "lt":
      return Number(fieldValue) < Number(condValue);
    case "gte":
      return Number(fieldValue) >= Number(condValue);
    case "lte":
      return Number(fieldValue) <= Number(condValue);
    default:
      return false;
  }
}

/** A workflow matches when every one of its conditions holds (none = always). */
export function workflowMatches(
  conditions: ApprovalCondition[] | null | undefined,
  entity: Record<string, unknown>
): boolean {
  return (conditions ?? []).every((c) => evaluateCondition(c, entity));
}

interface SelectableWorkflow {
  id: string;
  createdAt: Date | string;
  conditions: ApprovalCondition[] | null;
}

/**
 * Pick the workflow that applies to a record, deterministically:
 *   1. only workflows whose conditions all match are candidates;
 *   2. the most specific one (most conditions) wins;
 *   3. a tie goes to the oldest workflow (createdAt ascending, then id).
 * Returns null when nothing matches.
 */
export function selectApprovalWorkflow<W extends SelectableWorkflow>(
  workflows: W[],
  entity: Record<string, unknown>
): W | null {
  const matching = workflows.filter((w) => workflowMatches(w.conditions, entity));
  if (matching.length === 0) return null;
  const time = (d: Date | string) => new Date(d).getTime();
  matching.sort((a, b) => {
    const specificity = (b.conditions?.length ?? 0) - (a.conditions?.length ?? 0);
    if (specificity !== 0) return specificity;
    const age = time(a.createdAt) - time(b.createdAt);
    if (age !== 0) return age;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return matching[0];
}
