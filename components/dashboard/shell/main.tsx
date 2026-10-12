"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** The white sheet that holds the page. It scrolls on its own, so reset it per route. */
export function ShellMain({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <main
      ref={ref}
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-content-bg md:rounded-xl md:border md:border-border/80 md:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      {children}
    </main>
  );
}
