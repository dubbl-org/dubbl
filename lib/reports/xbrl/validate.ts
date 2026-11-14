/**
 * Validation, in two layers.
 *
 * The arithmetic is ACRA's own: every `summation-item` arc in the committed
 * calculation linkbase becomes a check, so `Misc_040`-style totals cannot drift
 * from the published taxonomy. The rest here is the small set ACRA only states in
 * prose (both periods, header completeness, sign, units, entry point) plus the
 * balance-sheet identity, which the linkbase does not encode at all.
 */
import type { Fact, TaxonomyTemplate, ValidationIssue, XbrlInput, XbrlScalars } from "./types";
import { TEMPLATES } from "./taxonomy.generated";

export interface ValidateParams {
  input: XbrlInput;
  template: TaxonomyTemplate;
  facts: readonly Fact[];
  scalars: XbrlScalars;
  /** Issues already found while mapping captions to elements. */
  issues: readonly ValidationIssue[];
  /** Namespaces the extension schema imports (for the entry-point rule). */
  imports?: readonly string[];
}

/** Header facts BizFinx will not accept a filing without. */
const REQUIRED_SCALARS: (keyof XbrlScalars)[] = [
  "companyName",
  "uen",
  "currentPeriodStart",
  "currentPeriodEnd",
  "priorPeriodStart",
  "accountingStandard",
  "typeOfXBRLFiling",
  "sfpPresentation",
  "authorisationDate",
  "goingConcern",
];

const REQUIRED_HEADER_ELEMENTS: Record<string, keyof XbrlScalars> = {
  "sg-dei:NameOfCompany": "companyName",
  "sg-dei:UniqueEntityNumber": "uen",
  "sg-dei:TaxonomyVersion": "taxonomyVersion",
  "sg-dei:TypeOfXBRLFiling": "typeOfXBRLFiling",
  "sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements": "accountingStandard",
  "sg-dei:TypeOfStatementOfFinancialPosition": "sfpPresentation",
  "sg-dei:WhetherFinancialStatementsArePreparedOnGoingConcernBasis": "goingConcern",
  "sg-as:DateOfAuthorisationForIssueOfFinancialStatements": "authorisationDate",
};

const SIGN_RULE = ["sg-as:Assets", "sg-as:Liabilities", "sg-as:Equity", "sg-as:Revenue"];

function contextKey(fact: Fact): string {
  return `${fact.context.period}|${fact.context.instant ? "instant" : "duration"}|${
    fact.context.dimension?.member ?? ""
  }`;
}

function money(facts: readonly Fact[]): Map<string, Map<string, number>> {
  const byContext = new Map<string, Map<string, number>>();
  for (const fact of facts) {
    if (fact.unit !== "SGD") continue;
    const key = contextKey(fact);
    const bucket = byContext.get(key) ?? new Map<string, number>();
    bucket.set(fact.concept, Number(fact.value));
    byContext.set(key, bucket);
  }
  return byContext;
}

