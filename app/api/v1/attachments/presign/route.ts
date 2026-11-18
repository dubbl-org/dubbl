import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attachment } from "@/lib/db/schema";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { getUploadUrl, validateUpload } from "@/lib/s3";
import { rateLimit, clientIp } from "@/lib/api/rate-limit";
import { nanoid } from "nanoid";
import { checkStorageLimit, LimitExceededError } from "@/lib/api/check-limit";
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
    if (!rateLimit(`presign:${ctx.organizationId}`, 60)) {
      return NextResponse.json({ error: "Too many uploads, try again later" }, { status: 429 });
    }
    const body = await request.json();
    const parsed = presignSchema.parse(body);

    const uploadError = validateUpload(parsed.contentType, parsed.fileSize);
    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 });
    }

    await checkStorageLimit(ctx.organizationId, parsed.fileSize);

    const fileKey = `${ctx.organizationId}/${nanoid()}/${parsed.fileName}`;
    // Signing ContentLength binds the upload to the declared size: the storage
    // provider rejects the PUT if the browser sends a different body length.
    const uploadUrl = await getUploadUrl(fileKey, parsed.contentType, parsed.fileSize);

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
    if (err instanceof LimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
