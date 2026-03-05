"use client";

import { useState, useEffect } from "react";

export function OrgLoader({ children }: { children: React.ReactNode }) {
  const FADE_DURATION_MS = 400;
  const [state, setState] = useState<"loading" | "ready" | "fading">("loading");

  useEffect(() => {
    let isMounted = true;
    let readyTimer: number | null = null;

    const startFadeOut = () => {
      // Start in the next frame so the fade class can be applied reliably.
      requestAnimationFrame(() => {
        if (!isMounted) return;
        setState("fading");
        readyTimer = window.setTimeout(() => {
          if (isMounted) setState("ready");
        }, FADE_DURATION_MS);
      });
    };

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) {
      startFadeOut();
      return () => {
        isMounted = false;
        if (readyTimer) window.clearTimeout(readyTimer);
      };
    }

    fetch("/api/v1/organization", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then(() => {
        startFadeOut();
      })
      .catch(() => {
        startFadeOut();
      });

    return () => {
      isMounted = false;
      if (readyTimer) window.clearTimeout(readyTimer);
    };
  }, []);

  return (
    <>
      {state !== "ready" && (
        <div
          className={`org-loader-overlay ${state === "fading" ? "org-loader-fade-out" : ""}`}
        >
          <div className="brand-loader" aria-label="Loading organization">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      )}
      {state === "ready" && children}
    </>
  );
}
