import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailConfig } from "@/lib/db/schema";
import { encryptPassword, sendEmail, verifyConnection } from "@/lib/email/smtp-client";

/**
 * A workspace's own outgoing mail server (SMTP). When it's set up and
 * verified, invoices, quotes and other documents are emailed from it instead
 * of from dubbl's shared sender. The password is stored encrypted and is never
 * returned.
 */
export const emailSettingsSchema = z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpUsername: z.string().min(1),
  /** Leave out to keep the saved password. Required the first time. */
  smtpPassword: z.string().min(1).optional(),
  fromEmail: z.string().email(),
  fromName: z.string().nullable().optional(),
  replyTo: z.string().email().nullable().optional(),
  useTls: z.boolean().default(true),
});
export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>;

type Row = typeof emailConfig.$inferSelect;

/** The config without its password, plus whether one is saved. */
export function publicEmailSettings(row: Row | null | undefined) {
  if (!row) return null;
  const { smtpPassword, ...rest } = row;
  return { ...rest, hasPassword: Boolean(smtpPassword) };
}

export async function getEmailSettings(orgId: string) {
  const row = await db.query.emailConfig.findFirst({ where: eq(emailConfig.organizationId, orgId) });
  return publicEmailSettings(row);
}

export class EmailSettingsError extends Error {}

/** Save (create or update) and check the connection. `isVerified` says whether the server accepted the login. */
export async function saveEmailSettings(orgId: string, input: EmailSettingsInput) {
  const existing = await db.query.emailConfig.findFirst({ where: eq(emailConfig.organizationId, orgId) });
  const encrypted = input.smtpPassword ? encryptPassword(input.smtpPassword) : existing?.smtpPassword;
  if (!encrypted) throw new EmailSettingsError("Enter the mail server password");

  const values = {
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpUsername: input.smtpUsername,
    smtpPassword: encrypted,
    fromEmail: input.fromEmail,
    fromName: input.fromName || null,
    replyTo: input.replyTo || null,
    useTls: input.useTls,
  };
  const isVerified = await verifyConnection(values);

  const [row] = existing
    ? await db.update(emailConfig).set({ ...values, isVerified, updatedAt: new Date() }).where(eq(emailConfig.id, existing.id)).returning()
    : await db.insert(emailConfig).values({ organizationId: orgId, ...values, isVerified }).returning();
  return { emailConfig: publicEmailSettings(row), created: !existing };
}

/** Send a test message to the from-address; marks the config verified when it goes through. */
export async function testEmailSettings(orgId: string) {
  const config = await db.query.emailConfig.findFirst({ where: eq(emailConfig.organizationId, orgId) });
  if (!config) throw new EmailSettingsError("Set up your mail server first");
  await sendEmail(config, {
    to: config.fromEmail,
    subject: "dubbl test email",
    html: "<p>This is a test email from your dubbl mail server settings. If you received it, invoices and other documents will now be sent from your own address.</p>",
  });
  if (!config.isVerified) {
    await db.update(emailConfig).set({ isVerified: true, updatedAt: new Date() }).where(eq(emailConfig.id, config.id));
  }
  return { sentTo: config.fromEmail };
}

/** Forget the mail server, so documents go out from dubbl's shared sender again. */
export async function removeEmailSettings(orgId: string) {
  const deleted = await db.delete(emailConfig).where(eq(emailConfig.organizationId, orgId)).returning({ id: emailConfig.id });
  return { removed: deleted.length > 0 };
}
