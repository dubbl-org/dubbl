/**
 * What a matched bank rule does to a still-to-do bank line. Pure, so the same
 * decision drives statement imports, Apply rules (REST + MCP) and the tests.
 *
 * - "split":   the rule splits across several accounts. Post one categorization
 *              entry per part and move the line to Done.
 * - "post":    the rule has "Categorize matching transactions automatically"
 *              on and a single account. Post the categorization entry (exactly
 *              like the manual Categorize action) and move the line to Done.
 * - "suggest": fill in the rule's category / tax / contact on the line and
 *              leave it in To do for the user to confirm.
 *
 * A line is never moved to Done without a journal entry: when posting isn't
 * possible (no user to post as, a locked period, a missing exchange rate) the
 * caller falls back to "suggest".
 */
export type RuleOutcome = "split" | "post" | "suggest";

export interface RuleOutcomeInput {
  accountId: string | null;
  reconcile: boolean;
  splitAllocations: unknown[] | null;
}

export function decideRuleOutcome(
  assignment: RuleOutcomeInput,
  canPost: boolean
): RuleOutcome {
  if (!canPost) return "suggest";
  if (assignment.splitAllocations && assignment.splitAllocations.length > 0) {
    return "split";
  }
  if (assignment.reconcile && assignment.accountId) return "post";
  return "suggest";
}
