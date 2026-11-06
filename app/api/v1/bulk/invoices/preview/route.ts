import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { previewInvoiceImport } from "@/lib/import-export/invoice-import";
import type { SourceSystem } from "@/lib/import-export/types";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const source = (body.source || "custom") as SourceSystem;
    const rawRows = z.array(z.record(z.string(), z.unknown())).parse(body.rows || []);
    const preview = await previewInvoiceImport(ctx.organizationId, rawRows, source);

    return NextResponse.json({ preview, validCount: preview.filter(p => p.valid).length, totalCount: preview.length });
  } catch (err) {
    return handleError(err);
  }
}
