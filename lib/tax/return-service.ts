/**
 * Tax return service: resolve the module, gather, compute.
 *
 * Routes stay thin (auth + params + serialisation); this is the one place that
 * knows how a return is assembled, so the adapter routes and MCP tools cannot
 * drift from each other.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taxPeriod, taxReturnLine } from "@/lib/db/schema";
import {
  computeReturn,
  gatherReturnInputs,
  rateWarningsForPeriod,
  type ReturnContext,
} from "@/lib/tax/engine";
import { getOrgTaxConfig, resolveBasis } from "@/lib/tax/ledger";
import { getReturnDefinition, resolveTaxModuleForOrg } from "@/lib/tax/registry";
import type { ReturnResult, TaxBasis, TaxModule } from "@/lib/tax/types";

export interface GetTaxReturnOptions {
  /** Force a module (the GB adapters do this to keep their old shape). */
  module?: TaxModule;
  /** Return kind; defaults to the module's first return. */
  kind?: string | null;
  startDate: string;
  endDate: string;
  /** Explicit basis override; falls back to organization.vatScheme. */
  basis?: string | null;
  flatRatePercent?: number | null;
  /** Persisted manual box values are read from this tax period, when given. */
  periodId?: string | null;
  country?: string | null;
}

export interface TaxReturnResponse {
  result: ReturnResult;
  module: TaxModule;
  /** The org's configured scheme, echoed for the client's basis toggle. */
  vatScheme: TaxBasis;
  flatRate: { applied: boolean; percentBp?: number };
}

/** IRAS requires filing in SGD; the module says whether that applies. */
function returnCurrency(module: TaxModule, baseCurrency: string): string {
  return module.currencyRule === "local" ? "SGD" : baseCurrency;
}

export async function getTaxReturn(
  organizationId: string,
  options: GetTaxReturnOptions
): Promise<TaxReturnResponse> {
  const config = await getOrgTaxConfig(organizationId);
  const module =
    options.module ?? (await resolveTaxModuleForOrg(organizationId, options.country));
  const kind = options.kind ?? module.returns[0]?.kind;
  const def = kind ? getReturnDefinition(module, kind) : null;
  const flatRateApplied =
    options.flatRatePercent != null &&
    Number.isFinite(options.flatRatePercent) &&
    options.flatRatePercent > 0;
  const flatRate = flatRateApplied
    ? { applied: true, percentBp: options.flatRatePercent! }
    : { applied: false };

  if (!def) {
    throw Object.assign(
      new Error(
        `Unknown return kind "${kind}" for ${module.country}. Available: ${module.returns
          .map((r) => r.kind)
          .join(", ")}`
      ),
      { status: 400 }
    );
  }

  // A module may not offer the requested basis (Singapore has no cash
  // accounting); fall back to its first supported basis instead of lying.
  const requested = resolveBasis(options.basis, config);
  const basis: TaxBasis = def.bases.includes(requested)
    ? requested
    : (def.bases[0] ?? "accrual");

  const manual = await manualOverrides(organizationId, options.periodId, kind);
  const inputs = await gatherReturnInputs(
    organizationId,
    module,
    def,
    { startDate: options.startDate, endDate: options.endDate },
    basis,
    manual
  );

  const ctx: ReturnContext = {
    country: module.country,
    currency: returnCurrency(module, config.baseCurrency),
    basis,
    period: { startDate: options.startDate, endDate: options.endDate },
    flatRatePercent: flatRateApplied ? options.flatRatePercent : null,
  };

  const result = computeReturn(module, def, inputs, ctx);
  result.rateWarnings = await rateWarningsForPeriod(organizationId, ctx.period);

  return { result, module, vatScheme: config.vatScheme, flatRate };
}

/**
 * Manual box values persisted on the tax period, keyed by box. These win over
 * computed figures so a re-opened return shows the numbers that were filed.
 */
async function manualOverrides(
  organizationId: string,
  periodId: string | null | undefined,
  kind: string
): Promise<Record<string, number>> {
  if (!periodId) return {};
  const period = await db.query.taxPeriod.findFirst({
    where: and(eq(taxPeriod.id, periodId), eq(taxPeriod.organizationId, organizationId)),
    columns: { id: true },
  });
  if (!period) return {};
  const lines = await db
    .select({ box: taxReturnLine.boxNumber, amount: taxReturnLine.amount })
    .from(taxReturnLine)
    .where(and(eq(taxReturnLine.taxPeriodId, periodId), eq(taxReturnLine.isCalculated, false)));
  void kind;
  return Object.fromEntries(lines.map((l) => [l.box, l.amount]));
}
