import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { expenseClaim, expenseItem, chartAccount } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { decimalToMinorUnits } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import {
  createExpenseClaimApprovalJournalEntry,
  createExpenseClaimPaymentJournalEntry,
} from "@/lib/api/expense-claims";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for employee expense claims and their lifecycle (draft -> submitted
 * -> approved -> paid, plus recall back to draft).
 *
 * All monetary amounts — both INPUTS and RESULTS — are integer cents (e.g.
 * $12.50 = 1250). Mileage distance is miles x 100 (2 decimals) and mileageRate
 * is cents per mile, both stored as integers. Direct DB access via Drizzle (no
 * HTTP self-calls); org-scoped via the AuthContext.
 */
export function registerExpenseTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_expense_claims",
    "List employee expense claims with optional status filter and pagination. totalAmount is in integer cents. Returns the claims (with the submitter) and the total count.",
    {
      status: z
        .enum(["draft", "submitted", "approved", "rejected", "paid"])
        .optional()
        .describe("Filter by claim status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of claims to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(expenseClaim.organizationId, ctx.organizationId),
          notDeleted(expenseClaim.deletedAt),
        ];
        if (params.status) conditions.push(eq(expenseClaim.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const claims = await db.query.expenseClaim.findMany({
          where: and(...conditions),
          orderBy: desc(expenseClaim.createdAt),
          limit: params.limit,
          offset,
          with: { submittedByUser: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(expenseClaim)
          .where(and(...conditions));

        return { expenseClaims: claims, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_expense_claim",
    "Get a single expense claim by ID with its line items (incl. mileage fields), the submitter, the approver, and each item's account. totalAmount and item amounts are in integer cents; distanceMiles is miles x 100 and mileageRate is cents per mile.",
    {
      expenseClaimId: z.string().describe("The UUID of the expense claim"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.expenseClaim.findFirst({
          where: and(
            eq(expenseClaim.id, params.expenseClaimId),
            eq(expenseClaim.organizationId, ctx.organizationId),
            notDeleted(expenseClaim.deletedAt)
          ),
          with: {
            submittedByUser: true,
            approvedByUser: true,
            items: {
              with: { account: true },
              orderBy: (items, { asc }) => [asc(items.sortOrder)],
            },
          },
        });
        if (!found) throw new Error("Expense claim not found");
        return { expenseClaim: found };
      })
  );

  server.tool(
    "create_expense_claim",
    "Create a draft employee expense claim with line items. Each item amount is in integer cents (e.g. 1250 = $12.50) and is treated as tax-INCLUSIVE when a taxRateId is given (same as a categorized bank line). For mileage items set isMileage true and provide distanceMiles (miles x 100) and mileageRate (cents per mile); the amount is still required in cents. The claim currency defaults to the org's base/default currency when omitted. The total is computed from the item amounts and the claim starts in 'draft'. Returns the created claim.",
    {
      title: z.string().describe("Claim title / short summary"),
      description: z.string().optional().describe("Optional longer description"),
      currencyCode: z
        .string()
        .optional()
        .describe("Currency code; defaults to the org's base/default currency"),
      items: z
        .array(
          z.object({
            date: z.string().describe("Expense date (YYYY-MM-DD)"),
            description: z.string().describe("Line item description"),
            amount: z
              .number()
              .min(0)
              .describe("Line amount in integer cents (tax-inclusive when taxRateId is set)"),
            category: z.string().optional().describe("Optional free-text category label"),
            accountId: z
              .string()
              .optional()
              .describe("Expense chart-account UUID; falls back to Miscellaneous Expense 5990 at approval"),
            taxRateId: z.string().optional().describe("Tax rate UUID applied to this line"),
            isMileage: z
              .boolean()
              .optional()
              .describe("True if this is a mileage line; requires distanceMiles and mileageRate"),
            distanceMiles: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe("Distance in miles x 100 (2 decimals), integer; required for mileage lines"),
            mileageRate: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe("Reimbursement rate in cents per mile, integer; required for mileage lines"),
          })
        )
        .min(1)
        .describe("Expense claim line items (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:expenses");

        // Mirror the route's mileage validation: a mileage line must carry both
        // its distance and rate.
        for (const item of params.items) {
          if (item.isMileage && (item.distanceMiles == null || item.mileageRate == null)) {
            throw new Error(
              "Mileage items require both distanceMiles and mileageRate when isMileage is true"
            );
          }
        }

        // Resolve the claim currency: explicit input wins, otherwise the org's
        // base/default currency (expense claims have no contact).
        const currencyCode = await resolveDocumentCurrency(
          ctx.organizationId,
          params.currencyCode,
          undefined
        );

        // Period lock check for each item date.
        for (const item of params.items) {
          await assertNotLocked(ctx.organizationId, item.date);
        }

        let totalAmount = 0;
        const processedItems = params.items.map((item, i) => {
          const amount = decimalToMinorUnits(item.amount, currencyCode);
          totalAmount += amount;
          return {
            date: item.date,
            description: item.description,
            amount,
            category: item.category || null,
            accountId: item.accountId || null,
            taxRateId: item.taxRateId || null,
            isMileage: item.isMileage ?? false,
            distanceMiles: item.isMileage ? (item.distanceMiles ?? null) : null,
            mileageRate: item.isMileage ? (item.mileageRate ?? null) : null,
            receiptFileKey: null,
            receiptFileName: null,
            sortOrder: i,
          };
        });

        const [created] = await db
          .insert(expenseClaim)
          .values({
            organizationId: ctx.organizationId,
            title: params.title,
            description: params.description || null,
            submittedBy: ctx.userId,
            totalAmount,
            currencyCode,
          })
          .returning();

        await db.insert(expenseItem).values(
          processedItems.map((item) => ({
            expenseClaimId: created.id,
            ...item,
          }))
        );

        return { expenseClaim: created };
      })
  );

  server.tool(
    "submit_expense_claim",
    "Submit a draft (or corrected rejected) expense claim for approval. Sets status to 'submitted', records the submission time, and clears any prior rejection. Only draft or rejected claims can be submitted. Returns the updated claim.",
    {
      expenseClaimId: z.string().describe("The UUID of the expense claim to submit"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:expenses");

        const found = await db.query.expenseClaim.findFirst({
          where: and(
            eq(expenseClaim.id, params.expenseClaimId),
            eq(expenseClaim.organizationId, ctx.organizationId),
            notDeleted(expenseClaim.deletedAt)
          ),
        });
        if (!found) throw new Error("Expense claim not found");
        if (found.status !== "draft" && found.status !== "rejected") {
          throw new Error("Only draft or rejected expense claims can be submitted");
        }

        const [updated] = await db
          .update(expenseClaim)
          .set({
            status: "submitted",
            submittedAt: new Date(),
            rejectedAt: null,
            rejectionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(expenseClaim.id, params.expenseClaimId))
          .returning();

        return { expenseClaim: updated };
      })
  );

  server.tool(
    "recall_expense_claim",
    "Recall a claim that's awaiting approval back to draft so it can be edited. Only a 'submitted' claim qualifies — nothing has been posted to the ledger yet, so pulling it back is a no-op accounting-wise. Sets status to 'draft' and clears the submission time. Returns the updated claim.",
    {
      expenseClaimId: z.string().describe("The UUID of the expense claim to recall"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:expenses");

        const found = await db.query.expenseClaim.findFirst({
          where: and(
            eq(expenseClaim.id, params.expenseClaimId),
            eq(expenseClaim.organizationId, ctx.organizationId),
            notDeleted(expenseClaim.deletedAt)
          ),
        });
        if (!found) throw new Error("Expense claim not found");
        if (found.status !== "submitted") {
          throw new Error("Only a claim that's awaiting approval can be recalled");
        }

        const [updated] = await db
          .update(expenseClaim)
          .set({
            status: "draft",
            submittedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(expenseClaim.id, params.expenseClaimId))
          .returning();

        return { expenseClaim: updated };
      })
  );

  server.tool(
    "approve_expense_claim",
    "Approve a submitted expense claim. Posts the approval journal entry — DR each expense line to its account (falling back to Miscellaneous Expense 5990) / CR Employee Reimbursements Payable 2110 for the total — dated today, then flips status to 'approved' and records the approver, atomically. Only submitted claims can be approved, and today's date must not be in a locked/closed period. Returns the updated claim.",
    {
      expenseClaimId: z.string().describe("The UUID of the expense claim to approve"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:expenses");

        const found = await db.query.expenseClaim.findFirst({
          where: and(
            eq(expenseClaim.id, params.expenseClaimId),
            eq(expenseClaim.organizationId, ctx.organizationId),
            notDeleted(expenseClaim.deletedAt)
          ),
          with: {
            items: {
              with: { account: true },
            },
          },
        });
        if (!found) throw new Error("Expense claim not found");
        if (found.status !== "submitted") {
          throw new Error("Only submitted expense claims can be approved");
        }

        const approvedAt = new Date();
        await assertNotLocked(
          ctx.organizationId,
          approvedAt.toISOString().slice(0, 10),
          ctx
        );

        const updated = await db.transaction(async (tx) => {
          const entry = await createExpenseClaimApprovalJournalEntry(
            ctx,
            found,
            tx,
            approvedAt.toISOString().slice(0, 10)
          );

          const [row] = await tx
            .update(expenseClaim)
            .set({
              status: "approved",
              approvedBy: ctx.userId,
              approvedAt,
              journalEntryId: entry.id,
              updatedAt: approvedAt,
            })
            .where(eq(expenseClaim.id, params.expenseClaimId))
            .returning();
          return row;
        });

        return { expenseClaim: updated };
      })
  );

  server.tool(
    "pay_expense_claim",
    "Mark an approved expense claim as paid. Posts the payment journal entry — DR Employee Reimbursements Payable 2110 (clearing the obligation booked at approval) / CR the chosen bank account — dated `date`, then flips status to 'paid', atomically. The expense accounts are NOT re-debited (they were booked at approval). Only approved claims can be paid, the bank account must exist, and `date` must not be in a locked/closed period. Returns the updated claim.",
    {
      expenseClaimId: z.string().describe("The UUID of the expense claim to pay"),
      date: z.string().describe("Payment date (YYYY-MM-DD); the journal entry is posted on this date"),
      bankAccountCode: z
        .string()
        .optional()
        .default("1100")
        .describe("Chart-of-accounts code of the bank account the money is paid from (default '1100')"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:expenses");

        const found = await db.query.expenseClaim.findFirst({
          where: and(
            eq(expenseClaim.id, params.expenseClaimId),
            eq(expenseClaim.organizationId, ctx.organizationId),
            notDeleted(expenseClaim.deletedAt)
          ),
          with: {
            items: {
              with: { account: true },
            },
          },
        });
        if (!found) throw new Error("Expense claim not found");
        if (found.status !== "approved") {
          throw new Error("Only approved expense claims can be marked as paid");
        }

        const bankAccount = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.organizationId, ctx.organizationId),
            eq(chartAccount.code, params.bankAccountCode)
          ),
        });
        if (!bankAccount) throw new Error("Bank account not found");

        await assertNotLocked(ctx.organizationId, params.date, ctx);

        const paidAt = new Date();
        const updated = await db.transaction(async (tx) => {
          await createExpenseClaimPaymentJournalEntry(
            ctx,
            found,
            { id: bankAccount.id },
            tx,
            params.date
          );

          const [row] = await tx
            .update(expenseClaim)
            .set({
              status: "paid",
              paidAt,
              updatedAt: paidAt,
            })
            .where(eq(expenseClaim.id, params.expenseClaimId))
            .returning();
          return row;
        });

        return { expenseClaim: updated };
      })
  );
}
