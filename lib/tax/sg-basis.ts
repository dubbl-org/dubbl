/**
 * Singapore tax-basis schedule: the figures that come from the tax computation
 * rather than from a ledger account.
 *
 * Two boxes depend on it — capital allowances (from the fixed-asset register) and
 * the partial / start-up exemption (from the statutory ladder) — in the Form C-S
 * and ECI returns. They are computed here, before the boxes, because the
 * chargeable income they produce is what those boxes report.
 *
 * Everything is integer cents. The arithmetic itself lives in
 * lib/tax/sg-tax-computation.ts (pure, tested); this file only reads the org and
 * its assets.
 */
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { assetCategory, fixedAsset, organization } from "@/lib/db/schema";
import { accountTypeBalance } from "@/lib/tax/ledger";
import {
  capitalAllowances,
  partialExemption,
  startupExemption,
  type AssetCategory,
  type CapitalAssetInput,
} from "@/lib/tax/sg-tax-computation";

/**
 * Asset category from the register. The register is free text, so match on
 * keywords and fall back to "other" (3-year plant & machinery) — never to land,
 * which gets no allowance.
 */
function categoryOf(name: string): AssetCategory {
  const n = name.toLowerCase();
  if (n.includes("computer") || n.includes("laptop") || n.includes("server")) return "computer";
  if (n.includes("furniture") || n.includes("fitting")) return "furniture";
  if (n.includes("renovat")) return "renovation";
  if (n.includes("office") || n.includes("printer") || n.includes("equipment")) return "office_equipment";
  if (n.includes("land")) return "land";
  if (n.includes("car") || n.includes("vehicle")) return "private_car";
  return "other";
}

/** Whole years between two ISO dates, floored. */
function wholeYearsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const beforeAnniversary =
    b.getUTCMonth() < a.getUTCMonth() ||
    (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

export interface SgBasisValues {
  /** Box id → cents, for the `taxBasisSchedule` sources. */
  boxes: Record<string, number>;
  /** What the workpaper should say the figures are built from. */
  detail: {
    netProfit: number;
    addBacks: number;
    capitalAllowances: number;
    exemption: number;
    exemptionKind: "startup" | "partial" | "none";
    chargeableIncomeBeforeExemption: number;
    assetLines: { name: string; cost: number; allowance: number; note?: string }[];
  };
}

/**
 * Compute the capital-allowance and exemption figures for a fiscal year.
 *
 * The year-of-assessment index for the start-up exemption is derived from the
 * organization's creation date, which is the closest thing the books have to an
 * incorporation date. A company incorporated before it started using dubbl would
 * therefore overstate its start-up eligibility, so the result reports which
 * exemption it applied and the UI shows it for review.
 */
export async function sgBasisValues(
  organizationId: string,
  period: { startDate: string; endDate: string },
  kind: string
): Promise<SgBasisValues> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: {
      createdAt: true,
      newStartupExemption: true,
      accountingStandard: true,
    },
  });

  const assets = await db
    .select({
      name: fixedAsset.name,
      purchaseDate: fixedAsset.purchaseDate,
      purchasePrice: fixedAsset.purchasePrice,
      categoryName: assetCategory.name,
    })
    .from(fixedAsset)
    .leftJoin(assetCategory, eq(fixedAsset.categoryId, assetCategory.id))
    .where(
      and(
        eq(fixedAsset.organizationId, organizationId),
        isNull(fixedAsset.deletedAt),
        // Three-year straight line: anything bought before that window is fully
        // written down and cannot contribute an allowance this year.
        gte(fixedAsset.purchaseDate, shiftYears(period.startDate, -3)),
        lte(fixedAsset.purchaseDate, period.endDate)
      )
    );

  const assetInputs: CapitalAssetInput[] = assets.map((a) => {
    const yearsClaimed = wholeYearsBetween(a.purchaseDate, period.startDate);
    return {
      cost: a.purchasePrice,
      category: categoryOf(a.categoryName ?? a.name),
      acquiredInYear: a.purchaseDate >= period.startDate,
      isLowValue: a.purchasePrice <= 500_000,
      yearsAlreadyClaimed: Math.min(yearsClaimed, 3),
    };
  });

  const ca = capitalAllowances(assetInputs);

  const [revenue, expenses, addBacks] = await Promise.all([
    accountTypeBalance(organizationId, "revenue", "credit", period.startDate, period.endDate),
    accountTypeBalance(organizationId, "expense", "debit", period.startDate, period.endDate),
    // Add-backs: every expense account weighted by its own disallowed share, so
    // entertainment and private-car costs are picked up wherever they are posted.
    accountTypeBalance(organizationId, "expense", "debit", period.startDate, period.endDate, true),
  ]);

  const netProfit = revenue - expenses;
  const chargeableBeforeExemption = Math.max(0, netProfit + addBacks - ca.totalAllowance);

  const fiscalYearEndYear = Number(period.endDate.slice(0, 4));
  // YA is the year after the financial year end (31 Dec 2025 → YA 2026).
  const yearOfAssessment = fiscalYearEndYear + 1;
  const incorporatedYear = org?.createdAt ? org.createdAt.getUTCFullYear() : fiscalYearEndYear;
  const yaIndex = yearOfAssessment - incorporatedYear + 1;

  const startup = org?.newStartupExemption
    ? startupExemption({
        chargeableIncomeBeforeExemption: chargeableBeforeExemption,
        yearOfAssessmentIndex: yaIndex,
        // Singapore-incorporated, tax-resident, shareholder conditions: only the
        // last is a genuine judgement, and it is what newStartupExemption means.
        incorporatedInSingapore: true,
        taxResident: true,
        shareholderConditionMet: true,
      })
    : null;

  const exemption = startup?.qualifies
    ? { exemptAmount: startup.exemptAmount, kind: "startup" as const }
    : { exemptAmount: partialExemption(chargeableBeforeExemption).exemptAmount, kind: "partial" as const };

  const boxes: Record<string, number> = {
    additions: assetInputs
      .filter((a) => a.acquiredInYear)
      .reduce((s, a) => s + a.cost, 0),
    allowance: ca.totalAllowance,
    carried_forward: ca.carriedForward,
    capital_allowances: ca.totalAllowance,
    exemption: exemption.exemptAmount,
    // Workpapers that want the ladder's own view of chargeable income.
    chargeable_income: Math.max(0, chargeableBeforeExemption - exemption.exemptAmount),
  };

  return {
    boxes,
    detail: {
      netProfit,
      addBacks,
      capitalAllowances: ca.totalAllowance,
      exemption: exemption.exemptAmount,
      exemptionKind: exemption.kind,
      chargeableIncomeBeforeExemption: chargeableBeforeExemption,
      assetLines: ca.assets.map((a, i) => ({
        name: assets[i]?.name ?? a.category,
        cost: a.cost,
        allowance: a.allowanceThisYear,
        note: a.note,
      })),
    },
  };
}

/** Shift an ISO date by whole years (used for the asset look-back window). */
function shiftYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** Returns whose boxes need the tax-basis schedule. */
export function needsBasisSchedule(def: { boxes: { compute: { type: string } }[] }): boolean {
  return def.boxes.some((b) => b.compute.type === "taxBasisSchedule");
}
