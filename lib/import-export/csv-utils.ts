/**
 * Convert integer cents to decimal string for export.
 */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Escape a CSV field value. Wraps in quotes if the value contains
 * commas, quotes, or newlines.
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a CSV string from an array of row objects.
 */
export function generateCSV(
  rows: Record<string, unknown>[],
  columns: string[]
): string {
  const header = columns.map(escapeCSV).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => escapeCSV(row[col])).join(",")
  );
  return [header, ...lines].join("\n");
}
