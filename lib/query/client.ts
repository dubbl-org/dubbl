import { QueryClient, type QueryKey } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { del, get, keys, set } from "idb-keyval";
import { ApiError, apiGet, apiGetAllPages } from "./api";

/**
 * Query keys hold the request itself, so any key can be fetched (or prefetched)
 * without the component that first asked for it:
 * - `["api", url]`: one GET, cached as the raw JSON.
 * - `["records", url]`: every page of a paginated list, cached as the raw pages.
 */
export type ApiKey = readonly ["api", string] | readonly ["records", string];

export const apiKey = (url: string): ApiKey => ["api", url];
export const recordsKey = (url: string): ApiKey => ["records", url];

export function isApiKey(key: QueryKey): key is ApiKey {
  return (key[0] === "api" || key[0] === "records") && typeof key[1] === "string";
}

function fetchKey({ queryKey, signal }: { queryKey: QueryKey; signal: AbortSignal }) {
  if (!isApiKey(queryKey)) throw new Error(`No fetcher for query ${JSON.stringify(queryKey)}`);
  return queryKey[0] === "records" ? apiGetAllPages(queryKey[1], signal) : apiGet(queryKey[1], signal);
}

/** How long a cached answer is kept, in memory and on disk, after its page was last open. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: fetchKey,
        // Anything cached shows at once; older than this, it's refreshed behind it.
        staleTime: 15_000,
        gcTime: CACHE_MAX_AGE,
        refetchOnWindowFocus: true,
        // 4xx answers (not found, no access, bad input) won't change on a retry.
        retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status < 500),
      },
    },
  });
}

const STORE_PREFIX = "dubbl:query:";

/**
 * Keeps the cache in IndexedDB, one entry per organization, so the app opens on
 * the last data it showed instead of a spinner. Writes are coalesced to one a second.
 */
export function idbPersister(orgId: string): Persister {
  const key = `${STORE_PREFIX}${orgId}`;
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    persistClient(client) {
      pending = client;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (pending) void set(key, pending).catch(() => {});
      }, 1000);
    },
    restoreClient: () => get<PersistedClient>(key),
    removeClient: () => del(key),
  };
}

/** Forget every cached answer on this device. Run on sign-out and before a new sign-in. */
export async function clearQueryCache() {
  try {
    const stored = await keys();
    await Promise.all(stored.filter((k) => String(k).startsWith(STORE_PREFIX)).map((k) => del(k)));
  } catch {
    // IndexedDB can be unavailable (private windows); there's nothing stored then.
  }
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("dubbl:routes:")) localStorage.removeItem(k);
  }
}
