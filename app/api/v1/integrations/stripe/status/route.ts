import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration, stripeSyncLog } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { eq, and, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const integration = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.organizationId, ctx.organizationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (!integration) {
      return NextResponse.json({ connected: false });
    }

    // Get recent sync logs
    const logs = await db.query.stripeSyncLog.findMany({
      where: eq(stripeSyncLog.integrationId, integration.id),
      orderBy: desc(stripeSyncLog.createdAt),
      limit: 20,
    });

    return NextResponse.json({
      connected: true,
      status: integration.status,
      stripeAccountId: integration.stripeAccountId,
      livemode: integration.livemode,
      lastSyncAt: integration.lastSyncAt,
      initialSyncCompleted: integration.initialSyncCompleted,
      initialSyncDays: integration.initialSyncDays,
      errorMessage: integration.errorMessage,
      clearingAccountId: integration.clearingAccountId,
      revenueAccountId: integration.revenueAccountId,
      feesAccountId: integration.feesAccountId,
      payoutBankAccountId: integration.payoutBankAccountId,
      syncLogs: logs,
    });
  } catch (err) {
    return handleError(err);
  }
}
