import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { recurringTemplate, recurringTemplateLine } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { processRecurringJournals } from "@/lib/api/recurring-generate";
import type { AuthContext } from "@/lib/api/auth-context";

const FREQUENCIES = [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
] as const;

/**
 * MCP tools for recurring JOURNAL templates: scheduled, balanced manual journal
 * entries. The daily recurring-journals job posts one balanced, posted journal
 * entry per due occurrence (re-validating debits == credits and that the period
 * is not locked). All amounts are integer cents.
 */
export function registerRecurringJournalTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_recurring_journals",
    "List recurring journal templates for the organization. Each template posts a balanced, scheduled manual journal entry per occurrence. Returns templates with their legs (debit/credit in integer cents). Filter by status.",
    {
      status: z
        .enum(["active", "paused", "completed"])
        .optional()
        .describe("Filter by template status"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(recurringTemplate.organizationId, ctx.organizationId),
          eq(recurringTemplate.type, "journal"),
          notDeleted(recurringTemplate.deletedAt),
        ];
        if (params.status) {
          conditions.push(eq(recurringTemplate.status, params.status));
        }
        const templates = await db.query.recurringTemplate.findMany({
          where: and(...conditions),
          orderBy: desc(recurringTemplate.createdAt),
          with: { lines: true },
        });
        return { templates };
      })
  );

  server.tool(
    "get_recurring_journal",
    "Get a single recurring journal template by id, including its legs (debit/credit in integer cents) and schedule.",
    {
      templateId: z.string().describe("The UUID of the recurring journal template"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.recurringTemplate.findFirst({
          where: and(
            eq(recurringTemplate.id, params.templateId),
            eq(recurringTemplate.organizationId, ctx.organizationId),
            eq(recurringTemplate.type, "journal"),
            notDeleted(recurringTemplate.deletedAt)
          ),
          with: { lines: true },
        });
        if (!found) throw new Error("Recurring journal not found");
        return { template: found };
      })
  );

  server.tool(
    "create_recurring_journal",
    "Create a recurring journal template that posts a balanced manual journal entry on a schedule. Provide at least two legs; each leg posts debitAmount OR creditAmount (integer cents) to accountId. Total debits must equal total credits and be non-zero. The first occurrence runs on startDate.",
    {
      name: z.string().min(1).describe("Template name"),
      frequency: z
        .enum(FREQUENCIES)
        .describe("How often the entry is posted"),
      startDate: z
        .string()
        .describe("First run date (YYYY-MM-DD); also the date of the first posted entry"),
      endDate: z
        .string()
        .nullable()
        .optional()
        .describe("Optional last date (YYYY-MM-DD); null = run indefinitely"),
      maxOccurrences: z
        .number()
        .int()
        .min(1)
        .nullable()
        .optional()
        .describe("Optional cap on the number of entries posted; null = unlimited"),
      reference: z
        .string()
        .nullable()
        .optional()
        .describe("Optional reference stamped on each posted entry"),
      notes: z
        .string()
        .nullable()
        .optional()
        .describe("Optional memo; used as the posted entry description when set"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code for the posted legs (default USD)"),
      lines: z
        .array(
          z.object({
            description: z.string().min(1).describe("Leg description"),
            accountId: z.string().describe("GL account UUID for this leg"),
            debitAmount: z
              .number()
              .int()
              .min(0)
              .default(0)
              .describe("Debit amount in integer cents (0 if this is a credit leg)"),
            creditAmount: z
              .number()
              .int()
              .min(0)
              .default(0)
              .describe("Credit amount in integer cents (0 if this is a debit leg)"),
            costCenterId: z
              .string()
              .nullable()
              .optional()
              .describe("Optional cost center / department UUID"),
          })
        )
        .min(2)
        .describe("Journal legs (min 2); total debits must equal total credits"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        for (const l of params.lines) {
          if ((l.debitAmount > 0) === (l.creditAmount > 0)) {
            throw new Error(
              "Each leg must have exactly one of debitAmount or creditAmount non-zero"
            );
          }
        }
        const totalDebit = params.lines.reduce((s, l) => s + l.debitAmount, 0);
        const totalCredit = params.lines.reduce((s, l) => s + l.creditAmount, 0);
        if (totalDebit === 0) throw new Error("Journal must have non-zero amounts");
        if (totalDebit !== totalCredit) {
          throw new Error("Journal must be balanced (total debits = total credits)");
        }

        const [created] = await db
          .insert(recurringTemplate)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            type: "journal",
            contactId: null,
            frequency: params.frequency,
            startDate: params.startDate,
            endDate: params.endDate || null,
            nextRunDate: params.startDate,
            maxOccurrences: params.maxOccurrences || null,
            reference: params.reference || null,
            notes: params.notes || null,
            currencyCode: params.currencyCode ?? "USD",
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(recurringTemplateLine).values(
          params.lines.map((l, i) => ({
            templateId: created.id,
            description: l.description,
            accountId: l.accountId,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            costCenterId: l.costCenterId || null,
            sortOrder: i,
          }))
        );

        logAudit({ ctx, action: "create", entityType: "recurring_journal", entityId: created.id });
        return { template: created };
      })
  );

  server.tool(
    "set_recurring_journal_status",
    "Pause, resume (activate), or complete a recurring journal template. Paused templates are skipped by the scheduler; resuming does not back-fill missed occurrences.",
    {
      templateId: z.string().describe("The UUID of the recurring journal template"),
      status: z
        .enum(["active", "paused", "completed"])
        .describe("New status: active (resume), paused (skip), or completed (stop)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");
        const existing = await db.query.recurringTemplate.findFirst({
          where: and(
            eq(recurringTemplate.id, params.templateId),
            eq(recurringTemplate.organizationId, ctx.organizationId),
            eq(recurringTemplate.type, "journal"),
            notDeleted(recurringTemplate.deletedAt)
          ),
        });
        if (!existing) throw new Error("Recurring journal not found");

        const [updated] = await db
          .update(recurringTemplate)
          .set({ status: params.status, updatedAt: new Date() })
          .where(eq(recurringTemplate.id, params.templateId))
          .returning();

        logAudit({
          ctx,
          action: "update",
          entityType: "recurring_journal",
          entityId: params.templateId,
          changes: { status: params.status },
        });
        return { template: updated };
      })
  );

  server.tool(
    "delete_recurring_journal",
    "Soft-delete a recurring journal template. Already-posted journal entries are unaffected.",
    {
      templateId: z.string().describe("The UUID of the recurring journal template to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");
        const existing = await db.query.recurringTemplate.findFirst({
          where: and(
            eq(recurringTemplate.id, params.templateId),
            eq(recurringTemplate.organizationId, ctx.organizationId),
            eq(recurringTemplate.type, "journal"),
            notDeleted(recurringTemplate.deletedAt)
          ),
        });
        if (!existing) throw new Error("Recurring journal not found");

        await db
          .update(recurringTemplate)
          .set({ deletedAt: new Date() })
          .where(eq(recurringTemplate.id, params.templateId));

        logAudit({ ctx, action: "delete", entityType: "recurring_journal", entityId: params.templateId });
        return { success: true };
      })
  );

  server.tool(
    "run_recurring_journals",
    "Run the recurring-journal scheduler for this organization now. Posts a balanced, posted manual journal entry for every due occurrence of every active journal template (catching up if behind). Re-validates debits == credits and that each occurrence's period is not locked. Returns the number of journal entries posted.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");
        const posted = await processRecurringJournals(ctx.organizationId);
        logAudit({
          ctx,
          action: "run",
          entityType: "recurring_journal",
          entityId: ctx.organizationId,
          changes: { posted },
        });
        return { posted };
      })
  );
}
