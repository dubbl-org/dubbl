import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { taxPeriod, taxReturnLine } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { createVatReturnClearingJournalEntry } from "@/lib/api/journal-automation";
import {
  getOrgTaxConfig,
  resolveBasis,
  controlAccountMovement,
  computeEcSales,
} from "@/lib/reports/tax-return";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for VAT/GST tax periods — the filing-tracking records that group a
 * date range (e.g. "Q1 2026") for a VAT return. Mirrors the REST routes under
 * app/api/v1/tax-periods (list/get/create + the [id]/file flow).
 *
 * The taxPeriod table has no soft-delete, so queries are org-scoped only.
 * All monetary amounts — both INPUTS and RESULTS — are integer cents (e.g.
 * $12.50 = 1250). Direct DB access via Drizzle (no HTTP self-calls); org-scoped
 * via the AuthContext.
 *
 * Note: the cash settlement of a filed return (paying/refunding the authority)
 * lives in the `record_vat_settlement` tool; this file does not duplicate it.
 */
export function registerTaxPeriodTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_tax_periods",
    "List the organization's VAT/GST tax periods (filing-tracking records), newest start date first, each with its frozen return lines (box figures). Tax-return line amounts are in integer cents. Returns the tax periods.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const periods = await db.query.taxPeriod.findMany({
          where: eq(taxPeriod.organizationId, ctx.organizationId),
          orderBy: desc(taxPeriod.startDate),
          with: { lines: true },
        });

        return { taxPeriods: periods };
      })
  );

  server.tool(
    "get_tax_period",
    "Get a single VAT/GST tax period by ID, including its frozen return lines (box figures). Tax-return line amounts are in integer cents. Returns the tax period.",
    {
      taxPeriodId: z.string().describe("The UUID of the tax period"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.taxPeriod.findFirst({
          where: and(
            eq(taxPeriod.id, params.taxPeriodId),
            eq(taxPeriod.organizationId, ctx.organizationId)
          ),
          with: { lines: true },
        });
        if (!found) throw new Error("Tax period not found");
        return { taxPeriod: found };
      })
  );

  server.tool(
    "create_tax_period",
    "Create a VAT/GST tax period (a filing-tracking record for a date range). The period starts in 'open' status and can later be filed. Returns the created tax period.",
    {
      name: z
        .string()
        .min(1)
        .describe("Display name for the period, e.g. 'Q1 2026'."),
      startDate: z
        .string()
        .min(1)
        .describe("Period start date in YYYY-MM-DD."),
      endDate: z
        .string()
        .min(1)
        .describe("Period end date in YYYY-MM-DD."),
      type: z
        .enum(["monthly", "quarterly", "annual"])
        .describe("Filing frequency of the period: 'monthly', 'quarterly', or 'annual'."),
      notes: z
        .string()
        .optional()
        .describe("Optional free-text notes for the period."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");

        const [created] = await db
          .insert(taxPeriod)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            startDate: params.startDate,
            endDate: params.endDate,
            type: params.type,
            notes: params.notes,
          })
          .returning();

        return { taxPeriod: created };
      })
  );

  server.tool(
    "file_tax_period",
    "File an open VAT/GST tax period. Computes the box figures on the chosen basis (defaults to the org's vatScheme: 'accrual' or 'cash'), FREEZES them into the period's return lines (boxes 1-5, 8, 9) so the filed numbers are auditable and do not drift if entries are later backdated into the period, and posts the VAT-return clearing journal entry against those SAME figures — zeroing the period's Output VAT (2200, box 1) and Input VAT (1500, box 4) control-account balances and booking the net to the VAT Suspense / return-clearing account (2240): credit suspense when net is payable to the authority, debit when it's a refund. Marks the period filed (only an open period can be filed). Returns the clearing journalEntryId, the basis used, the net amount in integer cents (positive = payable to authority, negative = refund), the output/input VAT in integer cents, and the frozen box lines. All amounts are in integer cents. (To record the cash payment/refund of a filed return, use record_vat_settlement.)",
    {
      taxPeriodId: z
        .string()
        .describe("UUID of the open tax period to file."),
      filedReference: z
        .string()
        .optional()
        .describe("Optional filing reference number from the tax authority."),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe("Basis for the frozen figures: 'accrual' or 'cash'. Defaults to the organization's vatScheme."),
      flatRatePercent: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional flat-rate percentage in basis points (1000 = 10.00%) for the flat-rate scheme. When supplied, boxes 1 and 4 are frozen at 0 (the flat-rate box 1 is computed from gross turnover in the report, not here) so nothing is cleared from 2200/1500."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");

        const period = await db.query.taxPeriod.findFirst({
          where: and(
            eq(taxPeriod.id, params.taxPeriodId),
            eq(taxPeriod.organizationId, ctx.organizationId)
          ),
        });
        if (!period) throw new Error("Tax period not found");
        if (period.status !== "open") {
          throw new Error("Only open tax periods can be filed");
        }

        // Compute the box figures NOW so we can freeze them at filing time. Use
        // the org's vatScheme unless the caller overrides the basis. Mirrors the
        // REST file route (app/api/v1/tax-periods/[id]/file/route.ts).
        const config = await getOrgTaxConfig(ctx.organizationId);
        const basis = resolveBasis(params.basis, config);
        const flatRateApplied =
          params.flatRatePercent != null && params.flatRatePercent > 0;

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
          // Post the clearing entry against the SAME basis-aware figures we
          // freeze into the return (box1 = output balance, box4 = input
          // balance), so the 2200/1500 clearing exactly matches the filed boxes
          // — including the cash-basis case (and flat-rate, where both are 0 →
          // nothing to clear). Without this, the helper would re-derive on the
          // accrual basis and drift from the filed return.
          const clearing = await createVatReturnClearingJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              date: period.endDate,
              periodStartDate: period.startDate,
              periodEndDate: period.endDate,
              reference: params.filedReference || period.name,
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
              filedReference: params.filedReference || null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(taxPeriod.id, params.taxPeriodId),
                eq(taxPeriod.organizationId, ctx.organizationId),
                eq(taxPeriod.status, "open")
              )
            )
            .returning();

          if (!updated) return { clearing, updated: null, lines: [] };

          // Freeze the box figures: clear any prior calculated lines for this
          // period (e.g. from a re-file after an amendment) and persist the set.
          await tx
            .delete(taxReturnLine)
            .where(eq(taxReturnLine.taxPeriodId, params.taxPeriodId));
          const lines = await tx
            .insert(taxReturnLine)
            .values(
              frozenLines.map((l) => ({
                taxPeriodId: params.taxPeriodId,
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

        if (!result.updated) throw new Error("Tax period not found");

        return {
          taxPeriod: result.updated,
          clearingJournalEntryId: result.clearing?.entry.id ?? null,
          net: result.clearing?.net ?? 0,
          outputVat: result.clearing?.outputBalance ?? 0,
          inputVat: result.clearing?.inputBalance ?? 0,
          basis,
          filedLines: result.lines,
        };
      })
  );
}
