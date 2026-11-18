/**
 * Caption -> ACRA element, per template.
 *
 * The table is data, not inference: guessing a concept by name similarity
 * silently files the wrong line, so an unmapped caption with a non-zero balance
 * is a blocking validation error instead.
 *
 * `mapping-sg-sim.ts` and `mapping-sg-full.ts` hold the rows; `facts.ts` resolves
 * them against `FsModel` (from `lib/reports/fs-model.ts`) plus the caller's notes.
 */
import type { TaxonomyTemplate } from "./types";
import type { ScalarField } from "./types";
import { SG_SIM_MAPPING } from "./mapping-sg-sim";
import { SG_FULL_MAPPING } from "./mapping-sg-full";

/**
 * Where a caption is read from. Balance-sheet groups come from the statement
 * model; note groups come from the caller's note input (same caption shape).
 */
export type StatementGroup =
  | "sfp.currentAssets"
  | "sfp.nonCurrentAssets"
  | "sfp.currentLiabilities"
  | "sfp.nonCurrentLiabilities"
  | "sfp.equity"
  | "is.income"
  | "is.expenses"
  | "note.receivables"
  | "note.payables"
  | "note.revenue"
  | "note.ppe";

/** Caption rows: the element is the sum of its captions, each rounded first. */
export interface CaptionSource {
  kind: "captions";
  group: StatementGroup;
  captions: readonly string[];
  /** Expenses are reported positive; `FsModel` stores them as credits (negative). */
  flip?: boolean;
  /** Read `classNotes` rows for this group instead of the single-period total. */
  classAxis?: string;
}

/** Straight from the filing header (DEI, directors' statement, auditors' report). */
export interface ScalarSource {
  kind: "scalar";
  field: ScalarField;
}

/** Equity columns the statement of changes in equity already splits correctly. */
export interface SoceSource {
  kind: "soce";
  column: "shareCapital" | "retainedEarnings";
}

/** A caller-supplied figure (workpaper line) that has no ledger source. */
export interface ManualSource {
  kind: "manual";
  reason: string;
}

/** A concept this filing cannot carry; the reason is shown in the review table. */
export interface AbsentSource {
  kind: "absent";
  reason: string;
}

/**
 * A calculation total. Its value comes from the taxonomy's own `_cal.xml` arcs
 * (sum of children, weight ±1), so the filing never has to round a total.
 */
export interface DerivedSource {
  kind: "derived";
}

export type MappingSource =
  | CaptionSource
  | ScalarSource
  | SoceSource
  | ManualSource
  | AbsentSource
  | DerivedSource;

export interface MappingRow {
  /** "prefix:LocalName". */
  element: string;
  /** ACRA section (role) the concept belongs to. */
  section: string;
  source: MappingSource;
}

export function mappingFor(template: TaxonomyTemplate): readonly MappingRow[] {
  return template === "sim" ? SG_SIM_MAPPING : SG_FULL_MAPPING;
}

export function countByKind(rows: readonly MappingRow[]): Record<MappingSource["kind"], number> {
  const counts = { captions: 0, scalar: 0, soce: 0, manual: 0, absent: 0, derived: 0 };
  for (const row of rows) counts[row.source.kind] += 1;
  return counts;
}
