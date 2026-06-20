import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { assertNotLocked } from "@/lib/api/period-lock";
import { reverseJournalEntry } from "@/lib/api/journal-automation";
import { wrapTool } from "@/lib/mcp/errors";
import { checkMonthlyLimit } from "@/lib/api/check-limit";
import { logAudit } from "@/lib/api/audit";
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
      autoReverseDate: z
        .string()
        .optional()
        .describe(
          "Optional auto-reverse date (YYYY-MM-DD). If set, a scheduled job posts a mirror reversing entry on this date (for accruals/prepayments). Must be on or after the entry date."
        ),
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
        await checkMonthlyLimit(ctx.organizationId, journalEntry, journalEntry.organizationId, journalEntry.createdAt, "entriesPerMonth");

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
        if (params.autoReverseDate && params.autoReverseDate < params.date) {
          throw new Error(
            "Auto-reverse date must be on or after the entry date"
          );
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
            autoReverseDate: params.autoReverseDate ?? null,
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
    "Reverse a posted journal entry. Posts a mirror entry (debits/credits swapped) dated the original entry's date and marks the original as reversed; both stay posted so the pair nets to zero in reports and the audit trail is preserved. Blocked if the period is locked or the entry was already reversed.",
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
        if (entry.reversedByEntryId) {
          throw new Error("This entry has already been reversed");
        }
        // The reversal posts on the original entry's date — block locked/closed
        // periods.
        await assertNotLocked(ctx.organizationId, entry.date, ctx);

        // Post a reversing entry and mark the original "reversed", keeping BOTH
        // posted so the pair nets to zero in reports. (Previously this voided the
        // original AND added a reversal — double-counting, since reports drop
        // the void but keep the reversal, leaving a net -original.)
        const reversal = await db.transaction(async (tx) => {
          const rev = await reverseJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              entryId: params.entryId,
              date: entry.date,
              description: `Reversal of entry #${entry.entryNumber}: ${params.reason}`,
              reference: `VOID-${entry.entryNumber}`,
              sourceType: "manual_reversal",
              sourceId: entry.id,
            },
            tx
          );
          await tx
            .update(journalEntry)
            .set({ voidedAt: new Date(), voidReason: params.reason, updatedAt: new Date() })
            .where(eq(journalEntry.id, params.entryId));
          return rev;
        });

        return { reversedEntry: params.entryId, reversalEntry: reversal };
      })
  );

  server.tool(
    "update_entry",
    "Edit a DRAFT journal entry — full header + line replace. Posted entries cannot be edited (void and re-create instead). Total debits must equal total credits. Amounts in integer cents. Fails if the entry's old or new date is in a locked period.",
    {
      entryId: z.string().describe("The UUID of the draft entry to edit"),
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
              .describe("Exchange rate as integer (1000000 = 1.0)"),
            costCenterId: z
              .string()
              .optional()
              .describe("Cost center UUID for this line"),
            projectId: z
              .string()
              .optional()
              .describe("Project UUID for this line"),
          })
        )
        .min(2)
        .describe("Replacement journal lines (min 2)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "edit:entries");

        const existing = await db.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.id, params.entryId),
            eq(journalEntry.organizationId, ctx.organizationId)
          ),
        });

        if (!existing) throw new Error("Entry not found");
        if (existing.status !== "draft") {
          throw new Error(
            "Only draft entries can be edited. Void the posted entry and create a new one to make changes."
          );
        }

        await assertNotLocked(ctx.organizationId, existing.date);
        if (params.date !== existing.date) {
          await assertNotLocked(ctx.organizationId, params.date);
        }

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

        const updated = await db.transaction(async (tx) => {
          const [entry] = await tx
            .update(journalEntry)
            .set({
              date: params.date,
              description: params.description,
              reference: params.reference ?? null,
              updatedAt: new Date(),
            })
            .where(eq(journalEntry.id, params.entryId))
            .returning();

          await tx
            .delete(journalLine)
            .where(eq(journalLine.journalEntryId, params.entryId));
          await tx.insert(journalLine).values(
            params.lines.map((l) => ({
              journalEntryId: params.entryId,
              accountId: l.accountId,
              description: l.description ?? null,
              debitAmount: l.debitAmount,
              creditAmount: l.creditAmount,
              currencyCode: l.currencyCode ?? "USD",
              exchangeRate: l.exchangeRate ?? 1000000,
              costCenterId: l.costCenterId ?? null,
              projectId: l.projectId ?? null,
            }))
          );

          return entry;
        });

        await logAudit({
          ctx,
          action: "update",
          entityType: "journal_entry",
          entityId: params.entryId,
          changes: {
            diff: {
              date:
                existing.date !== params.date
                  ? { from: existing.date, to: params.date }
                  : undefined,
              description:
                existing.description !== params.description
                  ? { from: existing.description, to: params.description }
                  : undefined,
              lines: { replaced: params.lines.length },
            },
          },
        });

        return { entry: updated };
      })
  );

  server.tool(
    "set_auto_reverse_date",
    "Set or clear the auto-reverse date on a journal entry. When set, a scheduled job posts a mirror reversing entry on that date (accruals/prepayments). Pass autoReverseDate=null to clear it. The date must be on or after the entry's own date.",
    {
      entryId: z.string().describe("The UUID of the journal entry"),
      autoReverseDate: z
        .string()
        .nullable()
        .describe(
          "Auto-reverse date (YYYY-MM-DD), or null to clear. Must be on or after the entry date."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "edit:entries");

        const entry = await db.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.id, params.entryId),
            eq(journalEntry.organizationId, ctx.organizationId)
          ),
        });

        if (!entry) throw new Error("Entry not found");
        if (entry.reversedByEntryId) {
          throw new Error(
            "Entry has already been auto-reversed; cannot change its auto-reverse date."
          );
        }
        if (
          params.autoReverseDate &&
          params.autoReverseDate < entry.date
        ) {
          throw new Error(
            "Auto-reverse date must be on or after the entry date"
          );
        }

        const [updated] = await db
          .update(journalEntry)
          .set({
            autoReverseDate: params.autoReverseDate,
            updatedAt: new Date(),
          })
          .where(eq(journalEntry.id, params.entryId))
          .returning();

        await logAudit({
          ctx,
          action: "update",
          entityType: "journal_entry",
          entityId: params.entryId,
          changes: {
            diff: {
              autoReverseDate: {
                from: entry.autoReverseDate,
                to: params.autoReverseDate,
              },
            },
          },
        });

        return { entry: updated };
      })
  );

  server.tool(
    "recode_entries",
    "Bulk reclassify journal lines. Select lines by filter (date range, accountId, sourceType, costCenterId, projectId) and repoint one dimension on each matching line to a target (accountId, costCenterId, or projectId). Entries stay balanced (each line moves wholesale). Honors the period lock per affected date. Journal lines have no per-line tax rate, so tax can't be recoded here.",
    {
      filter: z
        .object({
          startDate: z
            .string()
            .optional()
            .describe("Start date filter (YYYY-MM-DD)"),
          endDate: z
            .string()
            .optional()
            .describe("End date filter (YYYY-MM-DD)"),
          accountId: z
            .string()
            .optional()
            .describe("Only lines currently coded to this account"),
          sourceType: z
            .string()
            .optional()
            .describe("Only entries with this source type (e.g. 'manual')"),
          costCenterId: z
            .string()
            .optional()
            .describe("Only lines with this cost center"),
          projectId: z
            .string()
            .optional()
            .describe("Only lines with this project"),
        })
        .describe("Filter selecting which lines to recode (at least one field)"),
      target: z
        .object({
          accountId: z
            .string()
            .optional()
            .describe("Move matching lines to this account"),
          costCenterId: z
            .string()
            .nullable()
            .optional()
            .describe("Set matching lines' cost center (null to clear)"),
          projectId: z
            .string()
            .nullable()
            .optional()
            .describe("Set matching lines' project (null to clear)"),
        })
        .describe("Target dimension to set on matching lines (at least one)"),
      draftOnly: z
        .boolean()
        .optional()
        .default(true)
        .describe("Defaults true (draft entries only) so posted, already-reported lines aren't silently rewritten. Pass false to deliberately include posted entries."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "edit:entries");

        const { filter, target, draftOnly } = params;
        const hasFilter =
          filter.startDate ||
          filter.endDate ||
          filter.accountId ||
          filter.sourceType ||
          filter.costCenterId ||
          filter.projectId;
        if (!hasFilter) {
          throw new Error("At least one filter is required to scope the recode");
        }
        const hasTarget =
          target.accountId !== undefined ||
          target.costCenterId !== undefined ||
          target.projectId !== undefined;
        if (!hasTarget) {
          throw new Error(
            "A target dimension (accountId, costCenterId, or projectId) is required"
          );
        }

        const conditions = [eq(journalEntry.organizationId, ctx.organizationId)];
        if (filter.startDate)
          conditions.push(gte(journalEntry.date, filter.startDate));
        if (filter.endDate)
          conditions.push(lte(journalEntry.date, filter.endDate));
        if (filter.sourceType)
          conditions.push(eq(journalEntry.sourceType, filter.sourceType));
        if (draftOnly) conditions.push(eq(journalEntry.status, "draft"));
        if (filter.accountId)
          conditions.push(eq(journalLine.accountId, filter.accountId));
        if (filter.costCenterId)
          conditions.push(eq(journalLine.costCenterId, filter.costCenterId));
        if (filter.projectId)
          conditions.push(eq(journalLine.projectId, filter.projectId));

        const rows = await db
          .select({
            lineId: journalLine.id,
            entryId: journalEntry.id,
            entryNumber: journalEntry.entryNumber,
            date: journalEntry.date,
            accountId: journalLine.accountId,
            costCenterId: journalLine.costCenterId,
            projectId: journalLine.projectId,
          })
          .from(journalLine)
          .innerJoin(
            journalEntry,
            eq(journalLine.journalEntryId, journalEntry.id)
          )
          .where(and(...conditions));

        if (rows.length === 0) {
          return { recoded: 0, entriesAffected: 0 };
        }

        const dates = [...new Set(rows.map((r) => r.date))];
        for (const d of dates) {
          await assertNotLocked(ctx.organizationId, d);
        }

        const patch: {
          accountId?: string;
          costCenterId?: string | null;
          projectId?: string | null;
        } = {};
        if (target.accountId !== undefined) patch.accountId = target.accountId;
        if (target.costCenterId !== undefined)
          patch.costCenterId = target.costCenterId;
        if (target.projectId !== undefined) patch.projectId = target.projectId;

        const toChange = rows.filter(
          (r) =>
            (patch.accountId !== undefined && patch.accountId !== r.accountId) ||
            (patch.costCenterId !== undefined &&
              patch.costCenterId !== r.costCenterId) ||
            (patch.projectId !== undefined && patch.projectId !== r.projectId)
        );

        if (toChange.length === 0) {
          return { recoded: 0, entriesAffected: 0 };
        }

        await db.transaction(async (tx) => {
          for (const r of toChange) {
            await tx
              .update(journalLine)
              .set(patch)
              .where(eq(journalLine.id, r.lineId));
          }
          const entryIds = [...new Set(toChange.map((r) => r.entryId))];
          for (const entryId of entryIds) {
            await tx
              .update(journalEntry)
              .set({ updatedAt: new Date() })
              .where(eq(journalEntry.id, entryId));
          }
        });

        for (const r of toChange) {
          const diff: Record<string, { from: unknown; to: unknown }> = {};
          if (patch.accountId !== undefined && patch.accountId !== r.accountId) {
            diff.accountId = { from: r.accountId, to: patch.accountId };
          }
          if (
            patch.costCenterId !== undefined &&
            patch.costCenterId !== r.costCenterId
          ) {
            diff.costCenterId = { from: r.costCenterId, to: patch.costCenterId };
          }
          if (
            patch.projectId !== undefined &&
            patch.projectId !== r.projectId
          ) {
            diff.projectId = { from: r.projectId, to: patch.projectId };
          }
          await logAudit({
            ctx,
            action: "recode",
            entityType: "journal_line",
            entityId: r.lineId,
            changes: { entryId: r.entryId, entryNumber: r.entryNumber, diff },
          });
        }

        return {
          recoded: toChange.length,
          entriesAffected: new Set(toChange.map((r) => r.entryId)).size,
        };
      })
  );
}
