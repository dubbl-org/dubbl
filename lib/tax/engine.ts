/**
 * Tax return engine: one gather pass over the ledger, one pure compute pass over
 * the module's box definitions.
 *
 * Splitting them is what makes the arithmetic testable without a database:
 * `gatherReturnInputs` is the only async part, and `computeReturn` takes the
 * figures as plain numbers. A box whose source is `manual`, `taxBasisSchedule`
 * or otherwise uncomputable is filled from `inputs.manual` — a persisted
 * override on `tax_return_line` always wins over a computed figure.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { taxRate } from "@/lib/db/schema";
import {
  accountTagBalance,
  accountTransactions,
  accountTypeBalance,
  controlAccountMovement,
  computeEcSales,
  docLineTotals,
  docTotal,
  getOrgTaxConfig,
  reverseChargeFromDocs,
  reverseChargeVat,
  type BoxTransaction,
} from "@/lib/tax/ledger";
import type {
  BoxSource,
  ComputedBox,
  ReturnDefinition,
  ReturnReconciliation,
  ReturnResult,
  TaxBasis,
  TaxModule,
} from "@/lib/tax/types";

/** Every figure a return can draw on, keyed by source. */
export interface ReturnInputs {
  /** account code → posted movement */
  controls: Record<string, { debits: number; credits: number }>;
  /** "invoiceLine:net" → supply category → cents */
  docLines: Record<string, Record<string, number>>;
  /** "invoice:net" → cents */
  docTotals: Record<string, number>;
  ecSales: number;
  ecAcquisitions: number;
  revenue: number;
  /** "revenue:credit" → cents */
  accountTypes: Record<string, number>;
  /** "directors_fees:debit:false" → cents */
  accountTags: Record<string, number>;
  reverseChargeLedger: number;
  reverseChargeDocs: number;
  /** box → cents, from tax_return_line (isCalculated = false) */
  manual: Record<string, number>;
  /** box → cents, from the tax computation (capital allowances, exemption). */
  schedule: Record<string, number>;
}

export interface ReturnContext {
  country: string;
  currency: string;
  basis: TaxBasis;
  period: { startDate: string; endDate: string };
  /** UK flat-rate scheme: box 1 becomes a flat percentage of gross turnover. */
  flatRatePercent?: number | null;
}

const emptyInputs = (): ReturnInputs => ({
  controls: {},
  docLines: {},
  docTotals: {},
  ecSales: 0,
  ecAcquisitions: 0,
  revenue: 0,
  accountTypes: {},
  accountTags: {},
  reverseChargeLedger: 0,
  reverseChargeDocs: 0,
  manual: {},
  schedule: {},
});

/** Every box source in a definition, including the ones derived boxes point at. */
function allSources(def: ReturnDefinition): { box: string; source: BoxSource }[] {
  return def.boxes.map((b) => ({ box: b.box, source: b.compute }));
}

