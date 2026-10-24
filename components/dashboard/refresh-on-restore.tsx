"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-validate the current screen when the browser restores it.
 *
 * Back and forward replay a cached tree instead of asking the server, so a page
 * you return to shows the numbers from when you left it — even if someone
 * recorded a payment in between. A refresh re-runs the server components in
 * place: no reload, no lost filters or scroll, and `useServerSeeded` carries the
 * new payload into the screen.
 */
export function RefreshOnRestore() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    // popstate covers back and forward inside the app; pageshow covers the
    // browser restoring this document from its back/forward cache.
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };

    window.addEventListener("popstate", refresh);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("pageshow", onShow);
    };
  }, [router]);

  return null;
}
