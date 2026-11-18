/**
 * Statement of changes in equity for a period, from the ledger.
 *
 * Shared by the REST route (`/api/v1/reports/soce`) and the MCP tool so both
 * produce the same rows. Figures are integer cents.
 *
 * Opening equity is the ledger's equity accounts on the day before the period
 * starts; closing equity is its equity accounts at the period end plus this
 * period's unclosed profit. Share issues and dividends posted during the period
 * become one residual row ("Dividends and other movements") so the statement
 * always adds up to the closing balance.
 */
import { aggregateAsAt, aggregateByDateRange } from "@/lib/reports/gl-query";
import { buildFsModel, type SoceModel } from "@/lib/reports/fs-model";
import { resolveTaxModuleForOrg } from "@/lib/tax/registry";
import { SG_MODULE } from "@/lib/tax/modules/sg";
import type { FsPresentation } from "@/lib/tax/types";

export interface SoceReport {
  startDate: string;
  endDate: string;
  presentation: FsPresentation;
  rows: SoceModel["rows"];
  closing: SoceModel["closing"];
  netProfit: number;
  /** Assets − liabilities − equity; non-zero means the books are out. */
  imbalance: number;
}

/** The ISO date one day before `iso` (UTC, so no DST drift). */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function buildSoceReport(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<SoceReport> {
  const [module, openingEquityAccounts, closingAccounts, periodAccounts] =
    await Promise.all([
      resolveTaxModuleForOrg(organizationId),
      aggregateAsAt(organizationId, dayBefore(startDate), { accountTypes: ["equity"] }),
      aggregateAsAt(organizationId, endDate, {
        accountTypes: ["asset", "liability", "equity"],
      }),
      aggregateByDateRange(
        organizationId,
        { startDate, endDate },
        { accountTypes: ["revenue", "expense"] }
      ),
    ]);

  // SFRS is Singapore's standard, so a module without a presentation uses its.
  const presentation = module.fsPresentation ?? SG_MODULE.fsPresentation!;
  const sumBy = (retained: boolean) =>
    openingEquityAccounts
      .filter((a) => ((a.subType ?? "") === "retained") === retained)
      .reduce((s, a) => s + a.balance, 0);

  const model = buildFsModel({
    accounts: [...closingAccounts, ...periodAccounts],
    presentation,
    openingEquity: {
      shareCapital: sumBy(false),
      retainedEarnings: sumBy(true),
    },
  });

  const { soce, netProfit, imbalance } = model;
  const opening = soce.rows[0];
  const shareDelta = soce.closing.shareCapital - opening.shareCapital;
  const retainedDelta =
    soce.closing.retainedEarnings - opening.retainedEarnings - netProfit;

  const rows: SoceModel["rows"] = [...soce.rows];
  if (shareDelta !== 0 || retainedDelta !== 0) {
    rows.splice(rows.length - 1, 0, {
      caption: "Dividends and other movements",
      shareCapital: shareDelta,
      retainedEarnings: retainedDelta,
      total: shareDelta + retainedDelta,
    });
  }

  return {
    startDate,
    endDate,
    presentation,
    rows,
    closing: soce.closing,
    netProfit,
    imbalance,
  };
}