/** Fetch only what the definition actually uses. */
export async function gatherReturnInputs(
  organizationId: string,
  module: TaxModule,
  def: ReturnDefinition,
  period: { startDate: string; endDate: string },
  basis: TaxBasis,
  manual: Record<string, number> = {}
): Promise<ReturnInputs> {
  const inputs = emptyInputs();
  inputs.manual = manual;
  const sources = allSources(def).map((s) => s.source);

  const controlCodes = new Set<string>();
  const lines = new Set<string>();
  const totals = new Set<string>();
  const accountTypes = new Set<string>();
  const tags = new Set<string>();
  let needEc = false;
  let needRevenue = false;
  let needRcLedger = false;
  let needRcDocs = false;

  for (const s of sources) {
    switch (s.type) {
      case "controlAccount":
        controlCodes.add(s.account);
        if (s.excludingReverseCharge === "ledger") needRcLedger = true;
        if (s.excludingReverseCharge === "docLines") needRcDocs = true;
        break;
      case "reverseCharge":
        if (s.from === "ledger") needRcLedger = true;
        else needRcDocs = true;
        break;
      case "docLines":
        lines.add(`${s.doc}:${s.measure}`);
        break;
      case "docTotal":
        totals.add(`${s.doc}:${s.measure}`);
        break;
      case "ecSales":
      case "ecAcquisitions":
        needEc = true;
        break;
      case "revenueFromPnl":
        needRevenue = true;
        break;
      case "accountType":
        accountTypes.add(`${s.accountType}:${s.sign}`);
        break;
      case "accountTag":
        tags.add(`${s.subType}:${s.sign}:${s.disallowedWeighted ? "weighted" : "gross"}`);
        break;
      default:
        break;
    }
  }

  if (needRcLedger) {
    controlCodes.add(module.controlAccounts.output);
    if (module.controlAccounts.input) controlCodes.add(module.controlAccounts.input);
  }

  await Promise.all([
    ...[...controlCodes].map(async (code) => {
      inputs.controls[code] = await controlAccountMovement(
        organizationId,
        code,
        period.startDate,
        period.endDate,
        basis
      );
    }),
    ...[...lines].map(async (key) => {
      const [doc, measure] = key.split(":") as ["invoiceLine" | "billLine", "net" | "tax" | "gross"];
      inputs.docLines[key] = await docLineTotals(
        organizationId,
        doc,
        measure,
        period.startDate,
        period.endDate
      );
    }),
    ...[...totals].map(async (key) => {
      const [doc, measure] = key.split(":") as ["invoice" | "bill", "net" | "gross"];
      inputs.docTotals[key] = await docTotal(
        organizationId,
        doc,
        measure,
        period.startDate,
        period.endDate
      );
    }),
    ...[...accountTypes].map(async (key) => {
      const [type, sign] = key.split(":") as ["revenue" | "expense", "credit" | "debit"];
      inputs.accountTypes[key] = await accountTypeBalance(
        organizationId,
        type,
        sign,
        period.startDate,
        period.endDate
      );
    }),
    ...[...tags].map(async (key) => {
      const [subType, sign, weighted] = key.split(":") as [string, "credit" | "debit", string];
      inputs.accountTags[key] = await accountTagBalance(
        organizationId,
        subType,
        sign,
        period.startDate,
        period.endDate,
        weighted === "weighted"
      );
    }),
    needEc
      ? (async () => {
          const country = await orgCountry(organizationId);
          const ec = await computeEcSales(
            organizationId,
            period.startDate,
            period.endDate,
            country
          );
          inputs.ecSales = ec.ecSalesNet;
          inputs.ecAcquisitions = ec.ecAcquisitionsNet;
        })()
      : Promise.resolve(),
    needRevenue
      ? (async () => {
          inputs.revenue = await accountTypeBalance(
            organizationId,
            "revenue",
            "credit",
            period.startDate,
            period.endDate
          );
        })()
      : Promise.resolve(),
    needRcLedger
      ? (async () => {
          if (!module.controlAccounts.input) return;
          inputs.reverseChargeLedger = await reverseChargeVat(
            organizationId,
            module.controlAccounts.output,
            module.controlAccounts.input,
            period.startDate,
            period.endDate
          );
        })()
      : Promise.resolve(),
    needRcDocs
      ? (async () => {
          inputs.reverseChargeDocs = await reverseChargeFromDocs(
            organizationId,
            period.startDate,
            period.endDate
          );
        })()
      : Promise.resolve(),
  ]);

  return inputs;
}

async function orgCountry(organizationId: string): Promise<string | null> {
  const config = await getOrgTaxConfig(organizationId);
  return config.country;
}

