"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

type State = "loading" | "ready" | "accepting" | "success" | "error";

interface InviteInfo {
  orgName: string;
  role: string;
  inviterName: string;
  type: "email" | "link";
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Determine if this is an email invite token (64 chars hex) or link token (32 chars hex)
  const isLinkToken = token.length === 32;

  useEffect(() => {
    // Try to load invite info
    async function loadInfo() {
      try {
        if (isLinkToken) {
          // For link tokens, try to get link info
          const res = await fetch(`/api/v1/invite-links/info?token=${token}`);
          if (res.ok) {
            const data = await res.json();
            setInfo({ orgName: data.orgName, role: data.defaultRole, inviterName: "", type: "link" });
            setState("ready");
          } else {
            const data = await res.json().catch(() => ({}));
            setError(data.error || "Invalid invite link");
            setState("error");
          }
        } else {
          // For email tokens, try to get invitation info
          const res = await fetch(`/api/v1/invitations/info?token=${token}`);
          if (res.ok) {
            const data = await res.json();
            setInfo({ orgName: data.orgName, role: data.role, inviterName: data.inviterName, type: "email" });
            setState("ready");
          } else {
            const data = await res.json().catch(() => ({}));
            setError(data.error || "Invalid invitation");
            setState("error");
          }
        }
      } catch {
        setError("Failed to load invitation");
        setState("error");
      }
    }
    loadInfo();
  }, [token, isLinkToken]);

  async function handleAccept() {
    setState("accepting");
    try {
      const endpoint = isLinkToken ? "/api/v1/invite-links/join" : "/api/v1/invitations/accept";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to accept invitation");
        setState("error");
        return;
      }
      setOrgId(data.organizationId);
      setState("success");
    } catch {
      setError("Something went wrong");
      setState("error");
    }
  }

  function goToDashboard() {
    if (orgId) {
      localStorage.setItem("activeOrgId", orgId);
    }
    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <Logo className="h-7 w-9" />
            <span className="text-lg font-bold tracking-tight text-emerald-600">dubbl</span>
          </div>

          {state === "loading" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="size-8 text-muted-foreground animate-spin" />
              <p className="mt-4 text-sm text-muted-foreground">Loading invitation...</p>
            </div>
          )}

          {state === "ready" && info && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Join {info.orgName}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {info.type === "email" && info.inviterName
                    ? `${info.inviterName} invited you to join as a `
                    : "You've been invited to join as a "}
                  <span className="font-medium text-foreground">{info.role}</span>.
                </p>
              </div>

              <div className="rounded-lg bg-muted/50 p-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
                  <Users className="size-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">{info.orgName}</p>
                  <p className="text-xs text-muted-foreground capitalize">Role: {info.role}</p>
                </div>
              </div>

              <Button
                onClick={handleAccept}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                size="lg"
              >
                Accept Invitation
              </Button>
            </div>
          )}

          {state === "accepting" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="size-8 text-emerald-600 animate-spin" />
              <p className="mt-4 text-sm text-muted-foreground">Joining organization...</p>
            </div>
          )}

          {state === "success" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
                  <CheckCircle2 className="size-6 text-emerald-600" />
                </div>
                <h1 className="mt-4 text-xl font-semibold">You&apos;re in!</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  You&apos;ve joined {info?.orgName || "the organization"} successfully.
                </p>
              </div>
              <Button
                onClick={goToDashboard}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                size="lg"
              >
                Go to Dashboard
              </Button>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                  <XCircle className="size-6 text-red-600" />
                </div>
                <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => router.push("/")}>
                  Go Home
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => router.push("/sign-in")}>
                  Sign In
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
