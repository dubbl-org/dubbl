import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { reminderRule } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { processReminders } from "@/lib/email/reminder-processor";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for automatic payment reminders: the rules that decide when/what to
 * email about overdue (or soon-due) invoices and bills, plus running the
 * reminder sweep on demand.
 *
 * Mirrors the REST routes under /api/v1/reminder-rules and /api/v1/reminders.
 * Direct DB access via Drizzle (no HTTP self-calls); every query is org-scoped
 * via the AuthContext and excludes soft-deleted rows where applicable.
 */
export function registerReminderTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_reminder_rules",
    "List the org's payment-reminder rules (most recent first), excluding deleted ones. Each rule defines when a reminder fires (triggerType + triggerDays relative to the document due date), the email subject/body templates, which document type it targets (invoice or bill), and who it goes to. Returns the rules and the total count.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of rules to return (max 100)"),
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
          eq(reminderRule.organizationId, ctx.organizationId),
          notDeleted(reminderRule.deletedAt),
        ];

        const offset = (params.page - 1) * params.limit;
        const rules = await db.query.reminderRule.findMany({
          where: and(...conditions),
          orderBy: desc(reminderRule.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(reminderRule)
          .where(and(...conditions));

        return { reminderRules: rules, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_reminder_rule",
    "Get a single payment-reminder rule by ID (excluding deleted ones). Returns its trigger settings, subject/body templates, target document type, and recipient configuration.",
    {
      reminderRuleId: z.string().uuid().describe("The UUID of the reminder rule"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.reminderRule.findFirst({
          where: and(
            eq(reminderRule.id, params.reminderRuleId),
            eq(reminderRule.organizationId, ctx.organizationId),
            notDeleted(reminderRule.deletedAt)
          ),
        });
        if (!found) throw new Error("Reminder rule not found");
        return { reminderRule: found };
      })
  );

  server.tool(
    "create_reminder_rule",
    "Create a payment-reminder rule. The rule decides when an automated email fires for a document: triggerType is 'before_due', 'on_due', or 'after_due', and triggerDays is the number of days offset (0 for on-due). subjectTemplate/bodyTemplate are the email templates (supporting placeholders), documentType is 'invoice' or 'bill', and recipientType chooses where it's sent ('contact_email', 'contact_persons', or 'custom' — for 'custom' provide customEmails). Rules are created disabled by default unless enabled is true. Returns the created rule.",
    {
      name: z.string().min(1).describe("Human-readable name for the rule"),
      triggerType: z
        .enum(["before_due", "on_due", "after_due"])
        .describe("When the reminder fires relative to the document due date"),
      triggerDays: z
        .number()
        .int()
        .min(0)
        .describe("Days offset from the due date (0 for on-due reminders)"),
      enabled: z
        .boolean()
        .default(false)
        .describe("Whether the rule is active; defaults to false"),
      subjectTemplate: z
        .string()
        .min(1)
        .describe("Email subject template (supports placeholders)"),
      bodyTemplate: z
        .string()
        .min(1)
        .describe("Email body template (supports placeholders)"),
      documentType: z
        .enum(["invoice", "bill"])
        .describe("Which document type this rule targets"),
      recipientType: z
        .enum(["contact_email", "contact_persons", "custom"])
        .describe(
          "Where the reminder is sent: the contact's primary email, the contact's persons, or custom emails"
        ),
      customEmails: z
        .array(z.string().email())
        .nullable()
        .optional()
        .describe("Explicit recipient emails; used when recipientType is 'custom'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const [created] = await db
          .insert(reminderRule)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            triggerType: params.triggerType,
            triggerDays: params.triggerDays,
            enabled: params.enabled,
            subjectTemplate: params.subjectTemplate,
            bodyTemplate: params.bodyTemplate,
            documentType: params.documentType,
            recipientType: params.recipientType,
            customEmails: params.customEmails || null,
          })
          .returning();

        return { reminderRule: created };
      })
  );

  server.tool(
    "update_reminder_rule",
    "Update a payment-reminder rule. Only the provided fields are changed; omit a field to leave it unchanged. Use enabled to turn a rule on or off. Only non-deleted rules in the org can be updated. Returns the updated rule.",
    {
      reminderRuleId: z
        .string()
        .uuid()
        .describe("The UUID of the reminder rule to update"),
      name: z.string().min(1).optional().describe("New name for the rule"),
      triggerType: z
        .enum(["before_due", "on_due", "after_due"])
        .optional()
        .describe("When the reminder fires relative to the document due date"),
      triggerDays: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Days offset from the due date (0 for on-due reminders)"),
      enabled: z
        .boolean()
        .optional()
        .describe("Whether the rule is active"),
      subjectTemplate: z
        .string()
        .min(1)
        .optional()
        .describe("Email subject template (supports placeholders)"),
      bodyTemplate: z
        .string()
        .min(1)
        .optional()
        .describe("Email body template (supports placeholders)"),
      documentType: z
        .enum(["invoice", "bill"])
        .optional()
        .describe("Which document type this rule targets"),
      recipientType: z
        .enum(["contact_email", "contact_persons", "custom"])
        .optional()
        .describe(
          "Where the reminder is sent: the contact's primary email, the contact's persons, or custom emails"
        ),
      customEmails: z
        .array(z.string().email())
        .nullable()
        .optional()
        .describe("Explicit recipient emails; used when recipientType is 'custom'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const existing = await db.query.reminderRule.findFirst({
          where: and(
            eq(reminderRule.id, params.reminderRuleId),
            eq(reminderRule.organizationId, ctx.organizationId),
            notDeleted(reminderRule.deletedAt)
          ),
        });
        if (!existing) throw new Error("Reminder rule not found");

        const { reminderRuleId, ...rest } = params;
        const updateValues: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) updateValues[key] = value;
        }

        const [updated] = await db
          .update(reminderRule)
          .set({ ...updateValues, updatedAt: new Date() })
          .where(eq(reminderRule.id, reminderRuleId))
          .returning();

        return { reminderRule: updated };
      })
  );

  server.tool(
    "delete_reminder_rule",
    "Soft-delete a payment-reminder rule so it no longer fires. The rule is marked deleted (not physically removed) and stops appearing in listings. Only non-deleted rules in the org can be deleted. Returns success.",
    {
      reminderRuleId: z
        .string()
        .uuid()
        .describe("The UUID of the reminder rule to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const existing = await db.query.reminderRule.findFirst({
          where: and(
            eq(reminderRule.id, params.reminderRuleId),
            eq(reminderRule.organizationId, ctx.organizationId),
            notDeleted(reminderRule.deletedAt)
          ),
        });
        if (!existing) throw new Error("Reminder rule not found");

        await db
          .update(reminderRule)
          .set(softDelete())
          .where(eq(reminderRule.id, params.reminderRuleId));

        return { success: true };
      })
  );

  server.tool(
    "process_reminders",
    "Run the payment-reminder sweep for the org now. Evaluates every enabled rule against current invoices/bills, sends any due reminder emails, and records a reminder log entry for each. No-op (returns zero counts) if email isn't configured/verified. Returns { sent, failed, skipped } counts.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const results = await processReminders(ctx.organizationId);

        return results;
      })
  );
}
