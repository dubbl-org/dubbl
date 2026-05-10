import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { scan, type Locale } from "@dubbl/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

interface ScanRequestBody {
  imageBase64?: string;
  mimeType?: string;
  locale?: string;
}

/**
 * Server-side receipt OCR endpoint.
 * Accepts a base64-encoded image and runs deterministic Tesseract OCR via @dubbl/ocr.
 * Returns the rich field set (vendor, date, total, subtotal, tax, currency, line items, etc.)
 * with per-field confidence scores so the caller can build a confirmation flow.
 */
export async function POST(request: Request) {
  try {
    await getAuthContext(request);

    const body = (await request.json()) as ScanRequestBody;
    const { imageBase64, locale } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const stripped = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");
    const buffer = Buffer.from(stripped, "base64");
    if (buffer.byteLength === 0) {
      return NextResponse.json(
        { error: "imageBase64 is empty or invalid" },
        { status: 400 }
      );
    }
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `Image too large (max ${MAX_BYTES} bytes)` },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(buffer);
    const result = await scan(bytes, {
      locale: (locale as Locale) ?? "en-US",
      rawInput: true,
    });

    return NextResponse.json({
      receipt: {
        vendor: result.fields.vendor.value,
        date: result.fields.date.value,
        total: result.fields.total.value,
        subtotal: result.fields.subtotal.value,
        tax: result.fields.tax.value,
        taxRate: result.fields.taxRate.value,
        currency: result.fields.currency.value,
        paymentMethod: result.fields.paymentMethod.value,
        receiptNumber: result.fields.receiptNumber.value,
        lineItems: result.fields.lineItems.map((li) => ({
          description: li.description.value,
          quantity: li.quantity.value,
          unitPrice: li.unitPrice.value,
          amount: li.amount.value,
        })),
        fieldConfidence: {
          vendor: result.fields.vendor.confidence,
          date: result.fields.date.confidence,
          total: result.fields.total.confidence,
          subtotal: result.fields.subtotal.confidence,
          tax: result.fields.tax.confidence,
          taxRate: result.fields.taxRate.confidence,
          currency: result.fields.currency.confidence,
          paymentMethod: result.fields.paymentMethod.confidence,
          receiptNumber: result.fields.receiptNumber.confidence,
        },
        overallConfidence: result.overallConfidence,
        warnings: result.warnings,
        rawText: result.text,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
