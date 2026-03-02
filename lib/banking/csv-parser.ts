import { decimalToCents } from "@/lib/money";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number; // cents
  reference?: string;
}

/**
 * Parse a bank CSV file into an array of transactions.
 * Supports common CSV formats:
 * - Date, Description, Amount
 * - Date, Description, Debit, Credit
 * - Date, Description, Amount, Balance
 * - Date, Reference, Description, Debit, Credit
 */
export function parseBankCSV(csvText: string): ParsedTransaction[] {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row");
  }

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1).map(parseCSVLine);

  // Detect column indices
  const dateIdx = findColumnIndex(header, ["date", "transaction date", "trans date", "posting date"]);
  const descIdx = findColumnIndex(header, ["description", "desc", "memo", "narrative", "details", "particulars"]);
  const amountIdx = findColumnIndex(header, ["amount", "value", "sum"]);
  const debitIdx = findColumnIndex(header, ["debit", "debit amount", "withdrawals", "withdrawal"]);
  const creditIdx = findColumnIndex(header, ["credit", "credit amount", "deposits", "deposit"]);
  const refIdx = findColumnIndex(header, ["reference", "ref", "check number", "cheque number", "transaction id"]);

  if (dateIdx === -1) {
    throw new Error("Could not find a date column in the CSV header");
  }
  if (descIdx === -1 && amountIdx === -1 && debitIdx === -1) {
    throw new Error("Could not find description or amount columns in the CSV header");
  }

  const transactions: ParsedTransaction[] = [];

  for (const row of rows) {
    if (row.length === 0 || row.every((c) => !c.trim())) continue;

    const rawDate = row[dateIdx]?.trim();
    if (!rawDate) continue;

    const date = normalizeDate(rawDate);
    const description = descIdx !== -1 ? row[descIdx]?.trim() || "" : "";
    const reference = refIdx !== -1 ? row[refIdx]?.trim() || undefined : undefined;

    let amount: number;

    if (amountIdx !== -1) {
      // Single amount column
      amount = parseAmount(row[amountIdx]);
    } else if (debitIdx !== -1 && creditIdx !== -1) {
      // Separate debit/credit columns
      const debit = parseAmount(row[debitIdx]);
      const credit = parseAmount(row[creditIdx]);
      amount = credit - debit;
    } else if (debitIdx !== -1) {
      amount = -parseAmount(row[debitIdx]);
    } else {
      continue; // Skip rows without amount data
    }

    if (amount === 0 && !description) continue;

    transactions.push({ date, description, amount, reference });
  }

  return transactions;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  // Try partial match
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  return decimalToCents(cleaned);
}

function normalizeDate(raw: string): string {
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD/MM/YYYY or MM/DD/YYYY
  const slashParts = raw.split(/[/\-.]/);
  if (slashParts.length === 3) {
    const [a, b, c] = slashParts.map(Number);
    // If first part > 12, assume DD/MM/YYYY
    if (a > 12 && c >= 1900) {
      return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    // If third part is a 4-digit year
    if (c >= 1900) {
      return `${c}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    }
    // If first part is a 4-digit year
    if (a >= 1900) {
      return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
    }
    // 2-digit year
    const year = c < 100 ? c + 2000 : c;
    return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }

  // Fallback: try Date parse
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  return raw;
}
