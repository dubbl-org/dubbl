"use client";

import { useEffect, useState } from "react";
import { ChevronDown, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  title: string;
}

export function LegalToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-96px 0px -70% 0px" }
    );

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  function handleClick(id: string) {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:block">
        <div className="sticky top-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            On this page
          </p>
          <ul className="space-y-0.5 border-l border-border">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleClick(item.id)}
                  className={cn(
                    "block w-full border-l-2 py-1.5 pl-4 text-left text-[13px] leading-snug transition-colors",
                    activeId === item.id
                      ? "border-emerald-500 font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile collapsible */}
      <div className="lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
        >
          <span className="flex items-center gap-2">
            <List className="size-4 text-muted-foreground" />
            Table of Contents
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              mobileOpen && "rotate-180"
            )}
          />
        </button>
        {mobileOpen && (
          <ul className="mt-2 space-y-0.5 rounded-lg border border-border bg-card p-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleClick(item.id)}
                  className={cn(
                    "block w-full rounded-md px-3 py-2 text-left text-[13px] transition-colors",
                    activeId === item.id
                      ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
