"use client";

import { cn } from "@/lib/utils";

export function Stagger({
  children,
  className,
  index,
}: {
  children: React.ReactNode;
  className?: string;
  index: number;
}) {
  return (
    <div
      className={cn("animate-stagger-fade-up", className)}
      style={{ "--stagger-order": index } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
