"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Mail,
  ArrowLeft,
  Settings,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { cn } from "@/lib/utils";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/organizations", label: "Organizations", icon: Building2 },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/admin/email-preview", label: "Email Preview", icon: Mail },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSiteAdmin, setIsSiteAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/check")
      .then((r) => r.json())
      .then((data) => setIsSiteAdmin(data.isSiteAdmin === true))
      .catch(() => setIsSiteAdmin(false));
  }, []);

  if (isSiteAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
      </div>
    );
  }

  if (!isSiteAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <Logo className="h-8 w-auto opacity-20" />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-lg font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            The page you are looking for does not exist or you do not have permission to access it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="size-3.5 mr-1.5" />
          Back to Home
        </Button>
      </div>
    );
  }

  // Detect detail pages (e.g. /admin/organizations/[id])
  const isDetailPage =
    !ALL_ITEMS.some((t) => (t.exact ? pathname === t.href : pathname === t.href)) &&
    ALL_ITEMS.some((t) => pathname.startsWith(t.href + "/"));

  return (
    <div className="flex min-h-screen">
      {/* Left sidebar */}
      {!isDetailPage && (
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar">
          <div className="flex h-14 items-center gap-2.5 px-5">
            <Logo className="h-5 w-auto" />
            <span className="text-[14px] font-semibold tracking-tight">dubbl</span>
            <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              Admin
            </span>
          </div>

          <nav className="flex flex-1 flex-col gap-6 px-4 py-4">
            {GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Icon className="size-3.5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t px-4 py-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back to App
            </Link>
          </div>
        </aside>
      )}

      {/* Mobile header */}
      <div className="md:hidden fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2">
          {isDetailPage ? (
            <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => router.back()}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          ) : (
            <>
              <Logo className="h-5 w-auto" />
              <span className="text-sm font-semibold">Admin</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="[&_button]:size-6 [&_button_svg]:size-3" />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="size-3.5 mr-1" />
              App
            </Link>
          </Button>
        </div>
      </div>

      {/* Mobile tabs */}
      {!isDetailPage && (
        <nav className="md:hidden fixed inset-x-0 top-14 z-40 flex items-center gap-1 overflow-x-auto border-b bg-background px-4 scrollbar-none">
          {ALL_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {!isDetailPage && (
          <div className="hidden md:flex h-14 items-center justify-end border-b px-6">
            <ThemeToggle className="[&_button]:size-6 [&_button_svg]:size-3" />
          </div>
        )}
        {isDetailPage && (
          <div className="hidden md:flex h-14 items-center gap-3 border-b px-6">
            <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => router.back()}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <div className="flex-1" />
            <ThemeToggle className="[&_button]:size-6 [&_button_svg]:size-3" />
          </div>
        )}
        <div className={cn(
          "mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-8 sm:py-8",
          !isDetailPage && "md:mt-0 mt-24",
          isDetailPage && "md:mt-0 mt-14"
        )}>
          <BlurReveal key={pathname}>{children}</BlurReveal>
        </div>
      </main>
    </div>
  );
}
