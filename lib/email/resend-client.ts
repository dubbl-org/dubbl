import { Resend } from "resend";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/**
 * Send a platform-level email using the RESEND_API_KEY env var.
 * Used for system emails like notification digests.
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
