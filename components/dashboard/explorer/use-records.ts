"use client";

import { useEffect, useRef, useState } from "react";
import { useApiRecords } from "@/lib/query/use-api";

/**
 * Loads every record behind a list endpoint (up to 5,000) so the explorer can
 * search, filter, group and total instantly in the browser. Lists come from the
 * shared cache: a list opened before shows at once and refreshes behind the scenes.
 */
export function useRecords<T>(endpoint: string, params?: Record<string, string>, select?: (json: unknown) => T[], refreshKey?: unknown) {
  const query = new URLSearchParams(params ?? {}).toString();
  const url = query ? `${endpoint}?${query}` : endpoint;
  // `select` is expected to be stable for the page's lifetime.
  const [stableSelect] = useState(() => select);
  const { data, rows, total, truncated, loading, error, refetch } = useApiRecords<T>(url, stableSelect);

  // A changed `refreshKey` asks for fresh rows (the cache already refreshes after any change made in the app).
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== firstKey.current) void refetch();
  }, [refreshKey, refetch]);

  return {
    rows,
    loading,
    // A failed background refresh keeps the rows already showing.
    error: error && data === undefined ? "We couldn't load this list. Check your connection and try again." : null,
    total,
    truncated,
    refresh: () => void refetch(),
  };
}
