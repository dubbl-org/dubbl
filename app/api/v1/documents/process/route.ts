import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, validationError, handleError } from "@/lib/api/response";
import { getDownloadUrl } from "@/lib/s3";
import { extractReceiptData } from "@/lib/ocr/extract-receipt";
import { z } from "zod";

const processSchema = z.object({
  documentId: z.string().uuid(),
});

/**
 * POST /api/v1/documents/process
 *
 * Runs OCR over an uploaded receipt/document and returns the extracted fields
 * (supplier name, date, total, tax, raw text) so the caller can pre-fill a draft
 * bill. Body: { documentId }. The document is loaded org-scoped; only image
 * documents can be OCR'd. Monetary fields come back in integer minor units
 * (cents). This reuses lib/ocr/extract-receipt.ts (the same extractor the
 * client-side <ReceiptOcr /> widget uses) so behaviour stays consistent across
 * the snap-on-create flow and this inbox flow.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const { documentId } = processSchema.parse(body);

    const doc = await db.query.document.findFirst({
      where: and(
        eq(document.id, documentId),
        eq(document.organizationId, ctx.organizationId),
        notDeleted(document.deletedAt)
      ),
    });

    if (!doc) return notFound("Document");
    if (doc.visibility === "private" && doc.uploadedBy !== ctx.userId) {
      return notFound("Document");
    }

    // OCR only works on raster images. PDFs and other types can't be read by the
    // tesseract.js extractor — surface a clear, plain-language error instead of
    // failing deep inside the OCR engine.
    if (!doc.mimeType.startsWith("image/")) {
      return validationError(
        "We can only read photos of receipts (JPG, PNG). This file isn't an image."
      );
    }

    // Pull the actual file bytes from storage via a short-lived presigned URL
    // (the same download route the rest of the app uses) and hand the raw bytes
    // to the extractor. We pass a Buffer (not a File) because tesseract.js's
    // Node image loader only reads a Buffer/Uint8Array/path/URL — a web File/Blob
    // would be read as zero bytes server-side.
    const downloadUrl = await getDownloadUrl(doc.fileKey);
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      return validationError("Couldn't load the receipt image to read it.");
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const extracted = await extractReceiptData(buffer);

    return ok({
      documentId: doc.id,
      fileName: doc.fileName,
      // Plain-language field names the inbox UI maps straight onto a draft bill.
      // Amounts are integer minor units (cents).
      extraction: {
        supplier: extracted.vendor,
        date: extracted.date,
        total: extracted.total,
        tax: extracted.tax,
        // A short, line-level hint so the user can sanity-check the read. We
        // expose the first few non-empty OCR lines as "line hints" rather than a
        // structured line breakdown (the extractor doesn't parse line items).
        lineHints: extracted.rawText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 8),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
