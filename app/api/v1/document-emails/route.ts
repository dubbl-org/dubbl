import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentEmailLog } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get("documentType");
    const documentId = searchParams.get("documentId");

    if (!documentType || !documentId) {
      return NextResponse.json(
        { error: "documentType and documentId are required" },
        { status: 400 }
      );
    }

    const emails = await db.query.documentEmailLog.findMany({
      where: and(
        eq(documentEmailLog.organizationId, ctx.organizationId),
        eq(documentEmailLog.documentType, documentType),
        eq(documentEmailLog.documentId, documentId)
      ),
      orderBy: desc(documentEmailLog.sentAt),
    });

    return NextResponse.json({ emails });
  } catch (err) {
    return handleError(err);
  }
}
