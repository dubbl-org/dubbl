import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseItem, expenseClaim } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { getDownloadUrl, isOrgOwnedKey } from "@/lib/s3";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

// Presigns a receipt download. The fileKey is resolved against the caller's
// organization via the expense line item that owns it — a bare key would
// allow presigned reads of arbitrary objects in the bucket (other orgs'
// documents, backups, etc.).
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");

    if (!fileKey) {
      return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
    }

    const [row] = await db
      .select({ fileName: expenseItem.receiptFileName })
      .from(expenseItem)
      .innerJoin(expenseClaim, eq(expenseItem.expenseClaimId, expenseClaim.id))
      .where(
        and(
          eq(expenseItem.receiptFileKey, fileKey),
          eq(expenseClaim.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // The expense row proves the key is *claimed* by this org, not that it is
    // stored under it: receiptFileKey is client-supplied. Require the org prefix.
    if (!isOrgOwnedKey(fileKey, ctx.organizationId)) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const ext = (row.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
    const downloadUrl = await getDownloadUrl(fileKey, 300, { contentType: EXT_MIME[ext] });
    return NextResponse.json({ downloadUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