/** Which figure a leaf source resolves to. Derived boxes are handled separately. */
function leafValue(boxId: string, source: BoxSource, inputs: ReturnInputs): number | null {
  switch (source.type) {
    case "controlAccount": {
      const m = inputs.controls[source.account] ?? { debits: 0, credits: 0 };
      let value = source.sign === "credit" ? m.credits - m.debits : m.debits - m.credits;
      if (source.excludingReverseCharge === "ledger") value -= inputs.reverseChargeLedger;
      if (source.excludingReverseCharge === "docLines") value -= inputs.reverseChargeDocs;
      return value;
    }
    case "reverseCharge":
      return source.from === "ledger" ? inputs.reverseChargeLedger : inputs.reverseChargeDocs;
    case "docLines": {
      const byCategory = inputs.docLines[`${source.doc}:${source.measure}`] ?? {};
      if (!source.supplyCategory) {
        return Object.values(byCategory).reduce((a, b) => a + b, 0);
      }
      return source.supplyCategory.reduce((sum, c) => sum + (byCategory[c] ?? 0), 0);
    }
    case "docTotal":
      return inputs.docTotals[`${source.doc}:${source.measure}`] ?? 0;
    case "ecSales":
      return inputs.ecSales;
    case "ecAcquisitions":
      return inputs.ecAcquisitions;
    case "revenueFromPnl":
      return inputs.revenue;
    case "accountType":
      return inputs.accountTypes[`${source.accountType}:${source.sign}`] ?? 0;
    case "accountTag":
      return (
        inputs.accountTags[
          `${source.subType}:${source.sign}:${source.disallowedWeighted ? "weighted" : "gross"}`
        ] ?? 0
      );
    case "taxBasisSchedule":
      return inputs.schedule[boxId] ?? 0;
    case "manual":
      return 0;
    default:
      // sum / difference are derived, not leaves.
      return null;
  }
}

/**
 * Compute the boxes from already-gathered figures. Pure: same inputs, same
 * output, no database.
 */
export function computeReturn(
  module: TaxModule,
  def: ReturnDefinition,
  inputs: ReturnInputs,
  ctx: ReturnContext
): ReturnResult {
  const values = new Map<string, number>();
  const byBox = new Map(def.boxes.map((b) => [b.box, b]));

  // Pass 1: leaves. A manual override on any box wins over the computed figure.
  for (const box of def.boxes) {
    const override = inputs.manual[box.box];
    if (override != null) {
      values.set(box.box, override);
      continue;
    }
    const leaf = leafValue(box.box, box.compute, inputs);
    if (leaf != null) values.set(box.box, leaf);
  }

  // Flat-rate scheme: replaces output/input tax boxes, leaving the rest intact.
  const flatRate = ctx.flatRatePercent;
  if (def.kind === "vat100" && flatRate != null && flatRate > 0) {
    const gross = inputs.docTotals["invoice:gross"] ?? 0;
    values.set("1", Math.round((gross * flatRate) / 10000));
    values.set("2", 0);
    values.set("4", 0);
  }

  // Pass 2: derived boxes, resolved recursively so definition order is free.
  const visiting = new Set<string>();
  const resolve = (boxId: string): number => {
    const cached = values.get(boxId);
    if (cached != null) return cached;
    const spec = byBox.get(boxId);
    if (!spec || visiting.has(boxId)) return 0;
    visiting.add(boxId);
    let value = 0;
    const src = spec.compute;
    if (src.type === "sum") {
      value = src.of.reduce((s, b) => s + resolve(b), 0);
    } else if (src.type === "difference") {
      value =
        src.plus.reduce((s, b) => s + resolve(b), 0) -
        src.minus.reduce((s, b) => s + resolve(b), 0);
    } else {
      value = inputs.manual[boxId] ?? 0;
    }
    visiting.delete(boxId);
    values.set(boxId, value);
    return value;
  };

  const boxes: ComputedBox[] = def.boxes.map((b) => ({
    box: b.box,
    label: b.label,
    help: b.help,
    optional: b.optional,
    amount: resolve(b.box),
    source: inputs.manual[b.box] != null ? "manual" : sourceKind(b.compute),
  }));

  return {
    kind: def.kind,
    title: def.title,
    authority: def.authority,
    country: module.country,
    currency: ctx.currency,
    basis: ctx.basis,
    period: ctx.period,
    boxes,
    reconciliation: buildReconciliation(def, boxes, inputs),
    rateWarnings: [],
  };
}

