"use client";

import { setActiveOrgId } from "@/lib/active-org";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shared/logo";

export function OrgLoader({ children }: { children: React.ReactNode }) {
  const FADE_DURATION_MS = 400;
  const [state, setState] = useState<"loading" | "ready" | "fading">("loading");
  // Invite acceptance happens before the user has any org; don't bounce
  // brand-new invitees to onboarding mid-invite.
  const pathname = usePathname();
  const isInvitePage = pathname?.startsWith("/invite/") ?? false;

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

    // A returning visitor already has an org in localStorage: reveal the shell
    // immediately instead of holding the whole app behind another round trip.
    // The lookup below still runs and still redirects if the org is gone.
    if (orgId && !isInvitePage) startFadeOut();

    fetch("/api/v1/organization", { headers })
      .then((r) => r.json())
      .then((data) => {
        // Single org response (header was sent)
        const org = data.organization
          // List response (no header) - pick the first org
          ?? data.organizations?.[0];

        if (org) {
          // Persist the resolved org for both storage kinds. Idempotent, and it
          // is what backfills the cookie that server components read.
          if (org.id) setActiveOrgId(org.id);
          if (org.country === null && !isInvitePage) {
            window.location.href = "/onboarding";
            return;
          }
        } else if (!isInvitePage) {
          // User has no orgs at all, redirect to onboarding
          window.location.href = "/onboarding";
          return;
        }
        startFadeOut();
      })
      .catch(() => {
        startFadeOut();
      });

    return () => {
      isMounted = false;
      if (readyTimer) window.clearTimeout(readyTimer);
    };
  }, [isInvitePage]);

  return (
    <>
      {state !== "ready" && (
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
      {state === "ready" && children}
    </>
  );
}
