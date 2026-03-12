"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertTriangle className="size-6 text-red-500" />
      </div>
      <h3 className="mt-4 text-sm font-medium">Something went wrong</h3>
      <p className="mt-1.5 text-xs text-muted-foreground max-w-[300px]">
        {message || "Failed to load data. Please check your connection and try again."}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 h-7 text-xs gap-1.5"
          onClick={onRetry}
        >
          <RefreshCw className="size-3" />
          Try again
        </Button>
      )}
    </div>
  );
}
