import type { z } from "zod";

/**
 * Validate import rows one by one so a single bad row doesn't fail the whole
 * import. Returns the rows that passed (with their 1-based row numbers, the
 * same numbering the preview shows) and an error entry per row that didn't.
 */
export function validateImportRows<S extends z.ZodTypeAny>(
  rows: Record<string, unknown>[],
  schema: S
): {
  rows: z.infer<S>[];
  rowNumbers: number[];
  invalid: { row: number; error: string }[];
} {
  const valid: z.infer<S>[] = [];
  const rowNumbers: number[] = [];
  const invalid: { row: number; error: string }[] = [];
  rows.forEach((raw, i) => {
    const result = schema.safeParse(raw);
    if (result.success) {
      valid.push(result.data);
      rowNumbers.push(i + 1);
    } else {
      invalid.push({
        row: i + 1,
        error: result.error.issues
          .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
          .join("; "),
      });
    }
  });
  return { rows: valid, rowNumbers, invalid };
}
