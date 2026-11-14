"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared error boundary body.
 *
 * The app has no error.tsx anywhere, so a thrown error in a client component
 * replaces the whole segment with Next's default screen. This keeps the shell
 * (sidebar, header) and offers a retry, and it logs the digest so the failure
 * can be found in the server logs.
 */
export function ErrorFallback({
  error,
  reset,
  label = "Something went wrong",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  label?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border p-6 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
          <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold">{label}</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || "This screen could not be loaded."}
          </p>
          {error.digest && (
            <p className="font-mono text-[11px] text-muted-foreground/70">ref {error.digest}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" onClick={() => reset()}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
