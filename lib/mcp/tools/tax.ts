import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  taxPeriod,
  taxReturnLine,
  chartAccount,
  creditNote,
  taxRate,
  taxComponent,
} from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  createVatReturnClearingJournalEntry,
  recordTaxSettlementJournalEntry,
  createCreditNoteJournalEntry,
} from "@/lib/api/journal-automation";
import {
  getOrgTaxConfig,
  resolveBasis,
  controlAccountMovement,
  computeEcSales,
} from "@/lib/reports/tax-return";
import type { AuthContext } from "@/lib/api/auth-context";

const taxRateKindEnum = z.enum([
  "standard",
  "blocked",
  "partial_block",
  "exempt",
  "reverse_charge",
  "no_vat",
  "sales_tax_us",
]);

const KIND_DESCRIPTION =
  "How the tax behaves for input-tax recovery and posting. " +
  "'standard' = normal fully-recoverable VAT/GST (recoverablePercent applies); " +
  "'blocked' = input tax is fully irrecoverable and absorbed into cost (e.g. entertainment); " +
  "'partial_block' = partly recoverable, set the recoverable share via recoverablePercent (e.g. 50% car lease); " +
  "'exempt' = exempt supply, no tax and no recovery; " +
  "'reverse_charge' = buyer self-accounts both output and input VAT (cross-border B2B / domestic reverse charge); " +
  "'no_vat' = outside the scope of VAT; " +
  "'sales_tax_us' = US sales/use tax, collected gross on sales and non-recoverable on purchases. " +
  "Defaults to 'standard'.";

const RECOVERABLE_DESCRIPTION =
  "Share of input (purchase) tax that is recoverable, in basis points where 10000 = 100%. " +
  "Use 5000 for 50% recoverable, 0 for fully blocked/absorbed into cost. " +
  "Only meaningful for kinds 'standard' and 'partial_block'. Defaults to 10000 (100%).";

const componentShape = z
  .object({
    name: z.string().min(1).describe("Display name of this sub-component, e.g. 'GST' or 'PST'."),
    rate: z
      .number()
      .int()
      .min(0)
      .describe("Component rate in basis points (1000 = 10.00%)."),
    accountId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe("Optional UUID of the chart account this component posts to. Omit to use the default tax control account."),
  })
  .describe("A single sub-component of a compound tax.");

const COMPONENTS_DESCRIPTION =
  "Optional list of sub-components for a compound tax (e.g. Canadian GST + PST). " +
  "Each component has a name, a rate in basis points, and an optional chart accountId. " +
  "On update, providing this array fully replaces the existing components; omit it to leave them unchanged.";

