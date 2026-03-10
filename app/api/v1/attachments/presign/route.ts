import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attachment } from "@/lib/db/schema";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { getUploadUrl } from "@/lib/s3";
import { nanoid } from "nanoid";
import { z } from "zod";

const presignSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().positive(),
  journalEntryId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = presignSchema.parse(body);

    const fileKey = `${ctx.organizationId}/${nanoid()}/${parsed.fileName}`;
    const uploadUrl = await getUploadUrl(fileKey, parsed.contentType);

    const [att] = await db
      .insert(attachment)
      .values({
        organizationId: ctx.organizationId,
        journalEntryId: parsed.journalEntryId || null,
        fileName: parsed.fileName,
        fileKey,
        fileSize: parsed.fileSize,
        mimeType: parsed.contentType,
        uploadedBy: ctx.userId,
      })
      .returning();

    return NextResponse.json({ uploadUrl, attachment: att }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
