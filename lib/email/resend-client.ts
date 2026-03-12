import { Resend } from "resend";
import { db } from "@/lib/db";
import { emailConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail as sendSmtpEmail } from "./smtp-client";
import { decryptPassword } from "./smtp-client";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/**
 * Send an email using the org's configured provider (SMTP or Resend).
 */
export async function sendOrgEmail(orgId: string, options: EmailOptions) {
  const config = await db.query.emailConfig.findFirst({
    where: eq(emailConfig.organizationId, orgId),
  });

  if (!config) {
    throw new Error("Email not configured for this organization");
  }

  if (config.provider === "resend") {
    if (!config.resendApiKey) {
      throw new Error("Resend API key not configured");
    }
    const apiKey = decryptPassword(config.resendApiKey);
    const resend = new Resend(apiKey);

    const from = options.from
      || (config.fromName
        ? `${config.fromName} <${config.fromEmail}>`
        : config.fromEmail);

    await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo || config.replyTo || undefined,
    });
  } else {
    // SMTP path
    if (!config.smtpHost || !config.smtpUsername || !config.smtpPassword) {
      throw new Error("SMTP settings incomplete");
    }
    await sendSmtpEmail(
      {
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort ?? 587,
        smtpUsername: config.smtpUsername,
        smtpPassword: config.smtpPassword,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        replyTo: config.replyTo,
        useTls: config.useTls,
      },
      { to: options.to, subject: options.subject, html: options.html }
    );
  }
}

/**
 * Send a platform-level email using the RESEND_API_KEY env var.
 * Used for system emails like notification digests, welcome emails, etc.
 */
export async function sendPlatformEmail(options: EmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable not set");
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: options.from || "dubbl <noreply@dubbl.dev>",
    to: options.to,
    subject: options.subject,
    html: options.html,
    replyTo: options.replyTo || undefined,
  });
}

/**
 * Verify a Resend API key is valid by listing domains.
 */
export async function verifyResendKey(apiKey: string): Promise<boolean> {
  try {
    const resend = new Resend(apiKey);
    await resend.domains.list();
    return true;
  } catch {
    return false;
  }
}
