import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxPeriod, chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { recordTaxSettlementJournalEntry } from "@/lib/api/journal-automation";
import { fileTaxPeriod, TaxFilingError } from "@/lib/reports/tax-filing";
import { z } from "zod";

/**
 * File a VAT return period or record its cash settlement.
 *
 * mode "file" (default): marks the open period filed and posts the VAT-return
 * clearing entry (DR Output VAT 2200, CR Input VAT 1500, net to VAT Suspense
 * 2240). It ALSO freezes the computed box figures into taxReturnLine
 * (isCalculated=true): all nine VAT boxes, or the BAS fields for an Australian
 * organization, so the filed numbers are auditable and do not drift if later
 * entries are backdated into the period. See lib/reports/tax-filing.ts. Returns the clearing
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

    // mode "file": compute, freeze and clear (shared with the MCP tools).
    let filed;
    try {
      filed = await fileTaxPeriod(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        id,
        {
          basis: parsed.basis,
          flatRatePercent: parsed.flatRatePercent ?? null,
          filedReference: parsed.filedReference ?? null,
        }
      );
    } catch (err) {
      if (err instanceof TaxFilingError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    logAudit({
      ctx,
      action: "tax_period.filed",
      entityType: "tax_period",
      entityId: id,
      changes: {
        basis: filed.basis,
        filedReference: parsed.filedReference ?? null,
        net: filed.net,
        boxes: filed.frozenLines.map((l) => ({ box: l.boxNumber, amount: l.amount })),
      },
      request,
    });

    return NextResponse.json({
      taxPeriod: filed.taxPeriod,
      clearingJournalEntryId: filed.clearingJournalEntryId,
      net: filed.net,
      outputVat: filed.outputVat,
      inputVat: filed.inputVat,
      basis: filed.basis,
      filedLines: filed.filedLines,
    });
  } catch (err) {
    return handleError(err);
  }
}
