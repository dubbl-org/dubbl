import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  chartAccount,
  taxRate,
  taxComponent,
} from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { notDeleted } from "@/lib/db/soft-delete";
import { recordTaxSettlementJournalEntry } from "@/lib/api/journal-automation";
import { fileTaxPeriod } from "@/lib/reports/tax-filing";
import { compoundRate } from "@/lib/tax/compound";
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
  "When components are given, the tax rate becomes the sum of their rates, and each line's tax is split between them by rate when invoices, bills, credit and debit notes post: a component with an accountId posts its share to that account, the rest goes to the default tax account (Output VAT 2200 on sales, Input VAT 1500 on purchases). " +
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
        // A compound rate charges the sum of its parts (mirrors the REST route).
        if (components && components.length > 0) values.rate = compoundRate(components);

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
        // A compound rate charges the sum of its parts (mirrors the REST route).
        if (components && components.length > 0) rest.rate = compoundRate(components);

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
    "File an open VAT/GST tax period. Computes the return on the chosen basis (defaults to the org's vatScheme: 'accrual' recognises VAT on the document date; 'cash' recognises invoices and bills pro rata to the payments made in the period), FREEZES the figures into the period's return lines (all nine VAT boxes 1-9, Box 2 reverse-charge VAT included; or the BAS fields G1, G2, G3, G10, G11, 1A, 1B and NET for an Australian organization) so the filed numbers are auditable and do not drift if entries are later backdated into the period, and posts the VAT-return clearing journal entry against those SAME figures: debits Output VAT (2200) by Box 3 / 1A, credits Input VAT (1500) by Box 4 / 1B, and books the net to the VAT Suspense / return-clearing account (2240): credit when payable to the authority, debit when it's a refund. On the cash basis VAT on unpaid invoices and bills stays in 2200/1500 for the period it is paid in. Marks the period filed (only an open period can be filed). Returns the clearing journalEntryId, the basis used, the net amount in integer cents (positive = payable to authority, negative = refund), the output/input VAT cleared in integer cents, and the frozen lines. All amounts are in integer cents.",
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
        .describe("Optional flat-rate percentage in basis points (1450 = 14.50%) for the UK flat-rate scheme. When supplied, Box 1 is frozen as that percentage of VAT-inclusive turnover, Box 4 as 0, and nothing is cleared from 2200/1500."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");

        // Shared with the REST file route (app/api/v1/tax-periods/[id]/file),
        // so the frozen figures match the live VAT return / BAS report.
        const filed = await fileTaxPeriod(ctx, params.taxPeriodId, {
          basis: params.basis,
          flatRatePercent: params.flatRatePercent ?? null,
          filedReference: params.filedReference ?? null,
        });

        return {
          taxPeriodId: params.taxPeriodId,
          status: filed.taxPeriod.status ?? "filed",
          clearingJournalEntryId: filed.clearingJournalEntryId,
          net: filed.net,
          outputVat: filed.outputVat,
          inputVat: filed.inputVat,
          basis: filed.basis,
          filedLines: filed.filedLines,
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
}
