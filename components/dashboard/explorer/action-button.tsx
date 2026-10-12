"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** POST to an API route with the active workspace, returning the parsed body. */
export async function postJson<T = Record<string, unknown>>(url: string, body?: unknown) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: unknown };
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
  return data;
}

/** A compact button that runs an action, shows a spinner and reports the result. */
export function ActionButton({
  children,
  icon,
  run,
  success,
  primary,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  /** Return `false` when the user backed out (e.g. at a confirm), so no success toast shows. */
  run: () => Promise<unknown>;
  success?: string;
  primary?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await run();
          if (success && result !== false) toast.success(success);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setBusy(false);
        }
      }}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors disabled:opacity-60",
        primary ? "bg-foreground text-background hover:opacity-90" : "border border-border/80 hover:bg-foreground/[0.03]",
        className
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}
