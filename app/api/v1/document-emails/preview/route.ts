import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { renderDocumentEmailHtml } from "@/lib/email/render-document-email";
import type { DocumentSentEmailProps } from "@/lib/email/render-document-email";

export async function POST(request: Request) {
  try {
    await getAuthContext(request);

    const body: DocumentSentEmailProps = await request.json();
    const html = await renderDocumentEmailHtml(body);

    return NextResponse.json({ html });
  } catch (err) {
    return handleError(err);
  }
}
