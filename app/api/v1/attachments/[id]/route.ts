import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attachment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { getDownloadUrl, deleteObject } from "@/lib/s3";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const att = await db.query.attachment.findFirst({
      where: and(
        eq(attachment.id, id),
        eq(attachment.organizationId, ctx.organizationId)
      ),
    });

    if (!att) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const downloadUrl = await getDownloadUrl(att.fileKey);
    return NextResponse.json({ attachment: att, downloadUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const att = await db.query.attachment.findFirst({
      where: and(
        eq(attachment.id, id),
        eq(attachment.organizationId, ctx.organizationId)
      ),
    });

    if (!att) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteObject(att.fileKey);
    await db.delete(attachment).where(eq(attachment.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
