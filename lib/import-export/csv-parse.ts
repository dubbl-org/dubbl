/**
 * Pure CSV helpers shared by the import wizard (browser), the import routes
 * and the MCP import tool. No DB access.
 */

/**
 * Parse CSV text into rows of fields (RFC 4180): quoted fields may contain
 * commas, line breaks and doubled quotes (""), CRLF/LF line endings, a leading
 * byte-order mark is dropped and blank lines are skipped. Also accepts
 * semicolon- or tab-separated files when the header row has no commas.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = firstLine.includes(",") ? "," : firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/**
 * Parse CSV text into header-keyed objects (first row = headers). Missing
 * trailing fields become "".
 */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const [headers = [], ...data] = parseCsv(text);
  return {
    headers,
    rows: data.map((values) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? "";
      });
      return row;
    }),
  };
}

/**
 * Group import rows into documents by a key (e.g. the invoice number), keeping
 * file order. Rows without a key each become their own document. Each group
 * carries the 1-based row numbers of its rows.
 */
export function groupRowsByKey<T>(
  rows: T[],
  keyOf: (row: T) => string | null | undefined,
  rowNumbers?: number[]
): { key: string; rows: T[]; rowNumbers: number[] }[] {
  const groups = new Map<string, { key: string; rows: T[]; rowNumbers: number[] }>();
  rows.forEach((row, i) => {
    const n = rowNumbers?.[i] ?? i + 1;
    const raw = keyOf(row)?.trim();
    const key = raw ? `k:${raw}` : `row:${n}`;
    const g = groups.get(key) ?? { key: raw || `row ${n}`, rows: [], rowNumbers: [] };
    g.rows.push(row);
    g.rowNumbers.push(n);
    groups.set(key, g);
  });
  return [...groups.values()];
}

/** "Row 4" or "Rows 4-6" (or "Rows 4, 7") for messages about a group. */
export function describeRows(rowNumbers: number[]): string {
  if (rowNumbers.length === 1) return `Row ${rowNumbers[0]}`;
  const contiguous = rowNumbers.every((n, i) => i === 0 || n === rowNumbers[i - 1] + 1);
  return contiguous
    ? `Rows ${rowNumbers[0]}-${rowNumbers[rowNumbers.length - 1]}`
    : `Rows ${rowNumbers.join(", ")}`;
}
