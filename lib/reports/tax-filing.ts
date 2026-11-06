/**
 * Filing a VAT / GST tax period: shared by the REST route
 * (app/api/v1/tax-periods/[id]/file) and the MCP tools (file_tax_period,
 * file_vat_return) so the frozen figures always match the live report.
 *
 * Filing computes the return on the chosen basis, freezes every box into
 * taxReturnLine, posts the clearing entry (DR Output VAT 2200 / CR Input VAT
 * 1500 / net to VAT Suspense 2240) against those same figures, and marks the
 * period filed. Australian organizations freeze the BAS fields instead of the
 * nine VAT boxes. All amounts are integer cents.
 */
import { db } from "@/lib/db";
import { taxPeriod, taxReturnLine } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createVatReturnClearingJournalEntry } from "@/lib/api/journal-automation";
import {
  computeBas,
  computeVatReturn,
  getOrgTaxConfig,
  loadVatLines,
  resolveBasis,
  type TaxBasis,
} from "@/lib/reports/tax-return";

export class TaxFilingError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function fileTaxPeriod(
  ctx: { organizationId: string; userId: string },
  periodId: string,
  opts: { basis?: TaxBasis; flatRatePercent?: number | null; filedReference?: string | null }
) {
  const period = await db.query.taxPeriod.findFirst({
    where: and(eq(taxPeriod.id, periodId), eq(taxPeriod.organizationId, ctx.organizationId)),
  });
  if (!period) throw new TaxFilingError("Tax period not found", 404);
  if (period.status !== "open") throw new TaxFilingError("Only open tax periods can be filed", 400);

  const config = await getOrgTaxConfig(ctx.organizationId);
  const basis = resolveBasis(opts.basis, config);
  const isBas = config.country === "AU";
  const flatRateApplied = !isBas && opts.flatRatePercent != null && opts.flatRatePercent > 0;

  // Same computation as the live report, so the filed figures match it.
  let frozenLines: { boxNumber: string; label: string; amount: number; sortOrder: number }[];
  let outputBalance: number;
  let inputBalance: number;
  if (isBas) {
    const { fields } = await computeBas(ctx.organizationId, period.startDate, period.endDate, basis, config);
    frozenLines = fields.map((f, i) => ({ boxNumber: f.field, label: f.label, amount: f.amount, sortOrder: i + 1 }));
    outputBalance = fields.find((f) => f.field === "1A")?.amount ?? 0;
    inputBalance = fields.find((f) => f.field === "1B")?.amount ?? 0;
  } else {
    const { boxes } = await computeVatReturn(ctx.organizationId, period.startDate, period.endDate, basis, {
      flatRatePercent: flatRateApplied ? opts.flatRatePercent : null,
      config,
    });
    frozenLines = boxes.map((b) => ({ boxNumber: b.box, label: b.label, amount: b.amount, sortOrder: Number(b.box) }));
    // Box 3 is the whole output VAT movement (reverse charge included). On the
    // cash basis only the paid part is cleared; VAT on unpaid invoices and
    // bills stays in 2200 / 1500 for the period it is paid in. On the
    // flat-rate scheme nothing is cleared.
    outputBalance = flatRateApplied ? 0 : boxes.find((b) => b.box === "3")?.amount ?? 0;
    inputBalance = flatRateApplied ? 0 : boxes.find((b) => b.box === "4")?.amount ?? 0;
  }

  // Clear tax collected from the account that holds it: Output VAT 2200,
  // or Sales Tax Payable 2230 for US sales tax (both when both were used).
  let outputSplit: { accountId: string; amount: number }[] | undefined;
  if (outputBalance !== 0) {
    const byAccount = new Map<string, number>();
    for (const l of await loadVatLines(ctx.organizationId, period.startDate, period.endDate, basis)) {
      if (l.account !== "output" || !l.accountId) continue;
      byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + l.credit - l.debit);
    }
    const parts = [...byAccount.entries()].filter(([, amount]) => amount !== 0).map(([accountId, amount]) => ({ accountId, amount }));
    if (parts.length > 0) {
      // Box 3 / 1A is the whole output movement, so the parts add up to it;
      // any difference stays on the largest part.
      const diff = outputBalance - parts.reduce((sum, p) => sum + p.amount, 0);
      parts.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      parts[0].amount += diff;
      outputSplit = parts;
    }
  }

  const result = await db.transaction(async (tx) => {
    const clearing = await createVatReturnClearingJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        date: period.endDate,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        reference: opts.filedReference || period.name,
        outputBalance,
        inputBalance,
        outputSplit,
      },
      tx
    );

    const [updated] = await tx
      .update(taxPeriod)
      .set({
        status: "filed",
        filedAt: new Date(),
        filedBy: ctx.userId,
        filedReference: opts.filedReference || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taxPeriod.id, periodId),
          eq(taxPeriod.organizationId, ctx.organizationId),
          eq(taxPeriod.status, "open")
        )
      )
      .returning();

    if (!updated) return { clearing, updated: null, lines: [] };

    // Freeze the figures: replace any earlier calculated lines (e.g. from a
    // re-file after an amendment) with the current set.
    await tx.delete(taxReturnLine).where(eq(taxReturnLine.taxPeriodId, periodId));
    const lines = await tx
      .insert(taxReturnLine)
      .values(
        frozenLines.map((l) => ({
          taxPeriodId: periodId,
          boxNumber: l.boxNumber,
          label: l.label,
          amount: l.amount,
          isCalculated: true,
          sourceDescription: `Filed ${basis}-basis${isBas ? " BAS" : ""}${flatRateApplied ? " (flat-rate)" : ""}`,
          sortOrder: l.sortOrder,
        }))
      )
      .returning();

    return { clearing, updated, lines };
  });

  if (!result.updated) throw new TaxFilingError("Tax period not found", 404);

  return {
    taxPeriod: result.updated,
    basis,
    frozenLines,
    clearingJournalEntryId: result.clearing?.entry.id ?? null,
    net: result.clearing?.net ?? 0,
    outputVat: result.clearing?.outputBalance ?? 0,
    inputVat: result.clearing?.inputBalance ?? 0,
    filedLines: result.lines,
  };
}
