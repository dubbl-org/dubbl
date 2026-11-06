"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { keepPreviousData, useQueries, useQuery, useQueryClient, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import { apiKey, isApiKey, recordsKey, type ApiKey } from "./client";
import { learnRouteQuery } from "./routes";

interface UseApiOptions {
  /** Keep showing the last answer while a new URL (filter, page, period) loads, instead of going back to loading. */
  keepPrevious?: boolean;
  /** Poll every n ms while the page is open. */
  refetchInterval?: number;
  /** Don't remember this request as part of the page (for requests that follow typing). */
  learn?: boolean;
}

export interface ApiResult<T> {
  /** The cached or fetched JSON; `undefined` until there's an answer. */
  data: T | undefined;
  error: Error | null;
  /** Nothing to show yet: no cached answer and the first request is in flight. Never true for a disabled (`null` url) query. */
  loading: boolean;
  /** A background refresh is running behind data that's already showing. */
  refreshing: boolean;
  /** Fetch again now; resolves when the new answer is in. */
  refetch: () => Promise<unknown>;
}

const DISABLED: ApiKey = ["api", ""];

function useApiQuery<T>(key: ApiKey | null, options: UseApiOptions) {
  const pathname = usePathname();
  const enabled = key !== null;
  const query = useQuery<unknown, Error, unknown, QueryKey>({
    queryKey: key ?? DISABLED,
    enabled,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    refetchInterval: options.refetchInterval,
  });

  const learn = options.learn !== false;
  const id = key ? JSON.stringify(key) : null;
  useEffect(() => {
    if (key && learn) learnRouteQuery(pathname, key);
    // `id` stands for `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pathname, learn]);

  return {
    data: query.data as T | undefined,
    error: query.error,
    loading: enabled && query.isPending,
    refreshing: query.isFetching && !query.isPending,
    refetch: query.refetch,
  };
}

/**
 * GET an org-scoped API route through the shared cache. A page that was opened before
 * renders its last data immediately and refreshes it in the background; any
 * POST/PUT/PATCH/DELETE to `/api/v1` marks the cache stale, so there's nothing to
 * invalidate by hand. Pass `null` to wait (e.g. until an id is known).
 *
 *   const { data, loading, error } = useApi<{ invoice: Invoice }>(`/api/v1/invoices/${id}`);
 */
export function useApi<T = unknown>(url: string | null | undefined | false, options: UseApiOptions = {}): ApiResult<T> {
  return useApiQuery<T>(url ? apiKey(url) : null, options);
}

export interface ApisResult<T> {
  /** One answer per URL, in order; `undefined` until that one is in. */
  data: (T | undefined)[];
  /** At least one URL has no answer yet. */
  loading: boolean;
  /** The first failure, if any. */
  error: Error | null;
}

// Module-level so TanStack keeps the combined result stable between renders.
const combineApis = (results: UseQueryResult<unknown>[]): ApisResult<unknown> => ({
  data: results.map((r) => r.data),
  loading: results.some((r) => r.isPending),
  error: results.find((r) => r.error)?.error ?? null,
});

/**
 * `useApi` for a list of URLs that changes with the data (one request per loan,
 * per period, per employee), fetched in parallel through the same cache.
 *
 *   const schedules = useApis<{ schedule: Entry[] }>(loans.map((l) => `/api/v1/loans/${l.id}`));
 */
export function useApis<T = unknown>(urls: string[], options: Pick<UseApiOptions, "keepPrevious" | "learn"> = {}): ApisResult<T> {
  const pathname = usePathname();
  const result = useQueries({
    queries: urls.map((url) => ({
      queryKey: apiKey(url) as QueryKey,
      placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    })),
    combine: combineApis,
  });

  const learn = options.learn !== false;
  const id = JSON.stringify(urls);
  useEffect(() => {
    if (learn) for (const url of urls) learnRouteQuery(pathname, apiKey(url));
    // `id` stands for `urls`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pathname, learn]);

  return result as ApisResult<T>;
}

/**
 * Every row behind a paginated list route (`{ data, pagination }`, up to 5,000), cached
 * like `useApi`. `select` picks rows out of each page's JSON (default: `json.data`) and
 * must be stable (module-level or memoized).
 */
export function useApiRecords<T>(
  url: string | null | undefined | false,
  select?: (json: unknown) => T[],
  options: UseApiOptions = {}
) {
  const result = useApiQuery<unknown[]>(url ? recordsKey(url) : null, options);
  const pages = result.data;
  const { rows, total } = useMemo(() => {
    if (!pages) return { rows: [] as T[], total: 0 };
    const pick = select ?? ((json: unknown) => ((json as { data?: T[] }).data ?? []) as T[]);
    const rows = pages.flatMap(pick);
    const first = pages[0] as { pagination?: { total?: number } } | undefined;
    return { rows, total: first?.pagination?.total ?? rows.length };
  }, [pages, select]);
  return { ...result, rows, total, truncated: total > rows.length };
}

/**
 * Read and write cached answers directly, for optimistic updates: change what's on
 * screen first, then send the request (which refreshes the cache when it lands).
 *
 *   const cache = useApiCache();
 *   cache.update<{ invoice: Invoice }>(`/api/v1/invoices/${id}`, (d) => ({ invoice: { ...d.invoice, status: "sent" } }));
 */
export function useApiCache() {
  const client = useQueryClient();
  return useMemo(
    () => ({
      get: <T>(url: string) => client.getQueryData<T>(apiKey(url)),
      set: <T>(url: string, data: T) => client.setQueryData<T>(apiKey(url), data),
      update: <T>(url: string, fn: (data: T) => T) =>
        client.setQueryData<T>(apiKey(url), (old) => (old === undefined ? old : fn(old))),
      /** Edit the rows of a cached `useApiRecords` list (each page's `data`). */
      updateRows: <T>(url: string, fn: (rows: T[]) => T[]) =>
        client.setQueryData<unknown[]>(recordsKey(url), (pages) =>
          pages?.map((page) => {
            const p = page as { data?: T[] };
            return p.data ? { ...p, data: fn(p.data) } : page;
          })
        ),
      /** Stop refreshes in flight for a URL, so they can't overwrite an optimistic edit. */
      cancel: (url: string) =>
        client.cancelQueries({ predicate: (q) => isApiKey(q.queryKey) && q.queryKey[1] === url }),
      /** Start loading a URL before it's needed (e.g. on hover). */
      prefetch: (url: string) => client.prefetchQuery({ queryKey: apiKey(url) }),
      /** Mark cached answers stale and refetch the ones on screen. With no prefix, everything. */
      invalidate: (prefix?: string) =>
        client.invalidateQueries({
          predicate: (q) => !prefix || (isApiKey(q.queryKey) && q.queryKey[1].startsWith(prefix)),
        }),
    }),
    [client]
  );
}
