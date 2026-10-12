import type { ReactNode } from "react";

export interface ExplorerStatus {
  value: string;
  label: string;
  /** Hex colour for the dot, the status bar and the chart. */
  color: string;
  hint?: string;
}

export interface ExplorerColumn<T> {
  key: string;
  label: string;
  hint?: string;
  /** Raw value used for sorting, search and CSV. Money columns return cents. */
  value?: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Width and other cell classes, e.g. "w-32". */
  className?: string;
  /** Integer cents: rendered as money and totalled in the footer. */
  money?: boolean;
  /** Leave this money column out of the footer total (unit prices, limits). */
  noTotal?: boolean;
  /** Hidden until switched on in the Columns menu. */
  hidden?: boolean;
  sortable?: boolean;
  csv?: (row: T) => string | number | null | undefined;
}

export interface ExplorerMetric {
  key: string;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  color: string;
  hint?: string;
  /** Clicking the metric filters to this status. */
  status?: string;
}

export interface ExplorerFacet<T> {
  key: string;
  label: string;
  value: (row: T) => string | null | undefined;
}

export interface ExplorerHelpers {
  refresh: () => void;
  clearSelection: () => void;
}

export interface ExplorerConfig<T> {
  /** Stable id for remembering the view (columns, density, sort). */
  id: string;
  endpoint: string;
  params?: Record<string, string>;
  /** Pull the rows out of one page of the API response. Defaults to `json.data`. */
  select?: (json: unknown) => T[];
  noun: { one: string; many: string };
  getId: (row: T) => string;
  href?: (row: T) => string;
  status?: { get: (row: T) => string; options: ExplorerStatus[] };
  date?: { get: (row: T) => string | null | undefined; label: string };
  party?: { get: (row: T) => string | null | undefined; label: string; many: string };
  /** Weight in cents for the status bar, chart and top list. */
  amount?: (row: T) => number;
  amountLabel?: string;
  currency?: (row: T) => string | null | undefined;
  search: (row: T) => (string | null | undefined)[];
  columns: ExplorerColumn<T>[];
  facets?: ExplorerFacet<T>[];
  metrics?: (rows: T[]) => ExplorerMetric[];
  bulkActions?: (selected: T[], helpers: ExplorerHelpers) => ReactNode;
  preview?: (row: T, helpers: ExplorerHelpers) => ReactNode;
  create?: { label: string; onClick: () => void };
  /** Extra buttons in the heading, next to Export. */
  actions?: ReactNode;
  /** Set to false to hide the month chart even when date and amount exist. */
  chart?: boolean;
  /** Shown instead of the explorer when there are no records at all. */
  empty?: ReactNode;
  defaultSort?: { key: string; dir: "asc" | "desc" };
}
