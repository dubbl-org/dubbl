import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { assertNotLocked } from "@/lib/api/period-lock";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerEntryTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_entries",
    "List journal entries with optional filters. Returns entries with total debit amount. Amounts are in integer cents.",
    {
      status: z
        .enum(["draft", "posted", "void"])
        .optional()
        .describe("Filter by entry status"),
      startDate: z
        .string()
        .optional()
        .describe("Start date filter (YYYY-MM-DD)"),
      endDate: z
        .string()
        .optional()
        .describe("End date filter (YYYY-MM-DD)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of entries to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(journalEntry.organizationId, ctx.organizationId),
          isNull(journalEntry.deletedAt),
        ];

        if (params.status) {
          conditions.push(eq(journalEntry.status, params.status));
        }
        if (params.startDate) {
          conditions.push(gte(journalEntry.date, params.startDate));
        }
        if (params.endDate) {
          conditions.push(lte(journalEntry.date, params.endDate));
        }

        const offset = (params.page - 1) * params.limit;

        const entries = await db.query.journalEntry.findMany({
          where: and(...conditions),
          orderBy: desc(journalEntry.createdAt),
          limit: params.limit,
          offset,
          with: { lines: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(journalEntry)
          .where(and(...conditions));

        const result = entries.map((e) => {
          const totalDebit = e.lines.reduce(
            (sum, l) => sum + l.debitAmount,
            0
          );
          return {
            id: e.id,
            entryNumber: e.entryNumber,
            date: e.date,
            description: e.description,
            reference: e.reference,
            status: e.status,
            totalDebit,
            createdAt: e.createdAt,
          };
        });

        return {
          entries: result,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_entry",
    "Get a single journal entry by ID with all its line items. Line amounts are in integer cents. Exchange rate is stored as integer with 6 decimal places (1000000 = 1.0).",
    {
      entryId: z.string().describe("The UUID of the journal entry"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const entry = await db.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.id, params.entryId),
            eq(journalEntry.organizationId, ctx.organizationId)
          ),
          with: {
            lines: {
              with: { account: true },
            },
          },
        });

        if (!entry) throw new Error("Entry not found");

        return {
          entry: {
            ...entry,
            lines: entry.lines.map((l) => ({
              id: l.id,
              accountId: l.accountId,
              accountCode: l.account?.code ?? "",
              accountName: l.account?.name ?? "",
              description: l.description,
              debitAmount: l.debitAmount,
              creditAmount: l.creditAmount,
              currencyCode: l.currencyCode,
              exchangeRate: l.exchangeRate,
            })),
          },
        };
      })
  );

  server.tool(
    "create_entry",
    "Create a new journal entry. Total debits must equal total credits. All amounts must be in integer cents (e.g. $12.50 = 1250). Minimum 2 lines required.",
    {
      date: z.string().describe("Entry date (YYYY-MM-DD)"),
      description: z.string().describe("Entry description/memo"),
      reference: z
        .string()
        .optional()
        .describe("External reference number"),
      lines: z
        .array(
          z.object({
            accountId: z.string().describe("Account UUID"),
            description: z
              .string()
              .optional()
              .describe("Line description"),
            debitAmount: z
              .number()
              .int()
              .min(0)
              .default(0)
              .describe("Debit amount in cents"),
            creditAmount: z
              .number()
              .int()
              .min(0)
              .default(0)
              .describe("Credit amount in cents"),
            currencyCode: z
              .string()
              .optional()
              .default("USD")
              .describe("Currency code"),
            exchangeRate: z
              .number()
              .int()
              .optional()
              .default(1000000)
              .describe(
                "Exchange rate as integer (1000000 = 1.0)"
              ),
          })
        )
        .min(2)
        .describe("Journal lines (min 2)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "create:entries");

        await assertNotLocked(ctx.organizationId, params.date);

        const totalDebit = params.lines.reduce(
          (sum, l) => sum + l.debitAmount,
          0
        );
        const totalCredit = params.lines.reduce(
          (sum, l) => sum + l.creditAmount,
          0
        );
        if (totalDebit !== totalCredit) {
          throw new Error("Debits must equal credits");
        }
        if (totalDebit === 0) {
          throw new Error("Entry must have non-zero amounts");
        }

        const [maxResult] = await db
          .select({
            max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
          })
          .from(journalEntry)
          .where(eq(journalEntry.organizationId, ctx.organizationId));

        const entryNumber = (maxResult?.max || 0) + 1;

        const [entry] = await db
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: params.date,
            description: params.description,
            reference: params.reference ?? null,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(journalLine).values(
          params.lines.map((l) => ({
            journalEntryId: entry.id,
            accountId: l.accountId,
            description: l.description ?? null,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            currencyCode: l.currencyCode ?? "USD",
            exchangeRate: l.exchangeRate ?? 1000000,
          }))
        );

        return { entry };
      })
  );

  server.tool(
    "post_entry",
    "Post a draft journal entry to make it final. Only draft entries can be posted. Posted entries affect account balances.",
    {
      entryId: z.string().describe("The UUID of the draft entry to post"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "post:entries");

        const entry = await db.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.id, params.entryId),
            eq(journalEntry.organizationId, ctx.organizationId)
          ),
        });

        if (!entry) throw new Error("Entry not found");
        if (entry.status !== "draft") {
          throw new Error("Only draft entries can be posted");
        }

        const [updated] = await db
          .update(journalEntry)
          .set({
            status: "posted",
            postedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(journalEntry.id, params.entryId))
          .returning();

        return { entry: updated };
      })
  );

  server.tool(
    "void_entry",
    "Void a posted journal entry by creating a reversing entry. The original entry is marked as void and a new entry with reversed debits/credits is created.",
    {
      entryId: z
        .string()
        .describe("The UUID of the posted entry to void"),
      reason: z.string().describe("Reason for voiding"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "void:entries");

        const entry = await db.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.id, params.entryId),
            eq(journalEntry.organizationId, ctx.organizationId)
          ),
          with: { lines: true },
        });

        if (!entry) throw new Error("Entry not found");
        if (entry.status !== "posted") {
          throw new Error("Only posted entries can be voided");
        }

        // Mark original as void
        await db
          .update(journalEntry)
          .set({
            status: "void",
            voidedAt: new Date(),
            voidReason: params.reason,
            updatedAt: new Date(),
          })
          .where(eq(journalEntry.id, params.entryId));

        // Create reversing entry
        const [maxResult] = await db
          .select({
            max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
          })
          .from(journalEntry)
          .where(eq(journalEntry.organizationId, ctx.organizationId));

        const entryNumber = (maxResult?.max || 0) + 1;

        const [reversal] = await db
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: new Date().toISOString().slice(0, 10),
            description: `Reversal of entry #${entry.entryNumber}: ${params.reason}`,
            reference: `VOID-${entry.entryNumber}`,
            status: "posted",
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(journalLine).values(
          entry.lines.map((l) => ({
            journalEntryId: reversal.id,
            accountId: l.accountId,
            description: l.description,
            debitAmount: l.creditAmount,
            creditAmount: l.debitAmount,
            currencyCode: l.currencyCode,
            exchangeRate: l.exchangeRate,
          }))
        );

        return { voidedEntry: params.entryId, reversalEntry: reversal };
      })
  );
}
