import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { recurringTemplate, recurringTemplateLine } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { processRecurringDocuments } from "@/lib/api/recurring-generate";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for recurring DOCUMENT templates: scheduled invoices, bills, and
 * expenses (NOT recurring journal templates — those live in
 * recurring-journals.ts and are a separate GL feature). A template stores its
 * line items and a schedule (frequency + start/end dates + optional occurrence
 * cap); the recurring generator materialises one real document (invoice / bill /
 * expense) per due occurrence and advances the schedule.
 *
 * Money convention: line unitPrice is provided in DOLLARS and stored as integer
 * cents (the route multiplies by 100), matching the REST routes
 * app/api/v1/recurring/* and app/api/v1/recurring-invoices/*. quantity is a
 * decimal number (e.g. 1.5) stored as quantity x 100. discountPercent is in
 * basis points (1000 = 10%). Stored template-line fields returned in RESULTS are
 * therefore integers (unitPrice in cents, quantity x 100). Direct DB access via
 * Drizzle (no HTTP self-calls); org-scoped via the AuthContext.
 */
export function registerRecurringTemplateTools(server: McpServer, ctx: AuthContext) {
  const FREQUENCIES = [
    "weekly",
    "fortnightly",
    "monthly",
    "quarterly",
    "semi_annual",
    "annual",
  ] as const;

  // Document templates only — journal templates are handled by the separate
  // recurring-journal tools and must never be touched here.
  const DOCUMENT_TYPES = ["invoice", "bill", "expense"] as const;

  server.tool(
    "list_recurring_templates",
    "List recurring DOCUMENT templates (invoice / bill / expense) for the organization, with optional filters and pagination. Each row includes the linked contact. Journal templates are excluded (use the recurring-journal tools for those). Stored line unitPrice is in integer cents and quantity is the decimal x 100.",
    {
      type: z
        .enum(DOCUMENT_TYPES)
        .optional()
        .describe("Filter by template type: invoice, bill, or expense"),
      status: z
        .enum(["active", "paused", "completed"])
        .optional()
        .describe("Filter by template status"),
      frequency: z
        .enum(FREQUENCIES)
        .optional()
        .describe("Filter by schedule frequency"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of templates to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(recurringTemplate.organizationId, ctx.organizationId),
          notDeleted(recurringTemplate.deletedAt),
        ];
        // When a type is given, scope the query to it. Journal templates are
        // always excluded below (in JS) so they never leak into this list.
        if (params.type) conditions.push(eq(recurringTemplate.type, params.type));

        const offset = (params.page - 1) * params.limit;
        const templates = await db.query.recurringTemplate.findMany({
          where: and(...conditions),
          orderBy: desc(recurringTemplate.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true, lines: true },
        });

        // Filter out journal templates (and apply the frequency filter) in JS so
        // we keep the same shape regardless of whether `type` was supplied.
        const filtered = templates.filter(
          (t) =>
            (DOCUMENT_TYPES as readonly string[]).includes(t.type) &&
            (!params.frequency || t.frequency === params.frequency)
        );

        return { templates: filtered, page: params.page, limit: params.limit };
      })
  );

  server.tool(
    "get_recurring_template",
    "Get a single recurring DOCUMENT template (invoice / bill / expense) by ID, including its contact and line items. Stored line unitPrice is in integer cents and quantity is the decimal x 100. Journal templates are not returned here.",
    {
      templateId: z.string().describe("The UUID of the recurring template"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.recurringTemplate.findFirst({
          where: and(
            eq(recurringTemplate.id, params.templateId),
            eq(recurringTemplate.organizationId, ctx.organizationId),
            notDeleted(recurringTemplate.deletedAt)
          ),
          with: { contact: true, lines: true },
        });
        if (!found || !(DOCUMENT_TYPES as readonly string[]).includes(found.type)) {
          throw new Error("Recurring template not found");
        }
        return { template: found };
      })
  );

  server.tool(
    "create_recurring_template",
    "Create a recurring DOCUMENT template (invoice, bill, or expense) with line items and a schedule. The generator materialises one real document per due occurrence starting on startDate. A contactId is required (the customer for invoices, the supplier for bills/expenses). Line unitPrice is in DOLLARS and is stored as integer cents (x100); quantity is a decimal (e.g. 1.5); discountPercent is in basis points (1000 = 10%). For type='invoice' you may set autoSend (post the invoice GL and email the customer each occurrence) and/or createAsApproved (post the GL and mark sent WITHOUT emailing); both default false (generate as draft). Returns the created template.",
    {
      name: z.string().min(1).describe("Template name"),
      type: z
        .enum(DOCUMENT_TYPES)
        .describe("Document type to generate: invoice, bill, or expense"),
      contactId: z
        .string()
        .min(1)
        .describe("Contact UUID (customer for invoices, supplier for bills/expenses); required"),
      frequency: z.enum(FREQUENCIES).describe("How often a document is generated"),
      startDate: z
        .string()
        .describe("First run date (YYYY-MM-DD); also the date of the first generated document"),
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
        .describe("Optional cap on the number of documents generated; null = unlimited"),
      reference: z
        .string()
        .nullable()
        .optional()
        .describe("Optional reference stamped on each generated document"),
      notes: z.string().nullable().optional().describe("Optional notes"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code (defaults to USD)"),
      autoSend: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Invoice only: post the invoice GL (status -> sent) AND email the customer each occurrence"
        ),
      createAsApproved: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Invoice only: post the invoice GL and mark it sent WITHOUT emailing each occurrence"
        ),
      lines: z
        .array(
          z.object({
            description: z.string().min(1).describe("Line item description"),
            quantity: z
              .number()
              .optional()
              .default(1)
              .describe("Quantity (decimal, e.g. 1.5); stored as quantity x 100"),
            unitPrice: z
              .number()
              .optional()
              .default(0)
              .describe("Unit price in DOLLARS (e.g. 12.50); stored as integer cents (x100)"),
            accountId: z
              .string()
              .nullable()
              .optional()
              .describe("Income/expense chart-account UUID for this line"),
            taxRateId: z.string().nullable().optional().describe("Tax rate UUID for this line"),
            discountPercent: z
              .number()
              .int()
              .min(0)
              .max(10000)
              .optional()
              .default(0)
              .describe("Discount in basis points (1000 = 10%)"),
          })
        )
        .min(1)
        .describe("Template line items (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const [created] = await db
          .insert(recurringTemplate)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            type: params.type,
            contactId: params.contactId,
            frequency: params.frequency,
            startDate: params.startDate,
            endDate: params.endDate || null,
            nextRunDate: params.startDate,
            maxOccurrences: params.maxOccurrences || null,
            reference: params.reference || null,
            notes: params.notes || null,
            currencyCode: params.currencyCode ?? "USD",
            autoSend: params.autoSend,
            createAsApproved: params.createAsApproved,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(recurringTemplateLine).values(
          params.lines.map((l, i) => ({
            templateId: created.id,
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: Math.round(l.unitPrice * 100),
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
            discountPercent: l.discountPercent ?? 0,
            sortOrder: i,
          }))
        );

        logAudit({
          ctx,
          action: "create",
          entityType: "recurring_template",
          entityId: created.id,
        });

        return { template: created };
      })
  );

  server.tool(
    "update_recurring_template",
    "Update a recurring DOCUMENT template's header fields (name, frequency, status, endDate, maxOccurrences, reference, notes, currencyCode, and the invoice-only autoSend / createAsApproved automation flags). Mirrors the PATCH route: line items are NOT edited here. Only provided fields change. Returns the updated template.",
    {
      templateId: z.string().describe("The UUID of the recurring template to update"),
      name: z.string().min(1).optional().describe("New template name"),
      frequency: z
        .enum(FREQUENCIES)
        .optional()
        .describe("New schedule frequency"),
      status: z
        .enum(["active", "paused", "completed"])
        .optional()
        .describe("New status: active (running), paused (skipped), or completed (stopped)"),
      endDate: z
        .string()
        .nullable()
        .optional()
        .describe("New last date (YYYY-MM-DD); null = run indefinitely"),
      maxOccurrences: z
        .number()
        .int()
        .min(1)
        .nullable()
        .optional()
        .describe("New cap on documents generated; null = unlimited"),
      reference: z.string().nullable().optional().describe("New reference"),
      notes: z.string().nullable().optional().describe("New notes"),
      currencyCode: z.string().optional().describe("New currency code"),
      autoSend: z
        .boolean()
        .optional()
        .describe("Invoice only: post GL and email the customer each occurrence"),
      createAsApproved: z
        .boolean()
        .optional()
        .describe("Invoice only: post GL and mark sent WITHOUT emailing each occurrence"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const existing = await db.query.recurringTemplate.findFirst({
          where: and(
            eq(recurringTemplate.id, params.templateId),
            eq(recurringTemplate.organizationId, ctx.organizationId),
            notDeleted(recurringTemplate.deletedAt)
          ),
        });
        if (!existing || !(DOCUMENT_TYPES as readonly string[]).includes(existing.type)) {
          throw new Error("Recurring template not found");
        }

        // Only the header fields the PATCH route allows; undefined fields are
        // omitted so they aren't overwritten to null.
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (params.name !== undefined) updates.name = params.name;
        if (params.frequency !== undefined) updates.frequency = params.frequency;
        if (params.status !== undefined) updates.status = params.status;
        if (params.endDate !== undefined) updates.endDate = params.endDate;
        if (params.maxOccurrences !== undefined) updates.maxOccurrences = params.maxOccurrences;
        if (params.reference !== undefined) updates.reference = params.reference;
        if (params.notes !== undefined) updates.notes = params.notes;
        if (params.currencyCode !== undefined) updates.currencyCode = params.currencyCode;
        if (params.autoSend !== undefined) updates.autoSend = params.autoSend;
        if (params.createAsApproved !== undefined)
          updates.createAsApproved = params.createAsApproved;

        const [updated] = await db
          .update(recurringTemplate)
          .set(updates)
          .where(eq(recurringTemplate.id, params.templateId))
          .returning();

        logAudit({
          ctx,
          action: "update",
          entityType: "recurring_template",
          entityId: params.templateId,
          changes: updates,
        });

        return { template: updated };
      })
  );

  server.tool(
    "pause_recurring_template",
    "Toggle a recurring DOCUMENT template between active and paused (mirrors the /pause route). An active template becomes paused (the generator skips it); a paused template becomes active again (resuming does not back-fill missed occurrences). Fails on a completed template. Returns the updated template.",
    {
      templateId: z.string().describe("The UUID of the recurring template to pause/resume"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const existing = await db.query.recurringTemplate.findFirst({
          where: and(
            eq(recurringTemplate.id, params.templateId),
            eq(recurringTemplate.organizationId, ctx.organizationId),
            notDeleted(recurringTemplate.deletedAt)
          ),
        });
        if (!existing || !(DOCUMENT_TYPES as readonly string[]).includes(existing.type)) {
          throw new Error("Recurring template not found");
        }
        if (existing.status === "completed") {
          throw new Error("Cannot toggle a completed template");
        }

        const newStatus = existing.status === "active" ? "paused" : "active";

        const [updated] = await db
          .update(recurringTemplate)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(recurringTemplate.id, params.templateId))
          .returning();

        logAudit({
          ctx,
          action: "update",
          entityType: "recurring_template",
          entityId: params.templateId,
          changes: { status: newStatus },
        });

        return { template: updated };
      })
  );

  server.tool(
    "run_recurring_template",
    "Run the recurring-document generator for this organization now, generating real invoices/bills/expenses for every DUE occurrence of every active document template (catching up if a template is behind) and advancing each template's schedule. Use this to materialise a template whose nextRunDate has arrived. NOTE: the generator operates org-wide on due document templates (not journal templates) — it will not pull a future-dated template forward. Provide templateId to confirm the target document template exists and is active before running. Returns the number of documents generated.",
    {
      templateId: z
        .string()
        .describe(
          "The UUID of the recurring document template you intend to run (validated as an active document template before the generator runs)"
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:recurring");

        const found = await db.query.recurringTemplate.findFirst({
          where: and(
            eq(recurringTemplate.id, params.templateId),
            eq(recurringTemplate.organizationId, ctx.organizationId),
            notDeleted(recurringTemplate.deletedAt)
          ),
        });
        if (!found || !(DOCUMENT_TYPES as readonly string[]).includes(found.type)) {
          throw new Error("Recurring template not found");
        }
        if (found.status !== "active") {
          throw new Error("Only an active recurring template can be run");
        }

        // Reuse the exact route generator (handles GL posting, numbering, tax,
        // auto-send, and schedule advancement). It generates for every due
        // document template in the org, not just this one.
        const generated = await processRecurringDocuments(ctx.organizationId);

        logAudit({
          ctx,
          action: "run",
          entityType: "recurring_template",
          entityId: params.templateId,
          changes: { generated },
        });

        return { generated };
      })
  );
}
