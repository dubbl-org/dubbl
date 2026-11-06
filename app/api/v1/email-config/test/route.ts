import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { EmailSettingsError, testEmailSettings } from "@/lib/email/email-settings";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");
    try {
      const { sentTo } = await testEmailSettings(ctx.organizationId);
      return NextResponse.json({ success: true, message: `Test email sent to ${sentTo}` });
    } catch (err) {
      const status = err instanceof EmailSettingsError ? 404 : 400;
      return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Failed to send test email" }, { status });
    }
  } catch (err) {
    return handleError(err);
  }
}
