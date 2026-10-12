"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { useShellSubnav } from "@/components/dashboard/shell/shell-context";
import { findActiveHref } from "@/components/dashboard/shell/nav";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  badge?: string | number;
  title?: string;
  /** Heading for this tab's group in the side panel. Tabs that share one sit together. */
  group?: string;
}

export function TabLayout({
  tabs,
  children,
}: {
  tabs: Tab[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Consecutive tabs with the same group become one labelled section in the panel.
  const sections: { label?: string; items: Omit<Tab, "icon" | "group">[] }[] = [];
  for (const { href, label, exact, badge, title, group } of tabs) {
    const last = sections[sections.length - 1];
    const item = { href, label, exact, badge, title };
    if (last && last.label === group) last.items.push(item);
    else sections.push({ label: group, items: [item] });
  }
  useShellSubnav(sections);
  // Longest match wins, so /accounting/banking/batches doesn't also light up /accounting/banking
  const activeHref = findActiveHref(pathname, sections);

  // Hide tabs on detail pages (path has more segments than any tab href)
  const isDetailPage = !tabs.some((tab) =>
    tab.exact ? pathname === tab.href : pathname === tab.href
  ) && tabs.some((tab) => pathname.startsWith(tab.href + "/"));

  // On detail pages, keep the blur key stable so sub-tab navigation
  // doesn't re-animate the entire layout. Use the tab href + first
  // extra segment (the ID) as a stable key.
  let blurKey = pathname;
  if (isDetailPage) {
    const matchedTab = tabs.find((tab) => tab.href === activeHref) ?? tabs.find((tab) => pathname.startsWith(tab.href + "/"));
    if (matchedTab) {
      const rest = pathname.slice(matchedTab.href.length + 1);
      const idSegment = rest.split("/")[0];
      blurKey = `${matchedTab.href}/${idSegment}`;
    }
  }

  return (
    <div>
      {!isDetailPage && (
        <nav className="-mt-2 mb-6 sm:mb-8 flex lg:hidden items-center gap-1 overflow-x-auto border-b border-border scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.href === activeHref;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                title={tab.title}
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
