export interface StripeCsvPayment {
  id: string;
  description: string;
  sellerMessage: string;
  createdUtc: string;
  amount: number; // in cents
  fee: number; // in cents
  net: number; // in cents
  currency: string;
  status: string;
  customerEmail: string | null;
  customerName: string | null;
}

export interface StripeCsvPayout {
  id: string;
  arrivalDate: string;
  amount: number; // in cents
  currency: string;
  status: string;
  description: string;
}

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function decimalToCents(value: string): number {
  if (!value || value === "") return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  return Math.round(parseFloat(cleaned) * 100);
}

export function parseStripePaymentsCsv(text: string): StripeCsvPayment[] {
  const rows = parseCsvRows(text);
  return rows
    .filter((r) => r["id"] && r["id"].startsWith("ch_"))
    .map((r) => ({
      id: r["id"],
      description: r["Description"] || "",
      sellerMessage: r["Seller Message"] || "",
      createdUtc: r["Created (UTC)"] || r["Created date (UTC)"] || "",
      amount: decimalToCents(r["Amount"] || "0"),
      fee: decimalToCents(r["Fee"] || "0"),
      net: decimalToCents(r["Net"] || "0"),
      currency: (r["Currency"] || "usd").toUpperCase(),
      status: r["Status"] || "",
      customerEmail: r["Customer Email"] || r["Customer email"] || null,
      customerName: r["Customer Name"] || r["Customer name"] || null,
    }));
}

export function parseStripePayoutsCsv(text: string): StripeCsvPayout[] {
  const rows = parseCsvRows(text);
  return rows
    .filter((r) => r["id"] && r["id"].startsWith("po_"))
    .map((r) => ({
      id: r["id"],
      arrivalDate: r["Arrival Date"] || r["Arrival date"] || "",
      amount: decimalToCents(r["Amount"] || "0"),
      currency: (r["Currency"] || "usd").toUpperCase(),
      status: r["Status"] || "",
      description: r["Description"] || "",
    }));
}
