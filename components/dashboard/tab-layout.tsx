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
              </Link>
            );
          })}
        </nav>
      )}
      <BlurReveal key={pathname}>{children}</BlurReveal>
    </div>
  );
}
