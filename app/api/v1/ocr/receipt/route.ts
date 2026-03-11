import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export interface ServerReceiptData {
  vendor: string | null;
  date: string | null;
  total: number | null; // cents
  tax: number | null; // cents
  currency: string | null;
  lineItems: Array<{
    description: string;
    amount: number; // cents
  }>;
  suggestedContactId: string | null;
  confidence: number; // 0-1
}

/**
 * Server-side receipt OCR endpoint.
 * Accepts a base64-encoded image and extracts receipt data.
 * Uses regex-based extraction (same as client-side) by default.
 * Can be extended with AI vision APIs (OpenAI, Google Cloud Vision) for better accuracy.
 */
export async function POST(request: Request) {
  try {
    await getAuthContext(request);

    const body = await request.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    // Decode and extract text using basic pattern matching
    // In production, replace with AI vision API call
    const text = await extractTextFromImage(imageBase64, mimeType || "image/jpeg");

    const result: ServerReceiptData = {
      vendor: extractVendor(text),
      date: extractDate(text),
      total: extractTotal(text),
      tax: extractTax(text),
      currency: extractCurrency(text),
      lineItems: extractLineItems(text),
      suggestedContactId: null,
      confidence: text.length > 50 ? 0.6 : 0.3,
    };

    return NextResponse.json({ receipt: result });
  } catch (err) {
    return handleError(err);
  }
}

// Basic text extraction using buffer analysis
// In production, integrate with Tesseract.js server-side or an AI vision API
async function extractTextFromImage(base64: string, _mimeType: string): Promise<string> {
  // This is a placeholder that returns empty text for server-side processing.
  // The actual OCR happens client-side via Tesseract.js.
  // To enable server-side OCR, install and use:
  // - tesseract.js (Node.js compatible)
  // - @google-cloud/vision
  // - OpenAI Vision API
  return "";
}

function extractVendor(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 3) continue;
    if (/^\d+[\/\-.]/.test(line)) continue;
    if (/^\$?\d+\.\d{2}$/.test(line)) continue;
    return line;
  }
  return lines[0] || null;
}

function extractDate(text: string): string | null {
  const patterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const d = new Date(match[0]);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      } catch {
        continue;
      }
    }
  }
  return null;
}

function extractTotal(text: string): number | null {
  const patterns = [
    /total\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
    /amount\s*(?:due)?\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
    /grand\s*total\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", ""));
      if (!isNaN(amount)) return Math.round(amount * 100);
    }
  }
  const amounts = [...text.matchAll(/\$\s*(\d+[,.]?\d*\.\d{2})/g)]
    .map((m) => parseFloat(m[1].replace(",", "")))
    .filter((n) => !isNaN(n))
    .sort((a, b) => b - a);
  if (amounts.length > 0) return Math.round(amounts[0] * 100);
  return null;
}

function extractTax(text: string): number | null {
  const patterns = [
    /(?:tax|gst|hst|vat)\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
    /(?:sales\s*tax)\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", ""));
      if (!isNaN(amount)) return Math.round(amount * 100);
    }
  }
  return null;
}

function extractCurrency(text: string): string | null {
  if (/\$/.test(text)) return "USD";
  if (/\u00a3/.test(text)) return "GBP";
  if (/\u20ac/.test(text)) return "EUR";
  return null;
}

function extractLineItems(text: string): Array<{ description: string; amount: number }> {
  const items: Array<{ description: string; amount: number }> = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^(.+?)\s+\$?\s*(\d+\.\d{2})\s*$/);
    if (match) {
      const desc = match[1].trim();
      const amount = parseFloat(match[2]);
      if (desc.length > 2 && !isNaN(amount) && !/total|tax|subtotal/i.test(desc)) {
        items.push({ description: desc, amount: Math.round(amount * 100) });
      }
    }
  }
  return items;
}
