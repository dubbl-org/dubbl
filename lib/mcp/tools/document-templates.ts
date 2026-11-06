import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { wrapTool } from "@/lib/mcp/errors";
import { clearOtherDefaults } from "@/lib/documents/templates";
import { HEX_COLOR_RE, TEMPLATE_TYPE_DOCUMENTS } from "@/lib/documents/template-text";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for document templates (Settings > Document Templates): the look
 * of the PDFs dubbl generates. Each organization has at most one default
 * template per type, and every PDF of that type uses it:
 *   invoice        -> invoices, credit notes, portal / pay-link invoices
 *   quote          -> quotes
 *   receipt        -> sales receipts (cash sales)
 *   payslip        -> payslips
 *   purchase_order -> purchase orders, debit notes
 * Mirrors /api/v1/document-templates. Direct DB access, org-scoped via ctx.
 */

const TYPES = ["invoice", "quote", "receipt", "payslip", "purchase_order"] as const;

const USED_FOR = TYPES.map((t) => `${t}: ${TEMPLATE_TYPE_DOCUMENTS[t].join(", ")}`).join("; ");

const fieldSchemas = {
  headerHtml: z
    .string()
    .nullable()
    .optional()
    .describe("Header text printed above the title. HTML tags are stripped (line breaks, paragraphs and list items are kept). Supports {{placeholders}}. null clears it."),
  footerHtml: z
    .string()
    .nullable()
    .optional()
    .describe("Footer text printed at the bottom of every page. HTML tags are stripped (line breaks kept). Supports {{placeholders}}. null clears it."),
  logoUrl: z
    .string()
    .nullable()
    .optional()
    .describe("Public https URL (or data: URL) of a PNG or JPEG logo printed at the top of the PDF. null removes it."),
  accentColor: z
    .string()
    .regex(HEX_COLOR_RE, "Accent color must be a hex colour like #10b981")
    .optional()
    .describe("Hex colour of the accent bar at the top of the PDF, e.g. '#10b981'"),
  showTaxBreakdown: z
    .boolean()
    .optional()
    .describe("Invoices/quotes/receipts/POs: show the Tax row in the totals. Payslips: list each tax separately instead of one 'Tax withheld' line."),
  showPaymentTerms: z
    .boolean()
    .optional()
    .describe("Invoice templates only: show the due date row, the '{amount} due {date}' headline and a 'Payment terms' line (e.g. 'Net 30. Please pay by 2026-04-09.'). false hides all of them."),
  notes: z
    .string()
    .nullable()
    .optional()
    .describe("Notes printed on every document using this template; replaces the document's own notes. Supports {{placeholders}}."),
  bankDetails: z
    .string()
    .nullable()
    .optional()
    .describe("Bank details printed as their own 'Bank details' section. Supports {{placeholders}}."),
  paymentInstructions: z
    .string()
    .nullable()
    .optional()
    .describe("Printed as a 'Payment instructions' section below bank details. Supports {{placeholders}}."),
  isDefault: z
    .boolean()
    .optional()
    .describe("Make this the default template for its type. Turning it on switches off the previous default of the same type, so there is always at most one."),
};

export function registerDocumentTemplateTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_document_templates",
    `List the organization's document templates (excludes deleted), grouped by type, oldest first. Each has id, name, type, isDefault and its styling fields. Template types and the PDFs their default applies to: ${USED_FOR}.`,
    {
      type: z.enum(TYPES).optional().describe("Only return templates of this type"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const templates = await db.query.documentTemplate.findMany({
          where: and(
            eq(documentTemplate.organizationId, ctx.organizationId),
            params.type ? eq(documentTemplate.type, params.type) : undefined,
            notDeleted(documentTemplate.deletedAt)
          ),
          orderBy: [documentTemplate.type, documentTemplate.createdAt],
        });
        return { templates };
      })
  );

  server.tool(
    "get_document_template",
    "Get one document template by ID with all its fields. Returns the template.",
    {
      templateId: z.string().describe("UUID of the document template"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const template = await db.query.documentTemplate.findFirst({
          where: and(
            eq(documentTemplate.id, params.templateId),
            eq(documentTemplate.organizationId, ctx.organizationId),
            notDeleted(documentTemplate.deletedAt)
          ),
        });
        if (!template) throw new Error("Template not found");
        return { template };
      })
  );

  server.tool(
    "create_document_template",
    `Create a document template. type can't be changed later. With isDefault true it becomes the default for its type and the old default is switched off. Template types and the PDFs their default applies to: ${USED_FOR}. Returns the created template.`,
    {
      name: z.string().min(1).describe("Template name, e.g. 'Standard Invoice'"),
      type: z.enum(TYPES).describe("Which kind of document the template styles"),
      ...fieldSchemas,
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");
        const template = await db.transaction(async (tx) => {
          await clearOtherDefaults(tx, ctx.organizationId, params);
          const [row] = await tx
            .insert(documentTemplate)
            .values({ organizationId: ctx.organizationId, ...params })
            .returning();
          return row;
        });
        logAudit({ ctx, action: "create", entityType: "document_template", entityId: template.id });
        return { template };
      })
  );

  server.tool(
    "update_document_template",
    "Update a document template. Only the fields you pass change (type can't be changed). Setting isDefault true makes it the default for its type and switches off the previous default. Returns the updated template.",
    {
      templateId: z.string().describe("UUID of the document template to update"),
      name: z.string().min(1).optional().describe("New template name"),
      ...fieldSchemas,
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");
        const { templateId, ...changes } = params;
        const existing = await db.query.documentTemplate.findFirst({
          where: and(
            eq(documentTemplate.id, templateId),
            eq(documentTemplate.organizationId, ctx.organizationId),
            notDeleted(documentTemplate.deletedAt)
          ),
        });
        if (!existing) throw new Error("Template not found");

        const updated = await db.transaction(async (tx) => {
          await clearOtherDefaults(tx, ctx.organizationId, {
            id: templateId,
            type: existing.type,
            isDefault: changes.isDefault,
          });
          const [row] = await tx
            .update(documentTemplate)
            .set({ ...changes, updatedAt: new Date() })
            .where(and(eq(documentTemplate.id, templateId), eq(documentTemplate.organizationId, ctx.organizationId)))
            .returning();
          return row;
        });
        logAudit({
          ctx,
          action: "update",
          entityType: "document_template",
          entityId: templateId,
          changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>),
        });
        return { template: updated };
      })
  );

  server.tool(
    "delete_document_template",
    "Move a document template to the trash. If it was the default, its type has no default afterwards (PDFs use the built-in look) until another template is made default. Returns success.",
    {
      templateId: z.string().describe("UUID of the document template to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");
        const [deleted] = await db
          .update(documentTemplate)
          .set({ ...softDelete(), isDefault: false })
          .where(
            and(
              eq(documentTemplate.id, params.templateId),
              eq(documentTemplate.organizationId, ctx.organizationId),
              notDeleted(documentTemplate.deletedAt)
            )
          )
          .returning();
        if (!deleted) throw new Error("Template not found");
        logAudit({ ctx, action: "delete", entityType: "document_template", entityId: deleted.id });
        return { success: true };
      })
  );
}
