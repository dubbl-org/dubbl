/**
 * `XbrlInput` -> `Fact[]`.
 *
 * Three sources, in this order: the statement model (captions -> elements), the
 * filing header scalars, and the caller's overrides. Totals are never mapped by
 * hand: they are computed from the taxonomy's own calculation arcs, so every
 * total is literally the sum of the rounded components ACRA will validate.
 */
import type {
  Fact,
  FactDimension,
  FactUnit,
  TaxonomyTemplate,
  ValidationIssue,
  XbrlInput,
  XbrlScalars,
} from "./types";
import { mappingFor, type MappingRow, type StatementGroup } from "./mapping";
import { ELEMENTS, TEMPLATES, TAXONOMY_VERSION } from "./taxonomy.generated";
import { sumWholeDollars, wholeDollars } from "./rounding";

export interface FactsResult {
  facts: Fact[];
  scalars: XbrlScalars;
  /** Problems found while mapping: unmapped captions, missing header values. */
  issues: ValidationIssue[];
}

/** ACRA element types that carry money, and the ones that carry counts. */
function unitFor(concept: string): { unit: FactUnit; decimals: Fact["decimals"] } {
  const element = ELEMENTS[concept];
  if (!element) return { unit: null, decimals: null };
  if (element.type === "xbrli:monetaryItemType") return { unit: "SGD", decimals: "0" };
  if (element.type.endsWith("ItemType") && /Integer/i.test(element.type)) {
    return { unit: "PURE", decimals: "INF" };
  }
  return { unit: null, decimals: null };
}

const ACCOUNTING_STANDARD: Record<XbrlInput["company"]["accountingStandard"], string> = {
  sfrs: "SFRS",
  "sfrs-se": "SFRS for Small entities",
};

const SFP_PRESENTATION: Record<XbrlInput["company"]["sfpPresentation"], string> = {
  "current-non-current": "Current and non-current",
  "order-of-liquidity": "Order of liquidity",
};

const XBRL_FILING: Record<TaxonomyTemplate, string> = {
  sim: "Simplified XBRL",
  full: "Full XBRL",
};

const TAXONOMY_VERSION_TOKEN: Record<TaxonomyTemplate, string> = {
  sim: `Simplified_XBRL_${TAXONOMY_VERSION.slice(0, 4)}_v1.0`,
  full: `Full_XBRL_${TAXONOMY_VERSION.slice(0, 4)}_v1.0`,
};

const yesNo = (value: boolean): string => (value ? "Yes" : "No");

/** Header values, resolved once. Absent optional answers stay undefined. */
export function buildScalars(input: XbrlInput): XbrlScalars {
  const { company, period, approvals, audit } = input;
  const currency = company.presentationCurrency ?? "SGD";
  return {
    companyName: company.name,
    uen: company.uen,
    currentPeriodStart: period.startDate,
    currentPeriodEnd: period.endDate,
    priorPeriodStart: period.priorStartDate,
    priorPeriodEnd: period.priorEndDate,
    accountingStandard: ACCOUNTING_STANDARD[company.accountingStandard],
    natureOfFinancialStatements: "Company level",
    presentationCurrency: currency,
    // Whole dollars with decimals="0" is what the BizFinx prep tool emits.
    levelOfRounding: "Actual",
    sfpPresentation: SFP_PRESENTATION[company.sfpPresentation],
    moreThan50Employees: yesNo(company.moreThan50Employees),
    taxonomyVersion: TAXONOMY_VERSION_TOKEN[input.template],
    howPrepared: company.preparedBy === "outsourced" ? "Outsourced" : "In-house",
    softwareName: company.softwareName ?? "dubbl",
    authorisationDate: approvals.authorisationDate,
    functionalCurrency: company.functionalCurrency ?? currency,
    natureOfBusiness: company.natureOfBusiness,
    comparativeChanges: yesNo(approvals.comparativeRestated),
    typeOfXBRLFiling: XBRL_FILING[input.template],
    goingConcern: yesNo(approvals.goingConcern),
    directorsTrueAndFair: yesNo(approvals.directorsTrueAndFair),
    directorsSolvent: yesNo(approvals.directorsSolvent),
    auditOpinion: audit?.opinion,
    auditStandards: audit?.standards,
    auditGoingConcernUncertainty:
      audit === undefined ? undefined : yesNo(audit.goingConcernUncertainty),
    auditRecordsKept: audit?.recordsKept,
    principalPlaceOfBusiness: company.principalPlaceOfBusiness,
    parentName: company.parentName,
    parentUen: company.parentUen,
    employees: company.employees,
    hasSubsidiaryAssociateOrJointVenture: yesNo(company.hasSubsidiaryAssociateOrJointVenture),
    hasSingaporeParent: yesNo(company.isSubsidiary),
    fsTextBlock: input.fsTextBlock,
  };
}

