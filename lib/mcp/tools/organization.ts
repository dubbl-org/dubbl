import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { organization, periodLock } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { wrapTool } from "@/lib/mcp/errors";
import { requireRole } from "@/lib/api/require-role";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { deleteOrganization } from "@/lib/api/delete-organization";
import { queryAuditLog } from "@/lib/api/audit-log-query";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerOrganizationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_organization",
    "Get the current organization's details including name, currency, country, and settings",
    {},
    () =>
      wrapTool(ctx, async () => {
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });
        if (!org) throw new Error("Organization not found");
        return { organization: org };
      })
  );

  server.tool(
    "update_organization",
    "Update the organization's settings (Settings > Organization). Only the fields you pass change; pass null to clear a field. Requires the manage:organization permission (admins and the owner). Late-payment interest, used by Charge interest on overdue invoices: interestRate is the ANNUAL rate in BASIS POINTS (850 = 8.5%, null = no interest configured), interestMethod is 'simple' or 'compound' (daily compounding), interestGraceDays is the number of days after the due date before interest starts. The base currency can't be changed here. Returns the updated organization.",
    {
      name: z.string().min(1).optional().describe("Organization name"),
      taxId: z.string().nullable().optional().describe("Tax ID / VAT number"),
      businessRegistrationNumber: z.string().nullable().optional().describe("Company registration number"),
      industrySector: z.string().nullable().optional().describe("Industry, free text (e.g. 'Technology')"),
      addressStreet: z.string().nullable().optional().describe("Registered address: street"),
      addressCity: z.string().nullable().optional().describe("Registered address: city"),
      addressState: z.string().nullable().optional().describe("Registered address: state or province"),
      addressPostalCode: z.string().nullable().optional().describe("Registered address: postal code"),
      addressCountry: z.string().nullable().optional().describe("Registered address: ISO 3166-1 alpha-2 country code (e.g. 'US')"),
      contactPhone: z.string().nullable().optional().describe("Contact phone number"),
      contactEmail: z.string().nullable().optional().describe("Contact email address"),
      contactWebsite: z.string().nullable().optional().describe("Website URL"),
      fiscalYearStartMonth: z.number().int().min(1).max(12).optional().describe("Month the fiscal year starts, 1 = January ... 12 = December"),
      defaultPaymentTerms: z.string().nullable().optional().describe("Default payment terms code for new invoices (e.g. 'net_30')"),
      peppolId: z.string().nullable().optional().describe("PEPPOL participant ID for e-invoicing (e.g. '0088:1234567890')"),
      peppolScheme: z.string().nullable().optional().describe("PEPPOL scheme code (e.g. '0088', '9930')"),
      interestRate: z.number().int().min(0).max(100000).nullable().optional().describe("Late-payment interest: annual rate in basis points (850 = 8.5%); null turns interest off"),
      interestMethod: z.enum(["simple", "compound"]).optional().describe("Late-payment interest method: 'simple' or 'compound' (compounded daily)"),
      interestGraceDays: z.number().int().min(0).max(3650).optional().describe("Days after the due date before late-payment interest starts"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:organization");
        const existing = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });
        if (!existing) throw new Error("Organization not found");
        const patch = Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined)
        );
        const [updated] = await db
          .update(organization)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(organization.id, ctx.organizationId))
          .returning();
        logAudit({
          ctx,
          action: "update",
          entityType: "organization",
          entityId: ctx.organizationId,
          changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>),
        });
        return { organization: updated };
      })
  );

  server.tool(
    "get_period_lock",
    "Get the organization's period lock (Settings > Organization > Lock past dates). lockDate (YYYY-MM-DD): nothing dated on or before it can be added or changed by staff. advisorLockDate: an earlier hard lock for advisors and anyone with bypass:period-lock, who may still work after it. Returns { periodLock } or { periodLock: null } when no lock is set.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const found = await db.query.periodLock.findFirst({
          where: eq(periodLock.organizationId, ctx.organizationId),
        });
        return { periodLock: found ?? null };
      })
  );

  server.tool(
    "set_period_lock",
    "Lock past dates: nothing dated on or before lockDate can be added or changed. Optionally set advisorLockDate, an earlier hard lock for advisors (they can still work after it while staff are held to lockDate); omit or null to hold everyone to lockDate. Replaces any existing lock. Requires the manage:period-lock permission (the owner and advisors). Returns the saved lock.",
    {
      lockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Lock everything up to and including this date (YYYY-MM-DD)"),
      advisorLockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe("Optional earlier hard lock date for advisors (YYYY-MM-DD)"),
      reason: z.string().nullable().optional().describe("Optional note, e.g. 'Q2 VAT filed'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:period-lock");
        await db.delete(periodLock).where(eq(periodLock.organizationId, ctx.organizationId));
        const [created] = await db
          .insert(periodLock)
          .values({
            organizationId: ctx.organizationId,
            lockDate: params.lockDate,
            advisorLockDate: params.advisorLockDate ?? null,
            lockedBy: ctx.userId,
            reason: params.reason || null,
          })
          .returning();
        logAudit({
          ctx,
          action: "update",
          entityType: "period_lock",
          entityId: ctx.organizationId,
          changes: { lockDate: params.lockDate, advisorLockDate: params.advisorLockDate ?? null },
        });
        return { periodLock: created };
      })
  );

  server.tool(
    "delete_organization",
    "PERMANENTLY delete the current organization and ALL its data (books, contacts, documents, backups), cancel its subscription and remove everyone's access. Cannot be undone. Only the owner can do this. Only call this when the user has explicitly asked to delete the organization; confirmName must be the organization's exact name. Returns { success: true }.",
    {
      confirmName: z.string().describe("The organization's exact name, as confirmation"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "delete:organization");
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });
        if (!org) throw new Error("Organization not found");
        if (params.confirmName.trim() !== org.name.trim()) {
          throw new Error("confirmName doesn't match the organization's name");
        }
        await deleteOrganization(ctx.organizationId);
        return { success: true };
      })
  );

  server.tool(
    "list_audit_log",
    "List the organization's audit log (Settings > Audit Log): who created, updated, deleted, approved, sent... which record and when, newest first, limited to the plan's history window. All filters are optional. Requires the view:audit-log permission (admins and the owner). Returns { entries, total, page, actionCounts } where actionCounts is the number of entries per action across every entry matching the other filters.",
    {
      search: z.string().optional().describe("Free-text search across the person's name or email, the action, the record type (e.g. 'journal entry') and the record id"),
      action: z.string().optional().describe("Only this action, e.g. 'create', 'update', 'delete', 'approve', 'send'"),
      entityType: z.string().optional().describe("Only this record type, e.g. 'invoice', 'bill', 'contact', 'journal_entry'"),
      entityId: z.string().uuid().optional().describe("Only entries about this record id (UUID)"),
      userId: z.string().uuid().optional().describe("Only entries by this user id (UUID)"),
      startDate: z.string().optional().describe("Only entries on or after this date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("Only entries on or before this date (YYYY-MM-DD, whole day included)"),
      page: z.number().int().min(1).default(1).describe("Page number, starting at 1"),
      limit: z.number().int().min(1).max(100).default(50).describe("Entries per page (max 100)"),
    },
    ({ page, limit, ...filters }) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:audit-log");
        const result = await queryAuditLog(ctx.organizationId, filters, {
          limit,
          offset: (page - 1) * limit,
        });
        return { entries: result.data, total: result.total, page, actionCounts: result.actionCounts };
      })
  );
}
