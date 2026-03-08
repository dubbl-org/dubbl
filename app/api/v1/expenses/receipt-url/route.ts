import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { getDownloadUrl } from "@/lib/s3";

export async function GET(request: Request) {
  try {
    await getAuthContext(request);
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");

    if (!fileKey) {
      return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
    }

    const downloadUrl = await getDownloadUrl(fileKey);
    return NextResponse.json({ downloadUrl });
  } catch (err) {
    return handleError(err);
  }
}