function sourceKind(source: BoxSource): ComputedBox["source"] {
  switch (source.type) {
    case "controlAccount":
    case "reverseCharge":
      return "ledger";
    case "docLines":
    case "docTotal":
    case "ecSales":
    case "ecAcquisitions":
      return "documents";
    case "sum":
    case "difference":
      return "derived";
    default:
      return "manual";
  }
}

/**
 * Supply/purchase figures come from documents while tax comes from the ledger,
 * and the two can legitimately diverge (manual journals to revenue, bank spend
 * with no bill). Show the delta; never auto-post an adjustment.
 */
function buildReconciliation(
  def: ReturnDefinition,
  boxes: ComputedBox[],
  inputs: ReturnInputs
): ReturnReconciliation[] {
  const rows: ReturnReconciliation[] = [];
  const supplyBoxes = def.boxes.filter(
    (b) => b.compute.type === "docLines" && b.compute.doc === "invoiceLine"
  );
  if (supplyBoxes.length > 0) {
    const amounts = boxes.filter((b) => supplyBoxes.some((s) => s.box === b.box));
    const returnAmount = amounts.reduce((s, b) => s + b.amount, 0);
    rows.push({
      label: "Supplies on documents vs revenue in the profit and loss",
      returnAmount,
      ledgerAmount: inputs.revenue || inputs.accountTypes["revenue:credit"] || 0,
      delta: returnAmount - (inputs.revenue || inputs.accountTypes["revenue:credit"] || 0),
      note: "Revenue posted without an invoice (journals, bank categorisations) shows up here.",
    });
  }
  const purchaseBoxes = def.boxes.filter(
    (b) => b.compute.type === "docLines" && b.compute.doc === "billLine"
  );
  if (purchaseBoxes.length > 0) {
    const amounts = boxes.filter((b) => purchaseBoxes.some((s) => s.box === b.box));
    const returnAmount = amounts.reduce((s, b) => s + b.amount, 0);
    const expenses = inputs.accountTypes["expense:debit"] ?? 0;
    rows.push({
      label: "Taxable purchases on documents vs expenses in the profit and loss",
      returnAmount,
      ledgerAmount: expenses,
      delta: returnAmount - expenses,
      note: "Spend categorised straight from the bank has no bill and is not in the purchase boxes.",
    });
  }
  return rows;
}

/**
 * Rates whose effective window does not cover the period. A warning on the
 * return page, never a block: an org may rightfully have seeded next year's rate
 * early.
 */
export async function rateWarningsForPeriod(
  organizationId: string,
  period: { startDate: string; endDate: string }
): Promise<string[]> {
  const rates = await db
    .select({
      name: taxRate.name,
      rate: taxRate.rate,
      effectiveFrom: taxRate.effectiveFrom,
      effectiveTo: taxRate.effectiveTo,
      isActive: taxRate.isActive,
    })
    .from(taxRate)
    .where(and(eq(taxRate.organizationId, organizationId), isNull(taxRate.deletedAt)));

  const warnings: string[] = [];
  for (const r of rates) {
    const expired = r.effectiveTo != null && r.effectiveTo < period.endDate;
    const notYet = r.effectiveFrom != null && r.effectiveFrom > period.startDate;
    if (!r.isActive) warnings.push(`${r.name}: inactive rate`);
    else if (expired) warnings.push(`${r.name}: not in force for this period (ended ${r.effectiveTo})`);
    else if (notYet) warnings.push(`${r.name}: not in force for this period (starts ${r.effectiveFrom})`);
  }
  return warnings;
}

/** Drill-down for a single box: the journal lines behind it, when it has any. */
export async function drillBox(
  organizationId: string,
  def: ReturnDefinition,
  box: string,
  period: { startDate: string; endDate: string },
  basis: TaxBasis
): Promise<{ accountCode: string; sign: "credit" | "debit"; transactions: BoxTransaction[] } | null> {
  const spec = def.boxes.find((b) => b.box === box);
  if (!spec || spec.compute.type !== "controlAccount") return null;
  const { account, sign } = spec.compute;
  const transactions = await accountTransactions(
    organizationId,
    account,
    sign,
    period.startDate,
    period.endDate,
    basis
  );
  return { accountCode: account, sign, transactions };
}
