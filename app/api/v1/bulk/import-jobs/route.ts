import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkImportJob } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    const jobs = await db.query.bulkImportJob.findMany({
      where: eq(bulkImportJob.organizationId, ctx.organizationId),
      orderBy: desc(bulkImportJob.createdAt),
      limit,
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    return handleError(err);
  }
}