export function registerTaxTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_tax_rates",
    "List the organization's tax rates, including their kind (recovery behaviour), recoverablePercent (basis points, 10000 = 100%), and any compound sub-components. Rates and component rates are in integer basis points (1000 = 10.00%). Returns active, non-deleted tax rates.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const rates = await db.query.taxRate.findMany({
          where: and(
            eq(taxRate.organizationId, ctx.organizationId),
            notDeleted(taxRate.deletedAt)
          ),
          with: { components: true },
        });

        return {
          taxRates: rates.map((r) => ({
            id: r.id,
            name: r.name,
            rate: r.rate,
            type: r.type,
            kind: r.kind,
            recoverablePercent: r.recoverablePercent,
            isDefault: r.isDefault,
            isActive: r.isActive,
            components: r.components.map((c) => ({
              id: c.id,
              name: c.name,
              rate: c.rate,
              accountId: c.accountId,
            })),
          })),
        };
      })
  );

  server.tool(
    "create_tax_rate",
    "Create a tax rate. The rate is in integer basis points (1000 = 10.00%). Set 'kind' to control input-tax recovery behaviour and 'recoverablePercent' (basis points) for partly-recoverable taxes. Pass 'components' to define a compound tax (e.g. GST + PST). Returns the created tax rate.",
    {
      name: z.string().min(1).describe("Display name, e.g. 'GST 10%' or 'VAT 20% (standard)'."),
      rate: z
        .number()
        .int()
        .min(0)
        .describe("Tax rate in basis points (1000 = 10.00%)."),
      type: z
        .enum(["sales", "purchase", "both"])
        .default("both")
        .describe("Where the rate applies: 'sales' (invoices), 'purchase' (bills), or 'both'. Defaults to 'both'."),
      kind: taxRateKindEnum.default("standard").describe(KIND_DESCRIPTION),
      recoverablePercent: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(10000)
        .describe(RECOVERABLE_DESCRIPTION),
      components: z.array(componentShape).optional().describe(COMPONENTS_DESCRIPTION),
      isDefault: z
        .boolean()
        .default(false)
        .describe("Whether this is the default tax rate. Defaults to false."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-rates");

        const { components, ...values } = params;

        const created = await db.transaction(async (tx) => {
          // An org can only have one default tax rate. If this one is being
          // made the default, clear the flag on every other rate in the org.
          if (values.isDefault) {
            await tx
              .update(taxRate)
              .set({ isDefault: false })
              .where(
                and(
                  eq(taxRate.organizationId, ctx.organizationId),
                  eq(taxRate.isDefault, true)
                )
              );
          }

          const [row] = await tx
            .insert(taxRate)
            .values({
              organizationId: ctx.organizationId,
              ...values,
            })
            .returning();

          if (components && components.length > 0) {
            await tx.insert(taxComponent).values(
              components.map((c) => ({
                taxRateId: row.id,
                name: c.name,
                rate: c.rate,
                accountId: c.accountId ?? null,
              }))
            );
          }

          return row;
        });

        return { taxRate: created };
      })
  );

  server.tool(
    "update_tax_rate",
    "Update an existing tax rate. Only the fields you pass are changed. The rate is in integer basis points (1000 = 10.00%). Update 'kind' to change input-tax recovery behaviour and 'recoverablePercent' (basis points) for partly-recoverable taxes. Passing 'components' fully replaces the compound sub-components; omit it to leave them unchanged. Returns the updated tax rate.",
    {
      taxRateId: z.string().uuid().describe("UUID of the tax rate to update."),
      name: z.string().min(1).optional().describe("New display name."),
      rate: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("New rate in basis points (1000 = 10.00%)."),
      type: z
        .enum(["sales", "purchase", "both"])
        .optional()
        .describe("Where the rate applies: 'sales', 'purchase', or 'both'."),
      kind: taxRateKindEnum.optional().describe(KIND_DESCRIPTION),
      recoverablePercent: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .optional()
        .describe(RECOVERABLE_DESCRIPTION),
      components: z.array(componentShape).optional().describe(COMPONENTS_DESCRIPTION),
      isDefault: z
        .boolean()
        .optional()
        .describe("Whether this is the default tax rate."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-rates");

        const { taxRateId, components, ...rest } = params;

        const existing = await db.query.taxRate.findFirst({
          where: and(
            eq(taxRate.id, taxRateId),
            eq(taxRate.organizationId, ctx.organizationId),
            notDeleted(taxRate.deletedAt)
          ),
        });
        if (!existing) throw new Error("Tax rate not found");

        const updated = await db.transaction(async (tx) => {
          // An org can only have one default tax rate. If this one is being
          // made the default, clear the flag on every OTHER rate in the org.
          if (rest.isDefault) {
            await tx
              .update(taxRate)
              .set({ isDefault: false })
              .where(
                and(
                  eq(taxRate.organizationId, ctx.organizationId),
                  eq(taxRate.isDefault, true),
                  ne(taxRate.id, taxRateId)
                )
              );
          }

          let row = existing;
          if (Object.keys(rest).length > 0) {
            [row] = await tx
              .update(taxRate)
              .set(rest)
              .where(eq(taxRate.id, taxRateId))
              .returning();
          }

          if (components) {
            await tx
              .delete(taxComponent)
              .where(eq(taxComponent.taxRateId, taxRateId));
            if (components.length > 0) {
              await tx.insert(taxComponent).values(
                components.map((c) => ({
                  taxRateId,
                  name: c.name,
                  rate: c.rate,
                  accountId: c.accountId ?? null,
                }))
              );
            }
          }

          return row;
        });

        return { taxRate: updated };
      })
  );

  server.tool(
    "file_vat_return",
    "File an open VAT return period. Computes the box figures on the chosen basis (defaults to the org's vatScheme: 'accrual' or 'cash'), FREEZES them into the period's return lines (boxes 1-5, 8, 9) so the filed numbers are auditable and do not drift if entries are later backdated into the period, and posts the VAT-return clearing journal entry against those SAME figures — zeroing the period's Output VAT (2200, box 1) and Input VAT (1500, box 4) control-account balances and booking the net to the VAT Suspense / return-clearing account (2240): credit suspense when net is payable to the authority, debit when it's a refund. Marks the period filed (only an open period can be filed). Returns the clearing journalEntryId, the basis used, the net amount in integer cents (positive = payable to authority, negative = refund), and the frozen box lines. All amounts are in integer cents.",
    {
      taxPeriodId: z
        .string()
        .describe("UUID of the open tax period to file"),
      filedReference: z
        .string()
        .optional()
        .describe("Optional filing reference number from the tax authority"),
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
          taxPeriodId: params.taxPeriodId,
          status: result.updated.status ?? "filed",
          clearingJournalEntryId: result.clearing?.entry.id ?? null,
          net: result.clearing?.net ?? 0,
          outputVat: result.clearing?.outputBalance ?? 0,
          inputVat: result.clearing?.inputBalance ?? 0,
          basis,
          filedLines: result.lines,
        };
      })
  );

  server.tool(
    "record_vat_settlement",
    "Record the cash settlement of a VAT return against the VAT Suspense / return-clearing account (2240). Payment to authority (isRefund=false): DR VAT Suspense 2240, CR the bank GL account. Refund from authority (isRefund=true): DR the bank GL account, CR VAT Suspense 2240. Amount is in integer cents and must be positive. Returns the settlement journalEntryId.",
    {
      bankGlAccountId: z
        .string()
        .describe("UUID of the bank/cash ledger (chart) account the VAT is paid from or received into"),
      amount: z
        .number()
        .int()
        .positive()
        .describe("Settlement amount in integer cents (positive); e.g. $1,234.50 = 123450"),
      isRefund: z
        .boolean()
        .describe("true if this is a refund received from the authority; false if it is a payment to the authority"),
      date: z
        .string()
        .optional()
        .describe("Settlement date in YYYY-MM-DD; defaults to today"),
      reference: z
        .string()
        .optional()
        .describe("Optional reference/memo for the settlement entry"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");

        const bankAccount = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, params.bankGlAccountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });
        if (!bankAccount) throw new Error("Bank ledger account not found");

        const entry = await db.transaction(async (tx) =>
          recordTaxSettlementJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              bankGlAccountId: params.bankGlAccountId,
              amount: params.amount,
              date: params.date || new Date().toISOString().slice(0, 10),
              reference: params.reference,
              isRefund: params.isRefund,
            },
            tx
          )
        );

        return {
          settlementJournalEntryId: entry?.id ?? null,
          amount: params.amount,
          isRefund: params.isRefund,
        };
      })
  );

  server.tool(
    "send_credit_note",
    "Send a draft customer credit note. Posts the reversing journal entry (DR Revenue, DR Output VAT, CR Accounts Receivable) so the credit note reverses revenue and output VAT, marks it sent, and sets amountRemaining to the full total. Amounts are in integer cents. Returns the updated credit note and its journalEntryId.",
    {
      creditNoteId: z
        .string()
        .describe("UUID of the draft credit note to send"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:credit-notes");

        const found = await db.query.creditNote.findFirst({
          where: and(
            eq(creditNote.id, params.creditNoteId),
            eq(creditNote.organizationId, ctx.organizationId),
            notDeleted(creditNote.deletedAt)
          ),
          with: { lines: true },
        });
        if (!found) throw new Error("Credit note not found");
        if (found.status !== "draft") {
          throw new Error("Only draft credit notes can be sent");
        }

        await assertNotLocked(ctx.organizationId, found.issueDate);

        // Post the reversing JE + the status/journalEntryId update in ONE
        // transaction so a mid-post failure can't leave an orphaned journal
        // entry or a sent credit note with no GL.
        const { updated, entry } = await db.transaction(async (tx) => {
          const e = await createCreditNoteJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              creditNoteNumber: found.creditNoteNumber,
              total: found.total,
              taxTotal: found.taxTotal,
              lines: found.lines.map((l) => ({
                accountId: l.accountId,
                amount: l.amount,
                taxAmount: l.taxAmount,
              })),
              date: found.issueDate,
              currencyCode: found.currencyCode,
            },
            tx
          );

          const [row] = await tx
            .update(creditNote)
            .set({
              status: "sent",
              sentAt: new Date(),
              amountRemaining: found.total,
              journalEntryId: e?.id || null,
              updatedAt: new Date(),
            })
            .where(eq(creditNote.id, params.creditNoteId))
            .returning();
          return { updated: row, entry: e };
        });

        return {
          creditNote: updated,
          journalEntryId: entry?.id ?? null,
        };
      })
  );
}
