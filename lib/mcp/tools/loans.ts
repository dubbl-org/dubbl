import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  loan,
  loanSchedule,
  journalEntry,
  journalLine,
  bankAccount,
} from "@/lib/db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import {
  calculatePMT,
  generateAmortizationSchedule,
} from "@/lib/api/amortization";
import { getNextEntryNumber } from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for loans and their amortization schedules.
 *
 * All monetary amounts — in INPUTS and RESULTS — are integer minor units
 * (cents). The REST route accepts a decimal-dollar principal and multiplies it
 * to cents (decimalToCents); these tools instead ACCEPT integer cents directly
 * and store them as-is. Direct DB access via Drizzle (no HTTP self-calls);
 * everything is org-scoped via ctx.organizationId.
 */
export function registerLoanTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_loans",
    "List loans for the organization, newest first. Optionally filter by status. Amounts (principalAmount, monthlyPayment) are in integer cents; interestRate is in basis points (500 = 5%). Returns the loans (with linked bank/principal/interest accounts) and a total count.",
    {
      status: z
        .enum(["active", "paid_off", "defaulted"])
        .optional()
        .describe("Filter by loan status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of loans to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(loan.organizationId, ctx.organizationId),
          notDeleted(loan.deletedAt),
        ];
        if (params.status) conditions.push(eq(loan.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const loans = await db.query.loan.findMany({
          where: and(...conditions),
          orderBy: desc(loan.createdAt),
          limit: params.limit,
          offset,
          with: {
            bankAccount: true,
            principalAccount: true,
            interestAccount: true,
          },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(loan)
          .where(and(...conditions));

        return { loans, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_loan",
    "Get a single loan by ID, including its full amortization schedule (period entries ordered by sort order). Amounts (principalAmount, monthlyPayment, and each schedule entry's principalAmount/interestAmount/totalPayment/remainingBalance) are in integer cents; interestRate is in basis points. Each schedule entry shows whether it has been posted and its journal entry id.",
    {
      loanId: z.string().describe("The UUID of the loan"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.loan.findFirst({
          where: and(
            eq(loan.id, params.loanId),
            eq(loan.organizationId, ctx.organizationId),
            notDeleted(loan.deletedAt)
          ),
          with: {
            bankAccount: true,
            principalAccount: true,
            interestAccount: true,
          },
        });
        if (!found) throw new Error("Loan not found");

        const schedule = await db.query.loanSchedule.findMany({
          where: eq(loanSchedule.loanId, params.loanId),
          orderBy: asc(loanSchedule.sortOrder),
        });

        return { loan: found, schedule };
      })
  );

  server.tool(
    "create_loan",
    "Create a loan and generate its full amortization schedule. principalAmount is in INTEGER CENTS (e.g. 1000000 = $10,000.00) and is stored as-is. interestRate is the annual rate in basis points (500 = 5%). The monthly payment (PMT) and each period's principal/interest split are computed and persisted using the same amortization helper the REST route uses. The schedule starts one month after startDate. Returns the created loan and its generated schedule (all amounts in integer cents).",
    {
      name: z.string().min(1).describe("Loan name/label"),
      bankAccountId: z
        .string()
        .optional()
        .describe(
          "Bank account UUID the loan is repaid from (credited when posting payments); optional at creation"
        ),
      principalAmount: z
        .number()
        .int()
        .positive()
        .describe("Loan principal in integer cents (stored as-is, NOT multiplied)"),
      interestRate: z
        .number()
        .int()
        .min(0)
        .describe("Annual interest rate in basis points (500 = 5%)"),
      termMonths: z
        .number()
        .int()
        .positive()
        .describe("Loan term in number of months"),
      startDate: z
        .string()
        .min(1)
        .describe("Loan start date (YYYY-MM-DD); first payment is one month later"),
      principalAccountId: z
        .string()
        .min(1)
        .describe("Chart-account UUID of the loan liability account (debited for principal)"),
      interestAccountId: z
        .string()
        .min(1)
        .describe("Chart-account UUID of the interest expense account (debited for interest)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const principalCents = params.principalAmount;
        const monthlyPayment = calculatePMT(
          principalCents,
          params.interestRate,
          params.termMonths
        );
        if (monthlyPayment <= 0) throw new Error("Invalid loan parameters");

        const [created] = await db
          .insert(loan)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            bankAccountId: params.bankAccountId || null,
            principalAmount: principalCents,
            interestRate: params.interestRate,
            termMonths: params.termMonths,
            startDate: params.startDate,
            monthlyPayment,
            principalAccountId: params.principalAccountId,
            interestAccountId: params.interestAccountId,
          })
          .returning();

        const schedule = generateAmortizationSchedule(
          principalCents,
          params.interestRate,
          params.termMonths,
          params.startDate
        );

        await db.insert(loanSchedule).values(
          schedule.map((entry) => ({
            loanId: created.id,
            periodNumber: entry.periodNumber,
            date: entry.date,
            principalAmount: entry.principalAmount,
            interestAmount: entry.interestAmount,
            totalPayment: entry.totalPayment,
            remainingBalance: entry.remainingBalance,
            sortOrder: entry.periodNumber,
          }))
        );

        return { loan: created, schedule };
      })
  );

  server.tool(
    "post_loan_payment",
    "Post the next unposted scheduled loan payment to the ledger. Posts DR principal account (reduces the loan liability) + DR interest account (interest expense) / CR the loan's bank ledger account (cash out) for that period's amounts (all in integer cents). Marks the schedule entry posted and links it to the journal entry; when the final entry is posted the loan status becomes 'paid_off'. The loan must be active, have principal/interest accounts configured, and have a bank account selected. Returns the posted schedule entry, the journal entry, and the resulting loan status.",
    {
      loanId: z.string().describe("The UUID of the loan to post the next payment for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const found = await db.query.loan.findFirst({
          where: and(
            eq(loan.id, params.loanId),
            eq(loan.organizationId, ctx.organizationId),
            notDeleted(loan.deletedAt)
          ),
        });
        if (!found) throw new Error("Loan not found");
        if (found.status !== "active") throw new Error("Loan is not active");
        if (!found.principalAccountId || !found.interestAccountId)
          throw new Error(
            "Loan is missing principal or interest account configuration"
          );

        const nextEntry = await db.query.loanSchedule.findFirst({
          where: and(
            eq(loanSchedule.loanId, params.loanId),
            eq(loanSchedule.posted, false)
          ),
          orderBy: asc(loanSchedule.sortOrder),
        });
        if (!nextEntry) throw new Error("No unposted schedule entries remaining");

        // Determine the bank account for the credit side. When one is selected,
        // connect it to its ledger account automatically (older accounts
        // self-heal) so posting never dead-ends; only error when none is chosen.
        let creditAccountId: string | null = null;
        if (found.bankAccountId) {
          const bank = await db.query.bankAccount.findFirst({
            where: eq(bankAccount.id, found.bankAccountId),
          });
          if (bank) {
            creditAccountId = await ensureBankLedgerAccount(
              ctx.organizationId,
              bank
            );
          }
        }
        if (!creditAccountId)
          throw new Error(
            "Select the bank account this loan is repaid from before posting a payment"
          );

        const today = new Date().toISOString().slice(0, 10);

        const result = await db.transaction(async (tx) => {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [je] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: nextEntry.date || today,
              description: `Loan payment #${nextEntry.periodNumber} for ${found.name}`,
              reference: `LOAN-${found.name}-${nextEntry.periodNumber}`,
              status: "posted",
              sourceType: "loan",
              sourceId: found.id,
              createdBy: ctx.userId,
              postedAt: new Date(),
            })
            .returning();

          // DR principal account (liability - reduces the loan balance)
          // DR interest account (expense - interest cost)
          // CR bank account (asset - cash going out)
          const lines: (typeof journalLine.$inferInsert)[] = [];
          if (nextEntry.principalAmount > 0) {
            lines.push({
              journalEntryId: je.id,
              accountId: found.principalAccountId!,
              description: `Loan principal payment #${nextEntry.periodNumber}`,
              debitAmount: nextEntry.principalAmount,
              creditAmount: 0,
            });
          }
          if (nextEntry.interestAmount > 0) {
            lines.push({
              journalEntryId: je.id,
              accountId: found.interestAccountId!,
              description: `Loan interest payment #${nextEntry.periodNumber}`,
              debitAmount: nextEntry.interestAmount,
              creditAmount: 0,
            });
          }
          lines.push({
            journalEntryId: je.id,
            accountId: creditAccountId!,
            description: `Loan payment #${nextEntry.periodNumber} - ${found.name}`,
            debitAmount: 0,
            creditAmount: nextEntry.totalPayment,
          });
          await tx.insert(journalLine).values(lines);

          await tx
            .update(loanSchedule)
            .set({ posted: true, journalEntryId: je.id })
            .where(eq(loanSchedule.id, nextEntry.id));

          const remainingUnposted = await tx.query.loanSchedule.findFirst({
            where: and(
              eq(loanSchedule.loanId, params.loanId),
              eq(loanSchedule.posted, false)
            ),
          });
          if (!remainingUnposted) {
            await tx
              .update(loan)
              .set({ status: "paid_off", updatedAt: new Date() })
              .where(eq(loan.id, params.loanId));
          }

          return {
            entry: { ...nextEntry, posted: true, journalEntryId: je.id },
            journalEntry: je,
            loanStatus: remainingUnposted ? "active" : "paid_off",
          };
        });

        return result;
      })
  );

  server.tool(
    "update_loan",
    "Update a loan's name and/or status. Status may be 'active', 'paid_off', or 'defaulted'. Does not regenerate the amortization schedule or post anything to the ledger. Returns the updated loan.",
    {
      loanId: z.string().describe("The UUID of the loan to update"),
      name: z.string().min(1).optional().describe("New loan name/label"),
      status: z
        .enum(["active", "paid_off", "defaulted"])
        .optional()
        .describe("New loan status"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const existing = await db.query.loan.findFirst({
          where: and(
            eq(loan.id, params.loanId),
            eq(loan.organizationId, ctx.organizationId),
            notDeleted(loan.deletedAt)
          ),
        });
        if (!existing) throw new Error("Loan not found");

        const updates: { name?: string; status?: "active" | "paid_off" | "defaulted" } = {};
        if (params.name !== undefined) updates.name = params.name;
        if (params.status !== undefined) updates.status = params.status;

        const [updated] = await db
          .update(loan)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(loan.id, params.loanId))
          .returning();

        return { loan: updated };
      })
  );
}
