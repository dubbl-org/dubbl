import Tesseract from "tesseract.js";

export interface ReceiptData {
  vendor: string | null;
  date: string | null;
  total: number | null; // cents
  tax: number | null; // cents
  rawText: string;
}

export async function extractReceiptData(
  image: File | Blob | Buffer,
  onProgress?: (progress: number) => void
): Promise<ReceiptData> {
  // tesseract.js ships two image loaders. The browser loader reads a File/Blob
  // via FileReader, but the Node loader only understands a Buffer/Uint8Array/path/
  // URL — handed a File/Blob it reads zero bytes and throws "Error attempting to
  // read image". So on the server (where API routes call this) we normalise a
  // File/Blob to a Uint8Array first; in the browser we pass it through untouched
  // because the browser loader needs the original Blob.
  let input: File | Blob | Buffer | Uint8Array = image;
  if (
    typeof window === "undefined" &&
    typeof Blob !== "undefined" &&
    image instanceof Blob
  ) {
    input = new Uint8Array(await image.arrayBuffer());
  }

  const result = await Tesseract.recognize(
    input as Parameters<typeof Tesseract.recognize>[0],
    "eng",
    {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text" && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    }
  );

  const text = result.data.text;
  return {
    vendor: extractVendor(text),
    date: extractDate(text),
    total: extractTotal(text),
    tax: extractTax(text),
    rawText: text,
  };
}

function extractVendor(text: string): string | null {
  // First non-empty line is usually the store/vendor name
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  // Skip very short lines or lines that look like dates/numbers
  for (const line of lines) {
    if (line.length < 3) continue;
    if (/^\d+[\/\-.]/.test(line)) continue; // date-like
    if (/^\$?\d+\.\d{2}$/.test(line)) continue; // amount
    return line;
  }
  return lines[0] || null;
}

function extractDate(text: string): string | null {
  // Common date patterns
  const patterns = [
    // MM/DD/YYYY or MM-DD-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // YYYY-MM-DD
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    // DD/MM/YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    // Month DD, YYYY
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const dateStr = match[0];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10);
        }
        // Try MM/DD/YYYY format
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(dateStr)) {
          const parts = dateStr.split(/[\/\-]/);
          const year =
            parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          const d = new Date(
            `${year}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`
          );
          if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

function extractTotal(text: string): number | null {
  // Look for total-like patterns
  const totalPatterns = [
    /total\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
    /amount\s*(?:due)?\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
    /grand\s*total\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
    /balance\s*(?:due)?\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", ""));
      if (!isNaN(amount)) return Math.round(amount * 100);
    }
  }

  // Fallback: find the largest dollar amount
  const amounts = [...text.matchAll(/\$\s*(\d+[,.]?\d*\.\d{2})/g)]
    .map((m) => parseFloat(m[1].replace(",", "")))
    .filter((n) => !isNaN(n))
    .sort((a, b) => b - a);

  if (amounts.length > 0) return Math.round(amounts[0] * 100);
  return null;
}

function extractTax(text: string): number | null {
  const taxPatterns = [
    /(?:tax|gst|hst|vat)\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
    /(?:sales\s*tax)\s*:?\s*\$?\s*(\d+[,.]?\d*\.\d{2})/i,
  ];

  for (const pattern of taxPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", ""));
      if (!isNaN(amount)) return Math.round(amount * 100);
    }
  }
  return null;
}
