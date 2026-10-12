"use client";

import { useCallback, useEffect, useState } from "react";

const PAGE = 100;
const MAX_PAGES = 50;

interface Page<T> {
  rows: T[];
  total: number;
  totalPages: number;
}

async function fetchPage<T>(url: string, orgId: string, select: (json: unknown) => T[]): Promise<Page<T>> {
  const res = await fetch(url, { headers: { "x-organization-id": orgId } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = (await res.json()) as { pagination?: { total?: number; totalPages?: number } };
  const rows = select(json);
  return {
    rows,
    total: json.pagination?.total ?? rows.length,
    totalPages: json.pagination?.totalPages ?? 1,
  };
}

const defaultSelect = (json: unknown) => ((json as { data?: unknown[] }).data ?? []) as never[];

/**
 * Loads every record behind a list endpoint (up to 5,000) so the explorer can
 * search, filter, group and total instantly in the browser.
 */
export function useRecords<T>(endpoint: string, params?: Record<string, string>, select?: (json: unknown) => T[], refreshKey?: unknown) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0);
  const paramKey = JSON.stringify(params ?? {});

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const pick = select ?? (defaultSelect as (json: unknown) => T[]);
    const url = (page: number) => {
      const q = new URLSearchParams({ ...(JSON.parse(paramKey) as Record<string, string>), page: String(page), limit: String(PAGE) });
      return `${endpoint}?${q}`;
    };

    (async () => {
      try {
        const first = await fetchPage(url(1), orgId, pick);
        const pages = Math.min(first.totalPages, MAX_PAGES);
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pages - 1) }, (_, i) => fetchPage(url(i + 2), orgId, pick))
        );
        if (cancelled) return;
        setRows([...first.rows, ...rest.flatMap((p) => p.rows)]);
        setTotal(first.total);
        setError(null);
      } catch {
        if (!cancelled) setError("We couldn't load this list. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `select` is expected to be stable for the page's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, paramKey, version, refreshKey]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { rows, loading, error, total, truncated: total > rows.length, refresh };
}
