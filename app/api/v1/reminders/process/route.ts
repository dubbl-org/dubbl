import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { processReminders } from "@/lib/email/reminder-processor";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");

    const results = await processReminders(ctx.organizationId);

    return NextResponse.json(results);
  } catch (err) {
    return handleError(err);
  }
}
