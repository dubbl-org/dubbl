"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Fetch a file from the API and save it. A plain `<a href>` can't send the
 * x-organization-id header, so it fails for anyone in more than one
 * organization; this sends the active organization like every other API call.
 */
export async function downloadFile(url: string, fallbackName: string) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, { headers: orgId ? { "x-organization-id": orgId } : {} });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof data.error === "string" ? data.error : "Couldn't download the file");
  }
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = match?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

/** A link-styled button that downloads an API file with the org header. */
export function DownloadLink({
  href,
  filename,
  className,
  children,
}: {
  href: string;
  filename: string;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(href, filename);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't download the file");
        } finally {
          setBusy(false);
        }
      }}
      className={cn("disabled:opacity-60", className)}
    >
      {children}
    </button>
  );
}
