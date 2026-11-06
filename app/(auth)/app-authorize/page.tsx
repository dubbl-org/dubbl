"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion } from "motion/react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const PLATFORM_LABELS: Record<string, string> = {
  ios: "dubbl for iOS",
};

export default function AppAuthorizePage() {
  return (
    <Suspense>
      <AppAuthorizeContent />
    </Suspense>
  );
}

/**
 * The native app opens this page in the system browser. Signing in happens on
 * the regular sign-in page (middleware sends signed-out visitors there first),
 * so every method the web supports, including 2FA and SSO, works in the app.
 */
function AppAuthorizeContent() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const redirectUri = searchParams.get("redirect_uri") || "";
  const codeChallenge = searchParams.get("code_challenge") || "";
  const state = searchParams.get("state") || "";
  const platform = searchParams.get("platform") || "ios";
  const deviceName = searchParams.get("device_name") || undefined;
  const appName = PLATFORM_LABELS[platform] ?? "the dubbl app";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/app-auth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          state,
          platform,
          device_name: deviceName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't sign the app in");
      window.location.href = data.redirect_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign the app in");
      setLoading(false);
    }
  }

  function handleCancel() {
    // Only ever bounce back into the app, never to an arbitrary URL.
    if (!redirectUri.startsWith("dubbl://")) {
      window.location.href = "/dashboard";
      return;
    }
    const params = new URLSearchParams({ error: "access_denied", state });
    window.location.href = `${redirectUri}?${params.toString()}`;
  }

  function handleSwitchAccount() {
    const back = `${window.location.pathname}${window.location.search}`;
    signOut({ callbackUrl: `/sign-in?callbackUrl=${encodeURIComponent(back)}` });
  }

  const name = session?.user?.name || session?.user?.email;

  return (
    <div>
      <motion.div
        className="mb-7"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/[0.055]">
          <Smartphone className="size-6 text-foreground" strokeWidth={1.75} />
        </div>
        <h1 className="text-[28px] font-extrabold tracking-tight text-foreground">
          Sign in to {appName}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {deviceName ? (
            <>
              <span className="font-medium text-foreground">{deviceName}</span> will be signed in to your dubbl
              account.
            </>
          ) : (
            "This device will be signed in to your dubbl account."
          )}
        </p>
      </motion.div>

      <motion.div
        className="space-y-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        {name && (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              {session?.user?.name && session.user.email && (
                <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Not you?
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="h-11 flex-1 rounded-lg" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            className="h-11 flex-1 rounded-lg active:scale-[0.98]"
            onClick={handleContinue}
            disabled={loading || !redirectUri || !codeChallenge || !state}
          >
            {loading ? "Signing in..." : "Continue"}
          </Button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60">
          You can sign this device out any time from Account, Security.
        </p>
      </motion.div>
    </div>
  );
}
