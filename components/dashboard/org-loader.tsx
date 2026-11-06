"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Logo } from "@/components/shared/logo";

const noSubscribe = () => () => {};

export function OrgLoader({ children }: { children: React.ReactNode }) {
  const FADE_DURATION_MS = 400;
  const [state, setState] = useState<"loading" | "ready" | "fading">("loading");
  // Signed in here before: open the app straight away and check the org behind it.
  // Only a first visit waits on the splash.
  const known = useSyncExternalStore(noSubscribe, () => !!localStorage.getItem("activeOrgId"), () => false);

  useEffect(() => {
    let isMounted = true;
    let readyTimer: number | null = null;

    const startFadeOut = () => {
      requestAnimationFrame(() => {
        if (!isMounted) return;
        setState("fading");
        readyTimer = window.setTimeout(() => {
          if (isMounted) setState("ready");
        }, FADE_DURATION_MS);
      });
    };

    const orgId = localStorage.getItem("activeOrgId");
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    fetch("/api/v1/organization", { headers })
      .then((r) => r.json())
      .then((data) => {
        // Single org response (header was sent)
        const org = data.organization
          // List response (no header) - pick the first org
          ?? data.organizations?.[0];

        if (org) {
          // Persist resolved org for OAuth users who don't have it set yet
          if (!orgId && org.id) {
            localStorage.setItem("activeOrgId", org.id);
          }
          if (org.country === null) {
            window.location.href = "/onboarding";
            return;
          }
          if (orgId) return;
        } else {
          // User has no orgs at all, redirect to onboarding
          window.location.href = "/onboarding";
          return;
        }
        startFadeOut();
      })
      .catch(() => {
        if (!orgId) startFadeOut();
      });

    return () => {
      isMounted = false;
      if (readyTimer) window.clearTimeout(readyTimer);
    };
  }, []);

  return (
    <>
      {state !== "ready" && !known && (
        <div
          className={`org-loader-overlay ${state === "fading" ? "org-loader-fade-out" : ""}`}
        >
          <div className="flex flex-col items-center gap-4">
            <Logo className="org-loader-logo h-10 w-auto" />
            <span className="text-sm font-medium tracking-tight text-muted-foreground/60">
              dubbl
            </span>
          </div>
        </div>
      )}
      {(state === "ready" || known) && children}
    </>
  );
}
