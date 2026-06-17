import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxPeriod, taxReturnLine, chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import {
  createVatReturnClearingJournalEntry,
  recordTaxSettlementJournalEntry,
} from "@/lib/api/journal-automation";
import {
  getOrgTaxConfig,
  resolveBasis,
  controlAccountMovement,
  computeEcSales,
} from "@/lib/reports/tax-return";
import { z } from "zod";

/**
 * File a VAT return period or record its cash settlement.
 *
 * mode "file" (default): marks the open period filed and posts the VAT-return
 * clearing entry (DR Output VAT 2200, CR Input VAT 1500, net to VAT Suspense
 * 2240). It ALSO freezes the computed box figures into taxReturnLine
 * (isCalculated=true) so the filed numbers are auditable and do not drift if
 * later entries are backdated into the period. Returns the clearing
 * journalEntryId, net amount (positive = payable, negative = refund) and the
 * persisted box lines.
 *
 * Only an `open` period can be filed (the lock): once filed, the status gate
 * rejects re-filing, and the frozen taxReturnLine rows preserve the submitted
 * figures.
 *
 * mode "settle": records the bank payment to / refund from the authority,
 * clearing VAT Suspense 2240 against the chosen bank GL account.
 */
const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("file").default("file"),
    filedReference: z.string().optional(),
    // Optional basis override for the frozen figures; defaults to org vatScheme.
    basis: z.enum(["accrual", "cash"]).optional(),
    // Optional flat-rate percentage (bp) to freeze box 1 on the flat scheme.
    flatRatePercent: z.number().int().positive().optional(),
  }),
  z.object({
    mode: z.literal("settle"),
    bankGlAccountId: z.string().min(1),
    amount: z.number().int().nonnegative(),
    isRefund: z.boolean().default(false),
    date: z.string().optional(),
    reference: z.string().optional(),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");
    const { id } = await params;

    const rawBody = await request.json().catch(() => ({}));
    // Default to filing when no mode is supplied (back-compat with the prior
    // route, which only flipped status).
    const parsed = bodySchema.parse(
      rawBody && typeof rawBody === "object" && "mode" in rawBody
        ? rawBody
        : { ...rawBody, mode: "file" }
    );

    const period = await db.query.taxPeriod.findFirst({
      where: and(
        eq(taxPeriod.id, id),
        eq(taxPeriod.organizationId, ctx.organizationId)
      ),
    });
    if (!period) return notFound("Tax period");

    if (parsed.mode === "settle") {
      const bankAccount = await db.query.chartAccount.findFirst({
        where: and(
          eq(chartAccount.id, parsed.bankGlAccountId),
          eq(chartAccount.organizationId, ctx.organizationId)
        ),
      });
      if (!bankAccount) return notFound("Bank ledger account");

      const entry = await db.transaction(async (tx) =>
        recordTaxSettlementJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            bankGlAccountId: parsed.bankGlAccountId,
            amount: parsed.amount,
            date: parsed.date || new Date().toISOString().slice(0, 10),
            reference: parsed.reference || period.filedReference || period.name,
            isRefund: parsed.isRefund,
          },
          tx
        )
      );

      return NextResponse.json({
        taxPeriod: period,
        settlementJournalEntryId: entry?.id ?? null,
        amount: parsed.amount,
        isRefund: parsed.isRefund,
      });
    }

    // mode "file" — gate: only an open period can be filed (the lock).
    if (period.status !== "open") {
      return NextResponse.json(
        { error: "Only open tax periods can be filed" },
        { status: 400 }
      );
    }

    // Compute the box figures NOW so we can freeze them at filing time. Use the
    // org's vatScheme unless the caller overrides the basis.
    const config = await getOrgTaxConfig(ctx.organizationId);
    const basis = resolveBasis(parsed.basis, config);
    const flatRateApplied = parsed.flatRatePercent != null && parsed.flatRatePercent > 0;

    const [outputMovement, inputMovement, ec] = await Promise.all([
      controlAccountMovement(ctx.organizationId, "2200", period.startDate, period.endDate, basis),
      controlAccountMovement(ctx.organizationId, "1500", period.startDate, period.endDate, basis),
      computeEcSales(ctx.organizationId, period.startDate, period.endDate, config.country),
    ]);

    const box1 = flatRateApplied
      ? 0 // flat-rate box 1 is computed from gross turnover in the report; not frozen here without turnover read
      : outputMovement.credits - outputMovement.debits;
    const box4 = flatRateApplied ? 0 : inputMovement.debits - inputMovement.credits;
    const box2 = 0;
    const box3 = box1 + box2;
    const box5 = box3 - box4;
    const box8 = ec.ecSalesNet;
    const box9 = ec.ecAcquisitionsNet;

    const frozenLines: {
      boxNumber: string;
      label: string;
      amount: number;
      sortOrder: number;
    }[] = [
      { boxNumber: "1", label: "VAT due on sales", amount: box1, sortOrder: 1 },
      { boxNumber: "2", label: "VAT due on EU acquisitions", amount: box2, sortOrder: 2 },
      { boxNumber: "3", label: "Total VAT due (Box 1 + 2)", amount: box3, sortOrder: 3 },
      { boxNumber: "4", label: "VAT reclaimed on purchases", amount: box4, sortOrder: 4 },
      { boxNumber: "5", label: "Net VAT to pay/reclaim (Box 3 - 4)", amount: box5, sortOrder: 5 },
      { boxNumber: "8", label: "Total supplies to EU ex-VAT", amount: box8, sortOrder: 8 },
      { boxNumber: "9", label: "Total acquisitions from EU ex-VAT", amount: box9, sortOrder: 9 },
    ];

    const result = await db.transaction(async (tx) => {
      // Post the clearing entry against the SAME basis-aware figures we freeze
      // into the return (box1 = output balance, box4 = input balance), so the
      // 2200/1500 clearing exactly matches the filed boxes — including the
      // cash-basis case (and flat-rate, where both are 0 → nothing to clear).
      // Without this, the helper would re-derive on the accrual basis and drift.
      const clearing = await createVatReturnClearingJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          date: period.endDate,
          periodStartDate: period.startDate,
          periodEndDate: period.endDate,
          reference: parsed.filedReference || period.name,
          outputBalance: box1,
          inputBalance: box4,
        },
        tx
      );

      const [updated] = await tx
        .update(taxPeriod)
        .set({
          status: "filed",
          filedAt: new Date(),
          filedBy: ctx.userId,
          filedReference: parsed.filedReference || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taxPeriod.id, id),
            eq(taxPeriod.organizationId, ctx.organizationId),
            eq(taxPeriod.status, "open")
          )
        )
        .returning();

      if (!updated) return { clearing, updated: null, lines: [] };

      // Freeze the box figures: clear any prior calculated lines for this period
      // (e.g. from a re-file after an amendment) and persist the current set.
      await tx.delete(taxReturnLine).where(eq(taxReturnLine.taxPeriodId, id));
      const lines = await tx
        .insert(taxReturnLine)
        .values(
          frozenLines.map((l) => ({
            taxPeriodId: id,
            boxNumber: l.boxNumber,
            label: l.label,
            amount: l.amount,
            isCalculated: true,
            sourceDescription: `Filed ${basis}-basis${flatRateApplied ? " (flat-rate)" : ""}`,
            sortOrder: l.sortOrder,
          }))
        )
        .returning();

      return { clearing, updated, lines };
    });

    if (!result.updated) return notFound("Tax period");

    logAudit({
      ctx,
      action: "tax_period.filed",
      entityType: "tax_period",
      entityId: id,
      changes: {
        basis,
        filedReference: parsed.filedReference ?? null,
        net: result.clearing?.net ?? 0,
        boxes: frozenLines.map((l) => ({ box: l.boxNumber, amount: l.amount })),
      },
      request,
    });

    return NextResponse.json({
      taxPeriod: result.updated,
      clearingJournalEntryId: result.clearing?.entry.id ?? null,
      net: result.clearing?.net ?? 0,
      outputVat: result.clearing?.outputBalance ?? 0,
      inputVat: result.clearing?.inputBalance ?? 0,
      basis,
      filedLines: result.lines,
    });
  } catch (err) {
    return handleError(err);
  }
}
