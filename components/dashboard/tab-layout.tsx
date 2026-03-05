"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
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

  return (
    <div>
      <nav className="-mt-2 mb-8 flex items-center gap-4 border-b border-border">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "border-b-2 pb-2.5 text-[13px] transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <BlurReveal key={pathname}>{children}</BlurReveal>
    </div>
  );
}
