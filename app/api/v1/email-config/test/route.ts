import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { sendEmail } from "@/lib/email/smtp-client";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");

    const config = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (!config) {
      return NextResponse.json(
        { error: "Email config not found. Please configure SMTP settings first." },
        { status: 404 }
      );
    }

    try {
      await sendEmail(config, {
        to: config.fromEmail,
        subject: "Dubbl - Test Email",
        html: "<p>This is a test email from your Dubbl SMTP configuration. If you received this, your email settings are working correctly.</p>",
      });

      // Mark as verified if test succeeds
      if (!config.isVerified) {
        await db
          .update(emailConfig)
          .set({ isVerified: true, updatedAt: new Date() })
          .where(eq(emailConfig.id, config.id));
      }

      return NextResponse.json({ success: true, message: "Test email sent successfully" });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Failed to send test email" },
        { status: 400 }
      );
    }
  } catch (err) {
    return handleError(err);
  }
}
