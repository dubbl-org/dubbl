import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import { getPublicAppUrl } from "@/lib/public-url";
import {
  createPortalInvite,
  listPortalAccess,
  listPortalActivity,
  PortalAccessError,
  revokePortalAccess,
} from "@/lib/api/portal-access";

/** Customer portal: private links where a customer sees their invoices, statements, quotes and payments. */
export function registerPortalTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_portal_access",
    "List customer-portal links (a private page where a customer can see their invoices, statements, quotes and payments). By default only live links; set includeInactive to also get revoked and expired ones. Each row has id, contactId, contactName, contactEmail, status (active | expired | revoked), expiresAt, createdAt, revokedAt, lastActivityAt, activityCount and the full portal url. Requires manage:contacts.",
    {
      includeInactive: z.boolean().optional().default(false).describe("Also return revoked and expired links"),
      contactId: z.string().uuid().optional().describe("Only links for this contact (UUID)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");
        const rows = await listPortalAccess(ctx.organizationId, {
          includeInactive: params.includeInactive,
          contactId: params.contactId,
        });
        const base = getPublicAppUrl();
        return { access: rows.map((r) => ({ ...r, url: `${base}${r.portalUrl}` })), total: rows.length };
      })
  );

  server.tool(
    "invite_contact_to_portal",
    "Create a customer-portal link for a contact so they can view their invoices, statements, quotes and payments online. Optionally emails the link to the contact's email address (needs the workspace's SMTP settings; if sending fails the link is still created and emailError explains why). Requires manage:contacts. Returns { access, url, emailed, emailError }.",
    {
      contactId: z.string().uuid().describe("The contact (normally a customer) to give portal access to"),
      expiresInDays: z.number().int().min(1).max(365).optional().default(30).describe("How many days the link works for (1-365, default 30)"),
      sendEmail: z.boolean().optional().default(false).describe("Email the link to the contact"),
      message: z.string().max(2000).optional().describe("Optional personal note included in the email"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");
        try {
          const result = await createPortalInvite(ctx.organizationId, {
            contactId: params.contactId,
            expiresInDays: params.expiresInDays,
            sendEmail: params.sendEmail,
            message: params.message,
            appUrl: getPublicAppUrl(),
          });
          return {
            access: { id: result.access.id, contactId: result.access.contactId, expiresAt: result.access.expiresAt },
            url: result.url,
            emailed: result.emailed,
            emailError: result.emailError,
          };
        } catch (err) {
          if (err instanceof PortalAccessError) throw new AuthError(err.message, err.status);
          throw err;
        }
      })
  );

  server.tool(
    "revoke_portal_access",
    "Switch off a customer-portal link immediately so it stops working. Use list_portal_access to find the link id. Requires manage:contacts. Returns { revoked: true }.",
    {
      accessId: z.string().uuid().describe("The portal link id (from list_portal_access)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");
        const revoked = await revokePortalAccess(ctx.organizationId, params.accessId);
        if (!revoked) throw new AuthError("Portal access not found", 404);
        return { revoked: true };
      })
  );

  server.tool(
    "list_portal_activity",
    "List what customers did in their portal, newest first: view_portal (opened it), view_invoices, approve_quote, etc. Each row has action, entityType, entityId, createdAt, contactId and contactName. Requires manage:contacts.",
    {
      contactId: z.string().uuid().optional().describe("Only activity by this contact (UUID)"),
      limit: z.number().int().min(1).max(200).optional().default(50).describe("Number of events to return (max 200)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");
        const activity = await listPortalActivity(ctx.organizationId, { limit: params.limit, contactId: params.contactId });
        return { activity, total: activity.length };
      })
  );
}
