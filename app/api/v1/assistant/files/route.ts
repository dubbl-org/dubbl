import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { checkStorageLimit } from "@/lib/api/check-limit";
import { created, error, handleError, validationError } from "@/lib/api/response";
import { putObject } from "@/lib/s3";
import { ACCEPTED_TYPES, IMAGE_TYPES, MAX_FILE_BYTES, MAX_IMAGE_BYTES, normaliseType } from "@/lib/assistant/files";

/**
 * Upload a file for Tilly to read (a receipt, bill, invoice or statement).
 *
 * POST multipart/form-data with a `file` field.
 * Returns { file: { documentId, fileName, mimeType, fileSize } }. The file is
 * stored in Documents, so it can be linked to whatever Tilly books from it.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return validationError("Attach a file in the `file` field");

    const fileName = file.name.replace(/[/\\\u0000-\u001f]/g, "_").slice(0, 200) || "upload";
    const mimeType = normaliseType(fileName, file.type);
    if (!ACCEPTED_TYPES.includes(mimeType)) {
      return validationError("Tilly can read PDFs, images (PNG, JPG, WebP, GIF) and CSV or text files");
    }
    const limit = IMAGE_TYPES.includes(mimeType) ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size > limit) return validationError(`That file is too large. The limit is ${limit / 1024 / 1024} MB.`);
    if (file.size === 0) return validationError("That file is empty");

    await checkStorageLimit(ctx.organizationId, file.size);

    const fileKey = `documents/${ctx.organizationId}/tilly/${randomUUID()}-${fileName}`;
    try {
      await putObject(fileKey, new Uint8Array(await file.arrayBuffer()), mimeType);
    } catch (err) {
      console.error("Tilly upload failed:", err);
      return error("File storage isn't reachable right now, so the file couldn't be saved.", 503);
    }

    const [doc] = await db
      .insert(document)
      .values({
        organizationId: ctx.organizationId,
        fileName,
        fileKey,
        fileSize: file.size,
        mimeType,
        visibility: "organization",
        uploadedBy: ctx.userId,
      })
      .returning();

    return created({ file: { documentId: doc.id, fileName: doc.fileName, mimeType: doc.mimeType, fileSize: doc.fileSize } });
  } catch (err) {
    return handleError(err);
  }
}