type Amounts = { current?: number; prior?: number };

/** Caption -> cents for one group, in one period. */
function groupCaptions(
  input: XbrlInput,
  group: StatementGroup,
  period: "current" | "prior"
): Record<string, number> {
  if (group.startsWith("note.")) {
    // Notes are keyed once, for the period being filed; comparatives come from
    // the prior filing's override rather than from the same input twice.
    return period === "current"
      ? input.notes?.[group as keyof NonNullable<XbrlInput["notes"]>] ?? {}
      : {};
  }
  const model = period === "current" ? input.current : input.prior;
  if (!model) return {};
  switch (group) {
    case "sfp.currentAssets":
      return toRecord(model.assets.current.rows);
    case "sfp.nonCurrentAssets":
      return toRecord(model.assets.nonCurrent.rows);
    case "sfp.currentLiabilities":
      return toRecord(model.liabilities.current.rows);
    case "sfp.nonCurrentLiabilities":
      return toRecord(model.liabilities.nonCurrent.rows);
    case "sfp.equity":
      return toRecord(model.equity.rows);
    case "is.income":
      return toRecord(model.income.rows);
    case "is.expenses":
      return toRecord(model.expenses.rows);
  }
  return {};
}

function toRecord(rows: { caption: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.caption] = row.amount;
  return out;
}

/** Sum a row's captions, converting each to dollars before adding. */
function captionsInDollars(
  source: { captions: readonly string[]; flip?: boolean },
  captions: Record<string, number>
): number | undefined {
  const parts: number[] = [];
  for (const caption of source.captions) {
    const cents = captions[caption];
    if (cents === undefined) continue;
    parts.push(wholeDollars(cents));
  }
  if (parts.length === 0) return undefined;
  const total = sumWholeDollars(parts);
  return source.flip ? -total : total;
}

/** Captions that exist in the model but no mapping row consumes. */
function unmappedCaptions(
  input: XbrlInput,
  rows: readonly MappingRow[],
  period: "current" | "prior"
): ValidationIssue[] {
  const consumed = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.source.kind !== "captions") continue;
    const set = consumed.get(row.source.group) ?? new Set<string>();
    for (const caption of row.source.captions) set.add(caption);
    consumed.set(row.source.group, set);
  }
  const issues: ValidationIssue[] = [];
  for (const [group, captions] of consumed) {
    if (group.startsWith("note.")) continue; // note keys are the caller's, not chart captions
    for (const [caption, cents] of Object.entries(groupCaptions(input, group as StatementGroup, period))) {
      if (cents === 0 || captions.has(caption)) continue;
      issues.push({
        code: "XBRL-MAPPING",
        severity: "genuine",
        message: `No ACRA element maps "${caption}" (${group}); ${wholeDollars(cents)} SGD would be dropped from the ${period} filing`,
      });
    }
  }
  return issues;
}

/** Rank each concept by its position in ACRA's presentation, for stable output. */
function presentationRank(template: TaxonomyTemplate): Map<string, number> {
  const rank = new Map<string, number>();
  let index = 0;
  for (const section of TEMPLATES[template].sections) {
    for (const node of section.presentation) {
      if (!rank.has(node.element)) rank.set(node.element, index++);
    }
  }
  return rank;
}

