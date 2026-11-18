/**
 * Assemble an ACRA XBRL filing from the books.
 *
 * The one place in the XBRL layer that reads the database: it gathers the two
 * years of account balances, builds the SFRS statement model, and hands a plain
 * `XbrlInput` to the pure emitter. Keeping the boundary here means
 * lib/reports/xbrl/{facts,instance,extension,validate} stay testable against
 * literals.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { aggregateAsAt, aggregateByDateRange } from "@/lib/reports/gl-query";
import { buildFsModel } from "@/lib/reports/fs-model";
import type { FsPresentation } from "@/lib/tax/types";
import { SG_MODULE } from "@/lib/tax/modules/sg";
import type { TaxonomyTemplate, XbrlInput } from "@/lib/reports/xbrl/types";
import { buildXbrlPackage } from "@/lib/reports/xbrl/package";

export interface AssembleOptions {
  fiscalYearStart: string;
  fiscalYearEnd: string;
  /** Overrides organization.xbrlTemplate. */
  template?: TaxonomyTemplate | null;
  /** Directors' authorisation date; required by ACRA. Defaults to the FY end. */
  authorisationDate?: string | null;
  auditOpinion?: NonNullable<XbrlInput["audit"]>["opinion"] | null;
  goingConcern?: boolean;
  overrides?: XbrlInput["overrides"];
  notes?: XbrlInput["notes"];
}

/** ACRA's own test for the Simplified template: revenue AND total assets ≤ S$500k. */
export const SIMPLIFIED_THRESHOLD_CENTS = 50_000_000;

export interface AssembledFiling {
  input: XbrlInput;
  /** Why this template was chosen, for the filing page. */
  templateReason: string;
  /** Revenue and total assets for the year, in cents. */
  size: { revenue: number; totalAssets: number };
}

function priorYear(window: { start: string; end: string }): { start: string; end: string } {
  const shift = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().slice(0, 10);
  };
  return { start: shift(window.start), end: shift(window.end) };
}

/** The org fields the emitter needs, or an error naming what is missing. */
async function loadCompany(organizationId: string) {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: {
      name: true,
      taxId: true,
      businessRegistrationNumber: true,
      legalEntityType: true,
      accountingStandard: true,
      xbrlTemplate: true,
      defaultCurrency: true,
      industrySector: true,
      addressCity: true,
      countryCode: true,
    },
  });
  if (!org) throw Object.assign(new Error("Organization not found"), { status: 404 });

  const uen = org.businessRegistrationNumber || org.taxId;
  if (!uen) {
    throw Object.assign(
      new Error(
        "Add the company's UEN in Settings → Legal before filing: BizFinx checks it against the ACRA register."
      ),
      { status: 400 }
    );
  }
  return { org, uen };
}

export async function assembleXbrlFiling(
  organizationId: string,
  options: AssembleOptions
): Promise<AssembledFiling> {
  const { org, uen } = await loadCompany(organizationId);
  const presentation = (SG_MODULE.fsPresentation ?? null) as FsPresentation | null;
  if (!presentation) {
    throw Object.assign(new Error("The Singapore module has no statement presentation"), {
      status: 500,
    });
  }

  const window = { start: options.fiscalYearStart, end: options.fiscalYearEnd };
  const prior = priorYear(window);

  const [closing, period, priorClosing, priorPeriod] = await Promise.all([
    aggregateAsAt(organizationId, window.end),
    aggregateByDateRange(organizationId, { startDate: window.start, endDate: window.end }),
    aggregateAsAt(organizationId, prior.end),
    aggregateByDateRange(organizationId, { startDate: prior.start, endDate: prior.end }),
  ]);

  // The income statement is movement over the year; the balance sheet is the
  // closing position. buildFsModel expects assets/liabilities/equity at their
  // closing balance and revenue/expense over the period, so merge the two.
  const mergedCurrent = mergeBalances(closing, period);
  const mergedPrior = mergeBalances(priorClosing, priorPeriod);

  const current = buildFsModel({ accounts: mergedCurrent, presentation });
  const priorModel = buildFsModel({ accounts: mergedPrior, presentation });

  const revenue = current.income.total;
  const totalAssets = current.assets.total;
  const requested = options.template ?? (org.xbrlTemplate === "full" ? "full" : "simplified");
  const fitsSimplified =
    revenue <= SIMPLIFIED_THRESHOLD_CENTS && totalAssets <= SIMPLIFIED_THRESHOLD_CENTS;
  // ACRA decides from the year's own figures; asking for Simplified above the
  // threshold would be rejected, so the threshold wins and the page explains why.
  const template: TaxonomyTemplate = fitsSimplified ? "sim" : "full";
  const templateReason = fitsSimplified
    ? `Revenue ${fmt(revenue)} and total assets ${fmt(totalAssets)} are both within the S$500,000 Simplified threshold.`
    : `Revenue ${fmt(revenue)} or total assets ${fmt(totalAssets)} exceed S$500,000, so ACRA requires the Full template.`;

  const input: XbrlInput = {
    template: requested === "full" && !fitsSimplified ? "full" : template,
    company: {
      name: org.name,
      uen,
      accountingStandard: org.accountingStandard === "sfrs_se" ? "sfrs-se" : "sfrs",
      sfpPresentation: "current-non-current",
      natureOfBusiness: org.industrySector || "Business services",
      functionalCurrency: org.defaultCurrency || "SGD",
      presentationCurrency: org.defaultCurrency || "SGD",
      // A Singapore SME almost always has neither; the emitter reports both
      // answers so the filing can be corrected without code changes.
      isSubsidiary: false,
      hasSubsidiaryAssociateOrJointVenture: false,
      moreThan50Employees: false,
      principalPlaceOfBusiness: org.addressCity ?? undefined,
    },
    period: {
      startDate: window.start,
      endDate: window.end,
      priorStartDate: prior.start,
      priorEndDate: prior.end,
    },
    approvals: {
      authorisationDate: options.authorisationDate || window.end,
      goingConcern: options.goingConcern ?? true,
      comparativeRestated: false,
      directorsTrueAndFair: true,
      directorsSolvent: true,
    },
    audit: options.auditOpinion
      ? {
          opinion: options.auditOpinion,
          standards: "Singapore Standards on Auditing",
          goingConcernUncertainty: false,
          recordsKept: "Yes",
        }
      : undefined,
    current,
    prior: priorModel,
    overrides: options.overrides,
    notes: options.notes,
  };

  return { input, templateReason, size: { revenue, totalAssets } };
}

/**
 * Balance-sheet accounts carry their closing balance; revenue and expense
 * accounts carry the year's movement. Merging keeps one aggregate per account,
 * preferring the closing balance for balance-sheet types.
 */
function mergeBalances(
  closing: Awaited<ReturnType<typeof aggregateAsAt>>,
  period: Awaited<ReturnType<typeof aggregateByDateRange>>
) {
  const byId = new Map(closing.map((a) => [a.accountId, a]));
  const out = [...closing];
  for (const a of period) {
    if (a.type === "revenue" || a.type === "expense") {
      out.push(a);
    } else if (!byId.has(a.accountId)) {
      out.push(a);
    }
  }
  return out;
}

function fmt(cents: number): string {
  return `S$${(cents / 100).toLocaleString("en-SG", { maximumFractionDigits: 0 })}`;
}

/** Full package for the download route. */
export async function buildFilingPackage(
  organizationId: string,
  options: AssembleOptions
) {
  const assembled = await assembleXbrlFiling(organizationId, options);
  return { ...assembled, package: buildXbrlPackage(assembled.input) };
}
