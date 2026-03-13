import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { contact } from "@/lib/db/schema";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { checkResourceLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerContactTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_contacts",
    "List contacts (customers, suppliers, or both). Supports search by name/email and filtering by type. Returns paginated results.",
    {
      search: z
        .string()
        .optional()
        .describe("Search by name or email"),
      type: z
        .enum(["customer", "supplier", "both"])
        .optional()
        .describe("Filter by contact type"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of contacts to return (max 100)"),
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
          eq(contact.organizationId, ctx.organizationId),
          notDeleted(contact.deletedAt),
        ];

        if (params.search) {
          conditions.push(
            or(
              ilike(contact.name, `%${params.search}%`),
              ilike(contact.email, `%${params.search}%`)
            )!
          );
        }
        if (params.type) {
          conditions.push(eq(contact.type, params.type));
        }

        const offset = (params.page - 1) * params.limit;

        const contacts = await db.query.contact.findMany({
          where: and(...conditions),
          orderBy: contact.name,
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(contact)
          .where(and(...conditions));

        return {
          contacts,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_contact",
    "Get a single contact by ID with their details, default accounts, and contact people.",
    {
      contactId: z.string().describe("The UUID of the contact"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
          with: {
            defaultRevenueAccount: true,
            defaultExpenseAccount: true,
            defaultTaxRate: true,
            people: true,
          },
        });

        if (!found) throw new Error("Contact not found");
        return { contact: found };
      })
  );

  server.tool(
    "create_contact",
    "Create a new contact (customer, supplier, or both). Payment terms are in days (default 30).",
    {
      name: z.string().describe("Contact name"),
      email: z.string().optional().describe("Email address"),
      phone: z.string().optional().describe("Phone number"),
      taxNumber: z
        .string()
        .optional()
        .describe("Tax identification number"),
      type: z
        .enum(["customer", "supplier", "both"])
        .optional()
        .default("customer")
        .describe("Contact type"),
      paymentTermsDays: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(30)
        .describe("Payment terms in days"),
      notes: z.string().optional().describe("Notes"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Default currency code"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        await checkResourceLimit(ctx.organizationId, contact, contact.organizationId, "contacts", contact.deletedAt);
        await checkMultiCurrency(ctx.organizationId, params.currencyCode ?? "USD");

        const [created] = await db
          .insert(contact)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            email: params.email ?? null,
            phone: params.phone ?? null,
            taxNumber: params.taxNumber ?? null,
            type: params.type,
            paymentTermsDays: params.paymentTermsDays,
            notes: params.notes ?? null,
            currencyCode: params.currencyCode,
          })
          .returning();

        return { contact: created };
      })
  );

  server.tool(
    "update_contact",
    "Update an existing contact's details. Only provided fields are updated.",
    {
      contactId: z.string().describe("The UUID of the contact to update"),
      name: z.string().optional().describe("New name"),
      email: z.string().optional().describe("New email"),
      phone: z.string().optional().describe("New phone"),
      taxNumber: z.string().optional().describe("New tax number"),
      type: z
        .enum(["customer", "supplier", "both"])
        .optional()
        .describe("New contact type"),
      paymentTermsDays: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("New payment terms in days"),
      notes: z.string().optional().describe("New notes"),
      currencyCode: z.string().optional().describe("New currency code"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        const existing = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });

        if (!existing) throw new Error("Contact not found");

        const { contactId, ...updates } = params;
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        const [updated] = await db
          .update(contact)
          .set({ ...cleanUpdates, updatedAt: new Date() })
          .where(eq(contact.id, contactId))
          .returning();

        return { contact: updated };
      })
  );
}
