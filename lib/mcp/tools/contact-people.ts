import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { contact, contactPerson } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { listContactPeople } from "@/lib/api/contact-people";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";

/** People (named individuals) who work at the organization's contacts. */
export function registerContactPeopleTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_contact_people",
    "List the people who work at your contacts (e.g. the CFO at a customer, the account manager at a supplier) across ALL contacts, or for one contact. Each row has the person's name, job title, email, phone, whether they're the primary person, and the company (contactId, contactName, contactType). Supports search over person name, email, phone, job title and company name. Returns { people, total, page, limit }.",
    {
      search: z.string().optional().describe("Free-text search over person name, email, phone, job title and company name"),
      contactId: z.string().uuid().optional().describe("Only people at this contact (UUID)"),
      contactType: z.enum(["customer", "supplier"]).optional().describe("Only people at customers or at suppliers (contacts of type 'both' match either)"),
      primaryOnly: z.boolean().optional().default(false).describe("Only each contact's primary person"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Number of people to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number, starting at 1"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { rows, total } = await listContactPeople(ctx.organizationId, {
          search: params.search,
          contactId: params.contactId,
          contactType: params.contactType,
          primaryOnly: params.primaryOnly,
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
        });
        return { people: rows, total, page: params.page, limit: params.limit };
      })
  );

  server.tool(
    "add_contact_person",
    "Add a person to a contact (customer or supplier), e.g. their accounts-payable clerk. Requires the manage:contacts permission. Returns the created person.",
    {
      contactId: z.string().uuid().describe("The contact (company) this person works at"),
      name: z.string().min(1).describe("Full name of the person"),
      email: z.string().email().nullable().optional().describe("Their email address"),
      phone: z.string().nullable().optional().describe("Their phone number"),
      jobTitle: z.string().nullable().optional().describe("Their role, e.g. 'CFO' or 'Accounts payable'"),
      isPrimary: z.boolean().optional().default(false).describe("Mark as the contact's main person"),
      notes: z.string().nullable().optional().describe("Internal notes about this person"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");
        const parent = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });
        // AuthError carries a status, so wrapTool passes the message through to the agent.
        if (!parent) throw new AuthError("Contact not found", 404);

        const [person] = await db
          .insert(contactPerson)
          .values({
            contactId: parent.id,
            name: params.name,
            email: params.email || null,
            phone: params.phone || null,
            jobTitle: params.jobTitle || null,
            isPrimary: params.isPrimary,
            notes: params.notes || null,
          })
          .returning();
        return { person, contactName: parent.name };
      })
  );
}