export function buildFacts(input: XbrlInput): FactsResult {
  const template = input.template;
  const rows = mappingFor(template);
  const scalars = buildScalars(input);
  const issues: ValidationIssue[] = [];
  const hasPrior = input.prior !== undefined;

  /** concept -> amount in dollars (or text), filled in passes below. */
  const values = new Map<string, Amounts>();
  const dimensioned = new Map<string, { dimension: FactDimension; amounts: Amounts }>();
  const texts = new Map<string, string | number>();

  const overrides = (period: "current" | "prior") => input.overrides?.[period] ?? {};

  for (const row of rows) {
    const source = row.source;
    const override = (period: "current" | "prior"): number | undefined =>
      overrides(period)[row.element];

    if (source.kind === "captions") {
      if (source.classAxis) {
        for (const note of input.classNotes ?? []) {
          if (note.group !== source.group) continue;
          const amount = captionsInDollars(source, note.values);
          if (amount === undefined) continue;
          const key = `${row.element}|${note.member}`;
          const entry = dimensioned.get(key) ?? {
            dimension: { axis: source.classAxis, member: note.member },
            amounts: {},
          };
          entry.amounts.current = (entry.amounts.current ?? 0) + amount;
          dimensioned.set(key, entry);
        }
        continue;
      }
      const current = captionsInDollars(source, groupCaptions(input, source.group, "current"));
      const prior = captionsInDollars(source, groupCaptions(input, source.group, "prior"));
      const currentOverride = override("current");
      const priorOverride = override("prior");
      const resolved: Amounts = {
        current: currentOverride === undefined ? current : wholeDollars(currentOverride),
        prior: priorOverride === undefined ? prior : wholeDollars(priorOverride),
      };
      if ((resolved.current ?? 0) !== 0 || (resolved.prior ?? 0) !== 0) {
        values.set(row.element, resolved);
      }
      continue;
    }

    if (source.kind === "soce") {
      const current = input.current.soce.closing[source.column];
      const prior = input.prior?.soce.closing[source.column] ?? 0;
      if (current === 0 && prior === 0) continue;
      values.set(row.element, { current: wholeDollars(current), prior: wholeDollars(prior) });
      continue;
    }

    if (source.kind === "scalar") {
      const value = scalars[source.field];
      if (value === undefined || value === "") continue;
      texts.set(row.element, value);
      continue;
    }

    if (source.kind === "manual") {
      const current = override("current");
      const prior = override("prior");
      if (current === undefined && prior === undefined) continue;
      if (unitFor(row.element).unit === "SGD") {
        values.set(row.element, {
          current: current === undefined ? undefined : wholeDollars(current),
          prior: prior === undefined ? undefined : wholeDollars(prior),
        });
      } else {
        // Counts and flags are not money; the override carries the value itself.
        texts.set(row.element, current ?? prior ?? 0);
      }
      continue;
    }
  }

  // Totals: fill every calculation parent that has no figure yet from its
  // children, repeating until a pass adds nothing so nested totals resolve.
  const checks = TEMPLATES[template].checks;
  for (let pass = 0; pass < checks.length; pass++) {
    let added = false;
    for (const check of checks) {
      const existing: Amounts = values.get(check.parent) ?? {};
      for (const period of ["current", "prior"] as const) {
        if (existing[period] !== undefined) continue;
        const parts: number[] = [];
        for (const child of check.children) {
          const childValue = values.get(child.element)?.[period];
          if (childValue === undefined) continue;
          parts.push(child.weight * childValue);
        }
        if (parts.length === 0) continue;
        existing[period] = sumWholeDollars(parts);
        values.set(check.parent, existing);
        added = true;
      }
    }
    if (!added) break;
  }

  if (!hasPrior) {
    issues.push({
      code: "Misc_006",
      severity: "genuine",
      message: "Prior-period comparatives are missing; ACRA wants both periods for every reported figure",
    });
  }
  issues.push(...unmappedCaptions(input, rows, "current"), ...unmappedCaptions(input, rows, "prior"));
  if (input.company.sfpPresentation === "order-of-liquidity") {
    issues.push({
      code: "XBRL-SFP",
      severity: "genuine",
      message: "Only the current/non-current statement of financial position is emitted",
    });
  }

  const rank = presentationRank(template);
  const facts: Fact[] = [];
  const push = (concept: string, value: number | string, dimension?: FactDimension) => {
    const element = ELEMENTS[concept];
    const { unit, decimals } = unitFor(concept);
    const instant = element?.periodType === "instant";
    // Only money gets a comparative: counts and dates are asked once, for the
    // period being filed (`Misc_006` covers the monetary lines).
    if (unit !== "SGD") {
      facts.push({ concept, value, context: { period: "current", instant, dimension }, unit, decimals });
      return;
    }
    for (const period of ["current", "prior"] as const) {
      facts.push({ concept, value, context: { period, instant, dimension }, unit, decimals });
    }
  };

  for (const [concept, amounts] of values) {
    if (!ELEMENTS[concept]) continue;
    // Both periods are emitted together: an omitted comparative trips Misc_006,
    // and a zero is the honest figure for a line that did not exist last year.
    for (const period of ["current", "prior"] as const) {
      facts.push({
        concept,
        value: amounts[period] ?? 0,
        context: { period, instant: ELEMENTS[concept].periodType === "instant" },
        ...unitFor(concept),
      });
    }
  }
  for (const [concept, value] of texts) {
    if (!ELEMENTS[concept]) continue;
    push(concept, value);
  }
  for (const [key, entry] of dimensioned) {
    const concept = key.split("|")[0];
    for (const period of ["current", "prior"] as const) {
      facts.push({
        concept,
        value: entry.amounts[period] ?? 0,
        context: {
          period,
          instant: ELEMENTS[concept].periodType === "instant",
          dimension: entry.dimension,
        },
        ...unitFor(concept),
      });
    }
  }

  facts.sort((a, b) => (rank.get(a.concept) ?? 1e9) - (rank.get(b.concept) ?? 1e9));

  return { facts, scalars, issues };
}
