import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { preProcessEntries } from "@/lib/import-export/pre-process";
import { parseMoney } from "@/lib/import-export/transformers";
import type { SourceSystem } from "@/lib/import-export/types";
import { z } from "zod";

const rowSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  lineAccountCode: z.string().min(1),
  debit: z.coerce.string().optional(),
  credit: z.coerce.string().optional(),
  reference: z.string().optional(),
  entryNumber: z.coerce.string().optional(),
});

export async function POST(request: Request) {
  try {
    await getAuthContext(request);
    const body = await request.json();
    const source = (body.source || "custom") as SourceSystem;
    const rawRows = z.array(z.record(z.string(), z.unknown())).parse(body.rows || []);
    const rows = preProcessEntries(rawRows, source);

    const preview = rows.map((row, i) => {
      const result = rowSchema.safeParse(row);
      return {
        row: i + 1,
        data: row,
        valid: result.success,
        errors: result.success ? [] : result.error.issues.map(e => e.message),
        parsed: result.success ? result.data : null,
      };
    });

    // Group the valid rows into entries exactly as the import route does
    // (by entryNumber, falling back to date|description) so users can see
    // which entries balance before importing.
    type Group = { key: string; rows: number; totalDebit: number; totalCredit: number };
    const groupOrder: string[] = [];
    const groups = new Map<string, Group>();
    for (const p of preview) {
      if (!p.parsed) continue;
      const r = p.parsed;
      const key = r.entryNumber || `${r.date}|${r.description}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, rows: 0, totalDebit: 0, totalCredit: 0 };
        groups.set(key, g);
        groupOrder.push(key);
      }
      g.rows += 1;
      g.totalDebit += parseMoney(r.debit || "0");
      g.totalCredit += parseMoney(r.credit || "0");
    }

    // Per-entry balance summary. imbalance and totals are in integer cents.
    const entries = groupOrder.map((key) => {
      const g = groups.get(key)!;
      const imbalance = g.totalDebit - g.totalCredit;
      const balanced = imbalance === 0 && g.totalDebit !== 0 && g.rows >= 2;
      return {
        entryKey: key,
        lineCount: g.rows,
        totalDebit: g.totalDebit,
        totalCredit: g.totalCredit,
        imbalance,
        balanced,
      };
    });

    return NextResponse.json({
      preview,
      entries,
      validCount: preview.filter(p => p.valid).length,
      totalCount: rows.length,
      balancedEntryCount: entries.filter(e => e.balanced).length,
      unbalancedEntryCount: entries.filter(e => !e.balanced).length,
    });
  } catch (err) {
    return handleError(err);
  }
}
