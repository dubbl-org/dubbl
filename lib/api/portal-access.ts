import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { contact, emailConfig, organization, portalAccessToken, portalActivityLog } from "@/lib/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { sendEmail } from "@/lib/email/smtp-client";

export type PortalAccessStatus = "active" | "expired" | "revoked";

export interface PortalAccessRow {
  id: string;
  contactId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactType: "customer" | "supplier" | "both" | null;
  token: string;
  /** Path of the customer's portal, e.g. /portal/abc… (prefix with the app origin). */
  portalUrl: string;
  status: PortalAccessStatus;
  expiresAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  lastActivityAt: Date | null;
  activityCount: number;
}

/**
 * Invoice statuses a customer must never see in their portal: drafts and
 * documents still in (or rejected by) internal approval haven't been issued.
 */
export const PORTAL_HIDDEN_INVOICE_STATUSES = ["draft", "pending_approval", "rejected"] as const;

/** Quote statuses hidden from the portal (drafts haven't been sent yet). */
export const PORTAL_HIDDEN_QUOTE_STATUSES = ["draft"] as const;

export class PortalAccessError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function statusOf(t: { revokedAt: Date | null; expiresAt: Date | null }): PortalAccessStatus {
  if (t.revokedAt) return "revoked";
  if (t.expiresAt && t.expiresAt < new Date()) return "expired";
  return "active";
}

/** Portal links for the organization, newest first. Revoked/expired ones only when asked. */
export async function listPortalAccess(
  organizationId: string,
  opts: { includeInactive?: boolean; contactId?: string | null } = {}
): Promise<PortalAccessRow[]> {
  const conditions = [eq(portalAccessToken.organizationId, organizationId)];
  if (!opts.includeInactive) {
    conditions.push(isNull(portalAccessToken.revokedAt));
    conditions.push(sql`(${portalAccessToken.expiresAt} is null or ${portalAccessToken.expiresAt} > now())`);
  }
  if (opts.contactId) conditions.push(eq(portalAccessToken.contactId, opts.contactId));

  const activity = db
    .select({
      tokenId: portalActivityLog.tokenId,
      // Raw aggregate (no column mapping), so format it as UTC ISO ourselves:
      // timestamps are stored as UTC wall-clock time without a zone.
      last: sql<string | null>`to_char(max(${portalActivityLog.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.as("last"),
      n: sql<number>`count(*)`.mapWith(Number).as("n"),
    })
    .from(portalActivityLog)
    .groupBy(portalActivityLog.tokenId)
    .as("activity");

  const rows = await db
    .select({
      id: portalAccessToken.id,
      contactId: portalAccessToken.contactId,
      contactName: contact.name,
      contactEmail: contact.email,
      contactType: contact.type,
      token: portalAccessToken.token,
      expiresAt: portalAccessToken.expiresAt,
      createdAt: portalAccessToken.createdAt,
      revokedAt: portalAccessToken.revokedAt,
      lastActivityAt: activity.last,
      activityCount: activity.n,
    })
    .from(portalAccessToken)
    .leftJoin(contact, eq(contact.id, portalAccessToken.contactId))
    .leftJoin(activity, eq(activity.tokenId, portalAccessToken.id))
    .where(and(...conditions))
    .orderBy(desc(portalAccessToken.createdAt));

  return rows.map((r) => ({
    ...r,
    lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt) : null,
    activityCount: Number(r.activityCount ?? 0),
    portalUrl: `/portal/${r.token}`,
    status: statusOf(r),
  }));
}

export interface PortalActivityRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  tokenId: string;
  contactId: string;
  contactName: string | null;
}

/** What customers did in their portal (viewed invoices, accepted quotes…), newest first. */
export async function listPortalActivity(
  organizationId: string,
  opts: { limit: number; contactId?: string | null }
): Promise<PortalActivityRow[]> {
  const conditions = [eq(portalAccessToken.organizationId, organizationId)];
  if (opts.contactId) conditions.push(eq(portalAccessToken.contactId, opts.contactId));
  return db
    .select({
      id: portalActivityLog.id,
      action: portalActivityLog.action,
      entityType: portalActivityLog.entityType,
      entityId: portalActivityLog.entityId,
      createdAt: portalActivityLog.createdAt,
      tokenId: portalAccessToken.id,
      contactId: portalAccessToken.contactId,
      contactName: contact.name,
    })
    .from(portalActivityLog)
    .innerJoin(portalAccessToken, eq(portalActivityLog.tokenId, portalAccessToken.id))
    .leftJoin(contact, eq(contact.id, portalAccessToken.contactId))
    .where(and(...conditions))
    .orderBy(desc(portalActivityLog.createdAt))
    .limit(opts.limit);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Create a portal link for one of the organization's contacts and, when asked,
 * email it to the contact. Emailing needs the org's SMTP settings; if sending
 * fails the link still exists and `emailError` says why.
 */
export async function createPortalInvite(
  organizationId: string,
  input: { contactId: string; expiresInDays: number; sendEmail?: boolean; message?: string | null; appUrl: string }
) {
  const target = await db.query.contact.findFirst({
    where: and(eq(contact.id, input.contactId), eq(contact.organizationId, organizationId), isNull(contact.deletedAt)),
  });
  if (!target) throw new PortalAccessError("Contact not found", 404);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

  const [access] = await db
    .insert(portalAccessToken)
    .values({ organizationId, contactId: target.id, token, expiresAt })
    .returning();

  const portalUrl = `/portal/${token}`;
  const url = `${input.appUrl.replace(/\/+$/, "")}${portalUrl}`;
  let emailed = false;
  let emailError: string | null = null;

  if (input.sendEmail) {
    try {
      if (!target.email) throw new PortalAccessError("This contact has no email address");
      const cfg = await db.query.emailConfig.findFirst({ where: eq(emailConfig.organizationId, organizationId) });
      if (!cfg) throw new PortalAccessError("Email isn't set up for this workspace yet, so copy the link and send it yourself");
      const org = await db.query.organization.findFirst({ where: eq(organization.id, organizationId) });
      const orgName = org?.name || "Your supplier";
      const note = input.message?.trim()
        ? `<p style="font-size:14px;line-height:1.6;margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(input.message.trim())}</p>`
        : "";
      await sendEmail(cfg, {
        to: target.email,
        subject: `${orgName} shared your account portal`,
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:0;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<p style="font-size:14px;line-height:1.6;margin:0 0 16px;">Hi ${escapeHtml(target.name)},</p>
${note}
<p style="font-size:14px;line-height:1.6;margin:0 0 20px;">${escapeHtml(orgName)} has given you a private page where you can see your invoices, statements, quotes and payments at any time.</p>
<p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Open your portal</a></p>
<p style="font-size:12px;color:#777;line-height:1.6;margin:0;">This link is personal to you and works until ${expiresAt.toDateString()}. If the button doesn't work, paste this address into your browser:<br>${url}</p>
</div></body></html>`,
      });
      emailed = true;
    } catch (err) {
      emailError = err instanceof PortalAccessError ? err.message : "The email couldn't be sent. Check your email settings.";
    }
  }

  return { access, portalUrl, url, emailed, emailError };
}

/** Switch a portal link off. Returns false when it isn't one of the organization's links. */
export async function revokePortalAccess(organizationId: string, id: string) {
  const [revoked] = await db
    .update(portalAccessToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(portalAccessToken.id, id), eq(portalAccessToken.organizationId, organizationId)))
    .returning();
  return Boolean(revoked);
}
