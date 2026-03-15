import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { buildDownloadSnapshot, checkSnapshotRateLimit } from "@/lib/api/backup-snapshot";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:audit-log");

    const { allowed, retryAfter } = await checkSnapshotRateLimit(ctx.organizationId);
    if (!allowed) {
      return NextResponse.json(
        { error: `Snapshot rate limit reached. Try again in ${retryAfter} seconds.` },
        { status: 429 },
      );
    }

    const json = await buildDownloadSnapshot(ctx.organizationId);
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dubbl-snapshot-${date}.json"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
