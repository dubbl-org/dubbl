"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PersistQueryClientProvider, type Persister } from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { activeOrgId } from "@/lib/query/api";
import { CACHE_MAX_AGE, idbPersister, makeQueryClient } from "@/lib/query/client";
import { routeQueries } from "@/lib/query/routes";
import { FOOTER_MODULES, MODULE_GROUPS } from "./shell/nav";

/** Bump when the shape of cached answers changes, to drop what devices have stored. */
const CACHE_VERSION = "1";

/** Requests that don't change any data, or that report their changes separately (Tilly's tools fire `dubbl:data-changed`). */
const READ_ONLY_POSTS = ["/api/v1/assistant/chat", "/api/v1/search"];

const noopPersister: Persister = {
  persistClient: () => {},
  restoreClient: () => undefined,
  removeClient: () => {},
};

/** Longest a write waits for the screen to refresh before handing back its response anyway. */
const REFRESH_WAIT_MS = 4000;

/**
 * Any successful POST/PUT/PATCH/DELETE to the API marks every cached answer stale:
 * what's on screen refetches at once, everything else when it's next opened. The
 * write's `fetch` resolves only once the screen has its fresh data, so code that
 * awaits a save sees the result of it, as it did when pages reloaded by hand.
 * Doing it at `fetch` means no page has to remember which lists a change touches.
 */
function useStaleOnWrite(client: QueryClient) {
  useEffect(() => {
    const original = window.fetch;
    const refreshScreen = () =>
      Promise.race([
        client.invalidateQueries(),
        new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_MS)),
      ]);

    const isWrite = (input: RequestInfo | URL, init: RequestInit | undefined) => {
      try {
        const request = input instanceof Request ? input : null;
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
        if (method === "GET" || method === "HEAD") return false;
        const url = new URL(request?.url ?? String(input), window.location.origin);
        return (
          url.origin === window.location.origin &&
          url.pathname.startsWith("/api/v1/") &&
          !READ_ONLY_POSTS.some((p) => url.pathname.startsWith(p))
        );
      } catch {
        return false;
      }
    };

    window.fetch = async (input, init) => {
      const res = await original(input, init);
      // Never let cache bookkeeping break a request.
      if (res.ok && isWrite(input, init)) await refreshScreen().catch(() => {});
      return res;
    };
    const onChanged = () => void client.invalidateQueries();
    window.addEventListener("dubbl:data-changed", onChanged);
    return () => {
      window.fetch = original;
      window.removeEventListener("dubbl:data-changed", onChanged);
    };
  }, [client]);
}

/** Start a page's requests as soon as the user points at a link to it, so the click lands on data. */
function usePrefetchOnIntent(client: QueryClient) {
  useEffect(() => {
    let last = "";
    const prefetch = (pathname: string) => {
      for (const queryKey of routeQueries(pathname)) void client.prefetchQuery({ queryKey });
    };
    const onIntent = (e: Event) => {
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      // Hovering re-fires over a link's children; pressing always counts.
      if (e.type === "pointerover" && url.pathname === last) return;
      last = url.pathname;
      prefetch(url.pathname);
    };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("pointerdown", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);

    // Once the app is idle, warm the main sections so the first click on each is instant.
    const warm = () => {
      for (const m of [...MODULE_GROUPS.flat(), ...FOOTER_MODULES]) prefetch(m.href);
    };
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(warm, { timeout: 4000 });

    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("pointerdown", onIntent);
      document.removeEventListener("focusin", onIntent);
      cancelIdle(handle);
    };
  }, [client]);
}

/**
 * The dashboard's data layer: one query cache for every page, saved to this device so
 * the app reopens on its last data, kept fresh in the background, and warmed ahead of
 * clicks. Pages read it with `useApi` / `useApiRecords` from `lib/query/use-api`.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  const [persister] = useState(() => {
    const orgId = activeOrgId();
    return orgId ? idbPersister(orgId) : noopPersister;
  });

  useStaleOnWrite(client);
  usePrefetchOnIntent(client);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE, buster: CACHE_VERSION }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
