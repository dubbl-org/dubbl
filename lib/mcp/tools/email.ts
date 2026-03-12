import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { emailConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { sendOrgEmail } from "@/lib/email/resend-client";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerEmailTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_email_config",
    "Get the organization's email configuration including provider type (smtp/resend), from address, and verification status. Does not return sensitive fields like passwords or API keys.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const config = await db.query.emailConfig.findFirst({
          where: eq(emailConfig.organizationId, ctx.organizationId),
        });

        if (!config) return { emailConfig: null };

        return {
          emailConfig: {
            id: config.id,
            provider: config.provider,
            fromEmail: config.fromEmail,
            fromName: config.fromName,
            replyTo: config.replyTo,
            isVerified: config.isVerified,
            customDomain: config.customDomain,
            domainVerified: config.domainVerified,
          },
        };
      })
  );

  server.tool(
    "send_test_email",
    "Send a test email using the organization's configured email provider. Sends to the configured from address. Requires email to be configured and the manage:banking permission.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const config = await db.query.emailConfig.findFirst({
          where: eq(emailConfig.organizationId, ctx.organizationId),
        });

        if (!config) {
          throw new Error("Email not configured");
        }

        await sendOrgEmail(ctx.organizationId, {
          to: config.fromEmail,
          subject: "dubbl - Test Email",
          html: "<p>This is a test email from your dubbl email configuration. If you received this, your email settings are working correctly.</p>",
        });

        // Mark as verified
        if (!config.isVerified) {
          await db
            .update(emailConfig)
            .set({ isVerified: true, updatedAt: new Date() })
            .where(eq(emailConfig.id, config.id));
        }

        return { success: true, sentTo: config.fromEmail };
      })
  );
}
