"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  badge?: string | number;
}

export function TabLayout({
  tabs,
  children,
}: {
  tabs: Tab[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Hide tabs on detail pages (path has more segments than any tab href)
  const isDetailPage = !tabs.some((tab) =>
    tab.exact ? pathname === tab.href : pathname === tab.href
  ) && tabs.some((tab) => pathname.startsWith(tab.href + "/"));

  // On detail pages, keep the blur key stable so sub-tab navigation
  // doesn't re-animate the entire layout. Use the tab href + first
  // extra segment (the ID) as a stable key.
  let blurKey = pathname;
  if (isDetailPage) {
    const matchedTab = tabs.find((tab) => pathname.startsWith(tab.href + "/"));
    if (matchedTab) {
      const rest = pathname.slice(matchedTab.href.length + 1);
      const idSegment = rest.split("/")[0];
      blurKey = `${matchedTab.href}/${idSegment}`;
    }
  }

  return (
    <div>
      {!isDetailPage && (
        <nav className="-mt-2 mb-6 sm:mb-8 flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {Icon && <Icon className="size-3.5" />}
                {tab.label}
                {tab.badge != null && (
                  <span className="ml-1 flex size-4.5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    {tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
      <BlurReveal key={blurKey}>{children}</BlurReveal>
    </div>
  );
}