export function validate({ input, template, facts, scalars, issues, imports = [] }: ValidateParams): ValidationIssue[] {
  const found: ValidationIssue[] = [...issues];
  const info = TEMPLATES[template];

  // Rounding invariant: the filing unit is whole dollars, and a fractional fact
  // would only come from a figure that skipped the rounding helper.
  for (const fact of facts) {
    if (fact.unit === "SGD" && !Number.isInteger(Number(fact.value))) {
      found.push({
        code: "XBRL-ROUNDING",
        severity: "genuine",
        message: `${fact.concept} is ${fact.value}, not whole dollars`,
        concept: fact.concept,
        period: fact.context.period,
      });
    }
  }

  const byContext = money(facts);
  for (const [key, values] of byContext) {
    const period = key.startsWith("prior") ? "prior" : "current";
    for (const check of info.checks) {
      const parent = values.get(check.parent);
      const present = check.children.filter((child) => values.has(child.element));
      if (parent === undefined) {
        if (present.length > 0) {
          found.push({
            code: "XBRL-TOTAL-MISSING",
            severity: "genuine",
            message: `${check.parent} is missing although its components are reported`,
            concept: check.parent,
            period,
          });
        }
        continue;
      }
      // A calculation arc only applies when its item side is reported; with no
      // components present the check is vacuous, not a mismatch.
      if (present.length === 0) continue;
      const expected = present.reduce(
        (total, child) => total + child.weight * values.get(child.element)!,
        0
      );
      if (expected !== parent) {
        found.push({
          code: "Misc_040",
          severity: "genuine",
          message: `${check.parent} is ${parent} but its components sum to ${expected} (${check.role})`,
          concept: check.parent,
          period,
          difference: parent - expected,
        });
      }
    }

    // The linkbase has no Assets = Liabilities + Equity arc; ACRA checks it.
    const instant = key.includes("instant");
    const dimensioned = !key.endsWith("|");
    if (instant && !dimensioned && values.has("sg-as:Assets")) {
      const difference =
        values.get("sg-as:Assets")! -
        (values.get("sg-as:Liabilities") ?? 0) -
        (values.get("sg-as:Equity") ?? 0);
      if (difference !== 0) {
        found.push({
          code: "XBRL-BALANCE",
          severity: "genuine",
          message: `Assets ${values.get("sg-as:Assets")} do not equal Liabilities + Equity (difference ${difference})`,
          concept: "sg-as:Assets",
          period,
          difference,
        });
      }
    }
  }

  for (const [concept, field] of Object.entries(REQUIRED_HEADER_ELEMENTS)) {
    if (!facts.some((fact) => fact.concept === concept)) {
      found.push({
        code: "Misc_006",
        severity: "genuine",
        message: `Filing information is incomplete: ${concept} (${String(field)}) is not reported`,
        concept,
      });
    }
  }
  for (const field of REQUIRED_SCALARS) {
    const value = scalars[field];
    if (value === undefined || value === "") {
      found.push({
        code: "XBRL-DEI",
        severity: "genuine",
        message: `Filing information is incomplete: ${String(field)} is empty`,
      });
    }
  }

  for (const concept of SIGN_RULE) {
    for (const [key, values] of byContext) {
      const value = values.get(concept);
      if (value !== undefined && value < 0) {
        found.push({
          code: "XBRL-SIGN",
          severity: "genuine",
          message: `${concept} is negative (${value}); a credit balance belongs on another line`,
          concept,
          period: key.startsWith("prior") ? "prior" : "current",
        });
      }
    }
  }

  if (template === "full") {
    if (!facts.some((fact) => fact.concept === "sg-as:DisclosureOfCompleteSetOfFinancialStatementsTextBlock")) {
      found.push({
        code: "XBRL-TEXTBLOCK",
        severity: "genuine",
        message:
          "Full XBRL requires the complete set of financial statements as one text block",
        concept: "sg-as:DisclosureOfCompleteSetOfFinancialStatementsTextBlock",
      });
    }
  }

  // The accounting standard picks the element framework; SFRS for Small Entities
  // disclosures come from sg-ee-sfrs, so a missing import means a wrong DTS.
  if (input.company.accountingStandard === "sfrs-se") {
    const hasEe = imports.some((line) => line.includes("/sg-ee/"));
    if (imports.length > 0 && !hasEe) {
      found.push({
        code: "XBRL-ENTRYPOINT",
        severity: "genuine",
        message: "SFRS for Small Entities is declared but the sg-ee-sfrs schema is not imported",
      });
    }
    if (template === "full") {
      found.push({
        code: "XBRL-ENTRYPOINT",
        severity: "possible",
        message: "SFRS for Small Entities with a Full XBRL filing; confirm the filing exempts this company from Simplified",
      });
    }
  }

  const { startDate, endDate, priorStartDate, priorEndDate } = input.period;
  if (endDate <= startDate) {
    found.push({
      code: "XBRL-PERIOD",
      severity: "genuine",
      message: `Current period ${startDate} to ${endDate} is not a forward range`,
    });
  }
  if (priorEndDate >= startDate || priorStartDate >= priorEndDate) {
    found.push({
      code: "XBRL-PERIOD",
      severity: "genuine",
      message: `Prior period ${priorStartDate} to ${priorEndDate} does not precede ${startDate}`,
    });
  }
  if (input.approvals.authorisationDate < endDate) {
    found.push({
      code: "XBRL-PERIOD",
      severity: "genuine",
      message: "Authorisation date is before the period end",
    });
  }

  return found;
}
